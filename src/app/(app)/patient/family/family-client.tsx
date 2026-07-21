"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";
import {
  addFamilyMemberAction,
  removeFamilyMemberAction,
  switchPatientAction,
  type PatientActionState,
} from "@/modules/patient/actions";
import { BLOOD_GROUPS, BLOOD_GROUP_LABELS, GENDERS, RELATIONSHIPS } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Field, Input, Select } from "@/ui/field";
import { EmptyState } from "@/ui/page-header";
import { TONE_STYLES, toneFor, toneFromString } from "@/ui/tone";

const initial: PatientActionState = { ok: false };

/** Violet is family, here and on the home screen and in the tab bar. */
const FAMILY_TONE = toneFor("family");
const family = TONE_STYLES[FAMILY_TONE];

/**
 * An initial in a coloured disc. The hue is derived from the name, so a person
 * keeps the same colour every time you see them — it means nothing clinically,
 * which is exactly why it is allowed to be arbitrary.
 */
function Avatar({ name }: { name: string }) {
  const style = TONE_STYLES[toneFromString(name)];

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
        style.chipSolid,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export interface FamilyMemberView {
  linkId: string;
  memberId: string;
  fullName: string;
  relationship: string;
  accessLevel: string;
  isActive: boolean;
}

function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function FamilyClient({
  members,
  ownName,
  ownPatientId,
  isActingForOther,
}: {
  members: FamilyMemberView[];
  ownName: string;
  ownPatientId: string;
  isActingForOther: boolean;
}) {
  const [switchState, switchAction] = useActionState(switchPatientAction, initial);
  const [addState, addAction] = useActionState(addFamilyMemberAction, initial);
  const [removeState, removeAction] = useActionState(removeFamilyMemberAction, initial);
  const [showAdd, setShowAdd] = useState(false);

  const error = switchState.error ?? addState.error ?? removeState.error;
  const message = addState.message ?? removeState.message;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Card tone="consumer" hue={FAMILY_TONE}>
        <CardHeader>
          <CardTitle>Whose records am I viewing?</CardTitle>
          <CardDescription>
            Switching changes every screen until you switch back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <form action={switchAction}>
            <input type="hidden" name="patientId" value={ownPatientId} />
            <button
              type="submit"
              aria-current={!isActingForOther ? "true" : undefined}
              className={cn(
                "press flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                !isActingForOther
                  ? cn(family.border, family.chip)
                  : "border-border hover:bg-muted",
              )}
            >
              <Avatar name={ownName} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{ownName}</span>
                <span className="block text-sm text-muted-foreground">You</span>
              </span>
              {!isActingForOther ? <Badge tone="primary">Viewing</Badge> : null}
            </button>
          </form>

          {members.map((member) => (
            <form key={member.linkId} action={switchAction}>
              <input type="hidden" name="patientId" value={member.memberId} />
              <button
                type="submit"
                aria-current={member.isActive ? "true" : undefined}
                className={cn(
                  "press flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  member.isActive
                    ? cn(family.border, family.chip)
                    : "border-border hover:bg-muted",
                )}
              >
                <Avatar name={member.fullName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.fullName}</span>
                  <span className="block text-sm text-muted-foreground">
                    {member.relationship.toLowerCase()}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {/* VIEW is worth showing: it explains why editing is unavailable. */}
                  {member.accessLevel === "VIEW" ? <Badge tone="neutral">View only</Badge> : null}
                  {member.isActive ? <Badge tone="primary">Viewing</Badge> : null}
                </span>
              </button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card tone="consumer" hue={FAMILY_TONE}>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Family members</CardTitle>
            <CardDescription>
              Add a child or parent who does not have their own account.
            </CardDescription>
          </div>
          {!isActingForOther ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd((v) => !v)}>
              <UserPlus aria-hidden className="size-4" />
              {showAdd ? "Cancel" : "Add"}
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {isActingForOther ? (
            <Alert tone="info">
              You are viewing someone else&apos;s record. Switch back to {ownName} to manage family.
            </Alert>
          ) : null}

          {showAdd && !isActingForOther ? (
            <form action={addAction} className="space-y-3 rounded-xl border border-border p-4">
              <Field label="Full name" errors={addState.fieldErrors?.fullName}>
                {(props) => <Input {...props} name="fullName" required autoFocus />}
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Relationship" errors={addState.fieldErrors?.relationship}>
                  {(props) => (
                    <Select {...props} name="relationship" defaultValue="CHILD" required>
                      {RELATIONSHIPS.filter((r) => r !== "SELF").map((r) => (
                        <option key={r} value={r}>
                          {r.charAt(0) + r.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  label="Access"
                  errors={addState.fieldErrors?.accessLevel}
                  hint="View only means you cannot edit their record."
                >
                  {(props) => (
                    <Select {...props} name="accessLevel" defaultValue="MANAGE">
                      <option value="MANAGE">Manage</option>
                      <option value="VIEW">View only</option>
                    </Select>
                  )}
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Date of birth" errors={addState.fieldErrors?.dateOfBirth}>
                  {(props) => <Input {...props} name="dateOfBirth" type="date" />}
                </Field>

                <Field label="Gender" errors={addState.fieldErrors?.gender}>
                  {(props) => (
                    <Select {...props} name="gender" defaultValue="UNDISCLOSED">
                      {GENDERS.map((g) => (
                        <option key={g} value={g}>
                          {g.charAt(0) + g.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Blood group" errors={addState.fieldErrors?.bloodGroup}>
                  {(props) => (
                    <Select {...props} name="bloodGroup" defaultValue="UNKNOWN">
                      {BLOOD_GROUPS.map((b) => (
                        <option key={b} value={b}>
                          {BLOOD_GROUP_LABELS[b]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <Pending label="Add family member" busy="Adding…" />
            </form>
          ) : null}

          {members.length === 0 ? (
            <EmptyState
              art="people"
              tone={FAMILY_TONE}
              title="No family members yet"
              description="Add a child or a parent who does not have their own account, and you can keep their records here too."
            />
          ) : (
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li key={member.linkId} className="flex items-center gap-3 py-3">
                  <Avatar name={member.fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{member.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.relationship.toLowerCase()} · {member.accessLevel.toLowerCase()}
                    </p>
                  </div>

                  {!isActingForOther ? (
                    <form action={removeAction}>
                      <input type="hidden" name="linkId" value={member.linkId} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            Removing someone unlinks them from your account. Their health records are not deleted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
