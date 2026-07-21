"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getSession,
  isPlatformRole,
  requireAuthenticated,
  requirePermission,
} from "@/lib/auth/session";
import { buildTotpUri } from "@/lib/auth/totp";
import {
  beginTotpEnrolment,
  changeOwnPassword,
  confirmTotpEnrolment,
  disableTotp,
  login,
  logout,
} from "@/modules/identity/auth.service";
import {
  createUser,
  platformScope,
  resetPassword,
  setUserActive,
  tenantScope,
  type ActorScope,
  type ProvisionedCredentials,
} from "@/modules/identity/provisioning.service";
import { registerConsumer } from "@/modules/identity/signup.service";
import { PORTAL_BY_ROLE, type Role } from "@/shared/enums";
import { AppError } from "@/shared/errors";
import {
  changePasswordSchema,
  createUserSchema,
  disableTotpSchema,
  enrollTotpSchema,
  loginSchema,
  resetPasswordSchema,
  setUserActiveSchema,
  signupSchema,
} from "@/shared/schemas/auth";

/**
 * Server actions for the identity module. Each one: validate with zod → guard →
 * call the service. No business logic lives here.
 */

/**
 * Turns a session into a provisioning scope.
 *
 * Provider org admins hold the same `user:*` permissions as platform staff, so
 * the permission check alone is not enough — it says they may manage users, not
 * *which* users. A caller with an `orgId` is confined to it; only a platform
 * role acts across tenants.
 */
function actorScope(actor: { id: string; role: Role; orgId: string | null }): ActorScope {
  return isPlatformRole(actor.role) ? platformScope(actor.id) : tenantScope(actor.id, actor.orgId);
}

export interface ActionState {
  ok: boolean;
  error?: string;
  /** Human-readable confirmation for a successful action. */
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Set when the server needs the form to reveal the 2FA input. */
  needsTotp?: boolean;
  credentials?: ProvisionedCredentials;
}

async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null;
}

function toActionState(error: unknown): ActionState {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: error.message,
      needsTotp: (error.details as { reason?: string } | undefined)?.reason === "TOTP_REQUIRED",
    };
  }

  console.error("[identity action] unexpected error", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    totp: formData.get("totp") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let destination: string;

  try {
    const result = await login(parsed.data, await clientIp());
    // A provisioned account can go exactly one place until it rotates its
    // temporary password.
    destination = result.mustChangePassword
      ? "/change-password"
      : PORTAL_BY_ROLE[result.role as Role];
  } catch (error) {
    return toActionState(error);
  }

  // redirect() throws internally, so it must sit outside the try/catch.
  redirect(destination);
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    addressLine: formData.get("addressLine"),
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    planId: formData.get("planId"),
    consent: formData.get("consent") === "on",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await registerConsumer(parsed.data, await clientIp());
  } catch (error) {
    if (error instanceof AppError && (error.details as { field?: string } | undefined)?.field) {
      const field = (error.details as { field: string }).field;
      return { ok: false, fieldErrors: { [field]: [error.message] } };
    }
    return toActionState(error);
  }

  redirect("/signup/submitted");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  await logout(session?.sessionId);
  redirect("/login");
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let destination: string;

  try {
    // requireAuthenticated, not requireUser: this is the one action a user with
    // mustChangePassword is allowed to perform.
    const session = await requireAuthenticated();
    await changeOwnPassword(
      session.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      await clientIp(),
    );
    destination = PORTAL_BY_ROLE[session.role];
  } catch (error) {
    return toActionState(error);
  }

  // The session was revoked by the password change; the user signs in again.
  redirect(`/login?changed=1&next=${encodeURIComponent(destination)}`);
}

export interface TotpEnrolmentState extends ActionState {
  secret?: string;
  uri?: string;
}

/**
 * Mints a fresh TOTP secret. Deliberately an action rather than something the
 * account page computes while rendering: generating on render would rotate the
 * secret on every reload and break an enrolment already in progress.
 */
export async function beginTotpAction(): Promise<TotpEnrolmentState> {
  try {
    const session = await requireAuthenticated();

    if (session.twoFactorEnabled) {
      return { ok: false, error: "Two-factor is already on. Turn it off first to re-enrol." };
    }

    const { secret } = await beginTotpEnrolment(session.id);

    return { ok: true, secret, uri: buildTotpUri(secret, session.username) };
  } catch (error) {
    return toActionState(error);
  }
}

export async function confirmTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = enrollTotpSchema.safeParse({ code: formData.get("code") });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const session = await requireAuthenticated();
    await confirmTotpEnrolment(session.id, parsed.data.code, await clientIp());
    return { ok: true };
  } catch (error) {
    return toActionState(error);
  }
}

export async function disableTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = disableTotpSchema.safeParse({ password: formData.get("password") });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const session = await requireAuthenticated();
    await disableTotp(session.id, parsed.data.password, await clientIp());
    return { ok: true };
  } catch (error) {
    return toActionState(error);
  }
}

// --- admin provisioning ----------------------------------------------------

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createUserSchema.safeParse({
    displayName: formData.get("displayName"),
    role: formData.get("role"),
    orgId: formData.get("orgId") ?? "",
    username: formData.get("username") ?? "",
    phone: formData.get("phone") ?? "",
    planId: formData.get("planId") ?? "",
    accessRequestId: formData.get("accessRequestId") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const actor = await requirePermission("user:create");
    const credentials = await createUser(parsed.data, actorScope(actor));
    // Returned to the caller so the UI can show a copy-once panel. This is the
    // only moment the plaintext exists outside the admin's clipboard.
    return { ok: true, credentials };
  } catch (error) {
    return toActionState(error);
  }
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const actor = await requirePermission("user:reset-password");
    const credentials = await resetPassword(
      parsed.data.userId,
      actorScope(actor),
      parsed.data.reason || undefined,
    );
    return { ok: true, credentials };
  } catch (error) {
    return toActionState(error);
  }
}

export async function setUserActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = setUserActiveSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active") === "true",
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const actor = await requirePermission("user:suspend");
    await setUserActive(
      parsed.data.userId,
      parsed.data.active,
      actorScope(actor),
      parsed.data.reason || undefined,
    );

    revalidatePath("/admin/users");
    if (actor.orgId) revalidatePath(`${PORTAL_BY_ROLE[actor.role]}/users`);
    return {
      ok: true,
      message: parsed.data.active ? "Account activated." : "Account suspended and signed out.",
    };
  } catch (error) {
    return toActionState(error);
  }
}
