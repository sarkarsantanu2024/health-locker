"use client";

import { KeyRound, MoreHorizontal, ShieldOff, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  resetPasswordAction,
  setUserActiveAction,
  type ActionState,
} from "@/modules/identity/actions";
import { CredentialsPanel } from "@/modules/admin/credentials-panel";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

const initial: ActionState = { ok: false };

export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  orgName: string | null;
}

function statusTone(status: string): "success" | "warning" | "danger" {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING_ACTIVATION") return "warning";
  return "danger";
}

function Pending({ label, busy, variant }: { label: string; busy: string; variant?: "danger" | "primary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function UserRow({ user }: { user: AdminUserRow }) {
  const [resetState, resetAction] = useActionState(resetPasswordAction, initial);
  const [activeState, activeAction] = useActionState(setUserActiveAction, initial);
  const [open, setOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const credentials = resetState.credentials;
  const error = resetState.error ?? activeState.error;
  const isActive = user.status === "ACTIVE";
  const locked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{user.displayName}</span>
            <Badge tone={statusTone(user.status)}>
              {user.status.replace(/_/g, " ").toLowerCase()}
            </Badge>
            {locked ? <Badge tone="danger">locked</Badge> : null}
            {user.mustChangePassword ? <Badge tone="info">temp password</Badge> : null}
            {user.twoFactorEnabled ? <Badge tone="neutral">2FA</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-mono">{user.username}</span>
            {" · "}
            {user.role.replace(/_/g, " ").toLowerCase()}
            {user.orgName ? ` · ${user.orgName}` : ""}
            {user.phone ? ` · ${user.phone}` : ""}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal aria-hidden className="size-4" />
          Manage
        </Button>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-border bg-surface-2 p-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {activeState.message ? <Alert tone="success">{activeState.message}</Alert> : null}

          {credentials ? (
            <CredentialsPanel
              credentials={{
                username: credentials.username,
                temporaryPassword: credentials.temporaryPassword,
                phone: user.phone,
                displayName: user.displayName,
              }}
            />
          ) : confirmingReset ? (
            <form action={resetAction} className="space-y-3 rounded-lg border border-border bg-surface p-3">
              <input type="hidden" name="userId" value={user.id} />
              <p className="text-sm">
                This signs {user.displayName} out everywhere and issues a new temporary password.
                They must change it at next sign-in.
              </p>
              <Field label="Reason" errors={resetState.fieldErrors?.reason} optional>
                {(props) => <Input {...props} name="reason" placeholder="e.g. customer called, forgot password" />}
              </Field>
              <div className="flex gap-2">
                <Pending label="Issue new password" busy="Issuing…" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmingReset(true)}>
                <KeyRound aria-hidden className="size-4" />
                Reset password
              </Button>

              <form action={activeAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="active" value={isActive ? "false" : "true"} />
                <input
                  type="hidden"
                  name="reason"
                  value={isActive ? "Suspended from admin console" : "Reactivated from admin console"}
                />
                {isActive ? (
                  <Button type="submit" variant="danger" size="sm">
                    <ShieldOff aria-hidden className="size-4" />
                    Suspend
                  </Button>
                ) : (
                  <Button type="submit" size="sm">
                    <ShieldCheck aria-hidden className="size-4" />
                    {user.status === "PENDING_ACTIVATION" ? "Activate" : "Reactivate"}
                  </Button>
                )}
              </form>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Last sign-in:{" "}
            {user.lastLoginAt
              ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(user.lastLoginAt),
                )
              : "never"}
          </p>
        </div>
      ) : null}
    </li>
  );
}
