# PROGRESS

Running log of the phased build. A fresh session should read this first, then
`AGENTS.md` for the architecture rules.

| Phase | Title | Status |
| --- | --- | --- |
| 0 | Scaffold (Vercel-ready) | ✅ Done — acceptance criteria met |
| 1 | Data model (Neon + Prisma) | ✅ Done — acceptance criteria met |
| 2 | Auth + RBAC + tenancy (**self-registration**, see below) | ✅ Done — acceptance criteria met |
| 3 | Patient core (records, timeline, family) | ✅ Done — acceptance criteria met |
| 4 | Uploads + AI pipeline (serverless) | ⏭️ Next — **blocked**: needs R2 + Upstash + AI key |
| 5 | Notifications (Web Push + in-app; no email) | ⬜ |
| 6 | Manual payments (UPI / QR / bank) + subscriptions | ⬜ |
| 7 | Clinic portal | ⬜ |
| 8 | Hospital portal | ⬜ |
| 9 | Diagnostic centre portal | ⬜ |
| 10 | Pharmacy portal | ⬜ |
| 11 | Admin & Super Admin | ⬜ |
| 12 | PWA / mobile | ⬜ |
| 13 | Security & compliance | ⬜ |
| 14 | DevOps / CI-CD (Vercel-native) | ⬜ |
| 15 | Testing & QA | ⬜ |
| 16 | Production launch checklist | ⬜ |

---

## Phase 0 — Scaffold (Vercel-ready)

**Decisions taken**

- App name: **HealthLocker**. Package manager: **pnpm 11.15.1** (via corepack).
- Next.js 16.2.10 (App Router, Turbopack), React 19.2, Tailwind v4, TypeScript strict.
- Optional cloud services (Upstash, R2, Web Push, AI keys) are validated **lazily**
  at the point of use rather than at boot, so `pnpm dev` works with nothing but a
  Postgres URL and a JWT secret. Required-vs-optional split lives in `src/lib/env.ts`.
- Password hashing uses `@node-rs/argon2` (argon2id, 19 MiB / t=2) — fast enough
  for a serverless function, no native build step on Vercel.
- Region pinned to `bom1` (Mumbai) in `vercel.json`, matching the India-first
  assumption.

**Shipped**

- `src/lib/env.ts` — zod-validated config, fail-fast with a readable error listing
  every missing var; `requireRedisEnv()` / `requireR2Env()` / `requireQStashEnv()` /
  `requireWebPushEnv()` for lazy per-service assertions.
- `src/lib/db.ts` — Prisma singleton on `globalThis` (survives lambda reuse).
- `src/lib/auth/` — `password.ts` (argon2 hash/verify, temporary-password and
  username generators that avoid look-alike glyphs), `jwt.ts` (jose HS256 access +
  refresh tokens), `cookies.ts` (httpOnly session cookies).
- `src/lib/r2.ts` — S3 client + presigned upload/download; MinIO-compatible.
- `src/lib/upstash.ts` — lazily-created Redis, QStash client and signature Receiver.
- `src/lib/webpush.ts` — VAPID sender that reports expired subscriptions.
- `src/lib/ai/` — `AiService` interface (ocr, extractMedicines, analyzeReport,
  summarize, detectDrugInteractions, detectDuplicates) + deterministic mock adapter
  + provider selection.
- `src/shared/` — role/org/status enums, portal map, standard API error shape.
- `src/app/api/v1/health/route.ts` — live `SELECT 1` against Postgres plus a
  configured/not-configured report for each optional service.
- `src/app/page.tsx` — landing page rendering the same status, with a real
  remediation hint when the DB is unreachable.
- `prisma/schema.prisma` — Phase 0 baseline: `Organization`, `User`, `AuditLog`.
- `scripts/create-super-admin.ts` — bootstraps the only login that can exist
  without an admin; prints the password once.
- `prisma/seed.ts` — platform organization only (no users: accounts are provisioned).
- `infra/.env.example` (every variable, documented) and `infra/docker-compose.yml`
  (Postgres + optional MinIO with the bucket pre-created).
- `vercel.json` — region, security headers, `no-store` on `/api/*`.
- `.github/workflows/ci.yml` — lint, typecheck, test, migrate and build against a
  Postgres service container, with no real cloud credentials.
- Vitest with 21 tests covering env validation, argon2 hashing, temp-credential
  generation, JWT round-trip/tamper/type-confusion, and every mock AI method.

**Verified**

- `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (21/21), `pnpm build`
  all pass.
- Neon project provisioned: AWS `ap-southeast-1` (Singapore), Postgres 17,
  database `healthlocker`. Singapore rather than the default US East because
  Vercel functions run in `bom1` (Mumbai) — ~30 ms per round trip instead of ~200 ms.
- `20260720113237_init` migration applied to Neon; `pnpm db:seed` created the
  platform organization; `pnpm create-super-admin` created the first login.
- `pnpm dev` boots and `/api/v1/health` returns
  `{"status":"ok","db":{"status":"ok","latencyMs":700}}` through the **pooled**
  connection, and `/` renders live counts (1 organization, 1 user). Acceptance
  criteria met.
- The error path was verified too: with no database reachable the same route
  returns HTTP 503 in the standard `{ error: { code, message, details } }` shape.

**Open items / deferred**

1. **Not deployed to Vercel yet.** The repo is pushed; the env vars
   (`DATABASE_URL`, `DIRECT_URL`, `AUTH_JWT_SECRET`, `APP_URL`, `AI_PROVIDER`)
   still have to be set in the Vercel project before a deploy succeeds. The first
   deploy failed precisely because `src/lib/env.ts` fails fast on missing config.
2. **Migrations are not applied automatically on deploy.** `pnpm build` runs
   `prisma generate && next build` only. Changing it to include
   `prisma migrate deploy` would keep production schema in step with every deploy;
   deferred pending a decision, since it also means a bad migration ships with a
   bad build.
3. **shadcn/ui not initialised.** Design tokens, the `cn()` helper and the base
   layout are in place; components get added in Phase 2 when the first real screens
   (login, app shell) exist, so we do not vendor unused components now.
4. **`AI_PROVIDER=gemini|groq` throws by design** — those adapters are Phase 4.
   `mock` is the default everywhere including CI.
5. **Prisma warns that `package.json#prisma` is deprecated** (removed in Prisma 7).
   Migrating to `prisma.config.ts` also disables Prisma's automatic `.env` loading,
   so it is deliberately postponed to the Phase 14 DevOps pass.

*(`ENCRYPTION_KEY` unused — closed in Phase 1: it now backs `src/lib/crypto.ts`.)*

---

## Phase 1 — Data model (Neon + Prisma)

**Decisions taken**

- **Money is `Int` paise**, never a float, on every `*Minor` column. Floating-point
  rupees drift, and this is billing data.
- **`Patient` is separable from `User`.** A clinic registers walk-ins and children
  rarely have logins, so requiring an account to hold a record would have forced
  fake users.
- **Tenancy for patient data runs through `PatientOrgLink`**, not a column on
  `Patient`. A patient legitimately belongs to several providers; an `orgId` on
  the patient would have made the second provider impossible.
- **`FamilyLink` is directed.** Priya managing her child's record must not imply
  the child manages hers. Mutual access is two rows, written deliberately.
- **`PaymentSubmission.utr` is globally unique**, not unique per request. An Indian
  bank reference identifies exactly one real transfer, so reuse across *different*
  requests is the fraud case — per-request uniqueness would have missed it.
- **`PaymentRequest.refCode` is short uppercase-alphanumeric**, not a cuid, because
  it goes in the UPI deep link's `tr` parameter which several UPI apps truncate.
- **Column encryption is AES-256-GCM with a `v1.` version prefix** so the key can
  be rotated later without guessing at the payload shape.
- **Permissions are seeded from code and revoked on re-seed.** Removing a grant in
  `src/shared/permissions.ts` deletes the row; a stale grant is a security hole.

**Shipped**

- `prisma/schema.prisma` — ~45 models over six domains (identity, patient,
  clinical, documents-ai, commerce, notify, ops) with `orgId` tenancy,
  soft-delete, FKs, unique constraints and indexes throughout.
- `src/shared/enums.ts` — every enum mirrored from Prisma, plus role/portal maps.
- `src/shared/permissions.ts` — 53-action catalogue and the deny-by-default role
  matrix, composed so an org admin is provably a superset of its staff role.
- `src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt, nullable helpers, identifier
  masking, constant-time compare. Backs every `*Enc` column.
- `prisma/seed.ts` — idempotent: permissions, 4 plans, 5 tenants, 2 departments,
  1 practitioner, the demo family, and an encrypted platform merchant profile.
  Creates **no** accounts unless `--demo-users` is passed (refused in production).
- `docs/data-model.md` — ER description with mermaid diagrams per domain and the
  reasoning behind the non-obvious choices.
- `tests/data-model.integration.test.ts` + `vitest.integration.config.ts` — a
  second, database-backed test project so `pnpm test` stays hermetic.
- CI now migrates, seeds, bootstraps a Super Admin and runs both suites.

**Verified**

- `20260720121257_full_domain_model` applied to Neon; `prisma validate` clean.
- Seed run twice — counts identical, so it is genuinely idempotent.
- `pnpm test` 64/64 unit; `pnpm test:integration` 15/15 against live Neon.
- Tenant scoping proven: the clinic query returns exactly Priya + Aarav, and
  Sunita (hospital-registered) is absent. The reverse family link does not exist.
- Encryption proven end to end: `upiVpaEnc` is stored as `v1.…` ciphertext,
  contains no plaintext, and decrypts to the original.
- `pnpm lint`, `pnpm typecheck`, `next build` all clean.

**Open items / deferred**

1. **No zod schemas yet.** Section 1 wants shared zod schemas as the source of
   truth for input validation. Enums and the permission catalogue are in place;
   the per-entity input schemas are written in Phase 2+ alongside the forms that
   need them, rather than speculatively.
2. **`PharmacyOrder.prescriptionId` is a plain column, not a foreign key.** It
   points at a `Prescription` but is intentionally unconstrained until Phase 10
   settles whether a pharmacy may dispense against an out-of-network Rx.
3. **`Document.storageKey` rows can outlive their R2 object.** Orphan reaping is a
   Phase 4 job route once uploads actually exist.
4. **`create-super-admin` still writes a raw AuditLog row.** It should go through
   the audit service once Phase 2 introduces one.

---

## Phase 2 — Auth + RBAC + tenancy

### ⚠️ Requirement change: consumers now self-register

The original Section 0 rule was *no self-registration; Super Admin creates every
account and hands over credentials out-of-band*. On 2026-07-20 the product owner
changed this. The agreed model:

- **Consumers self-register** at `/signup` choosing their **own** username and
  password. Name, phone/WhatsApp, address, city, state and PIN code are all
  mandatory, plus an explicit consent checkbox.
- The account is created **`PENDING_ACTIVATION`** and **cannot sign in**. The
  manual-payment gate is unchanged: a Super Admin verifies payment, then
  activates. So nobody has to WhatsApp a password any more, but nothing is given
  away for free.
- **Providers are still admin-provisioned.** A self-registered "hospital admin"
  could otherwise claim a tenant that is not theirs.
- **Admins reset to a temporary password; they cannot set an exact one.** An
  admin who can choose a password can silently impersonate a patient.

Consequence: the acceptance criterion "only admin-created users can log in" is
now **"only activated users can log in"**, which is what the tests assert.
Phases 6 and 11 are unaffected — signup still creates the `AccessRequest` their
queues key off.

**Decisions taken**

- **`UserStatus.PENDING_ACTIVATION`** added, distinct from `SUSPENDED`. One has
  never been activated, the other was switched off; both refuse login, but they
  are different rows in an admin queue and different events in the audit trail.
- **Login failures are indistinguishable.** Unknown username, wrong password and
  suspended account all return the same message, and a missing user still burns
  an argon2 verify so response timing does not leak existence.
- **Suspension is checked *after* the password**, so probing a suspended account
  with a wrong password looks identical to probing an active one.
- **Sessions are database-backed.** `getSession()` re-reads the user every
  request, so suspending someone or revoking a session takes effect immediately
  rather than when the access token expires.
- **Only a SHA-256 of the refresh token is stored**, and it is rotated on use —
  a leaked dump is not replayable and a stolen token is single-use.
- **Middleware is a redirect, not the authorization boundary.** It cannot reach
  the database, so it cannot know about suspension; `requireUser()` /
  `requirePermission()` in each action are the real enforcement.
- **`assertSameTenant` throws NOT_FOUND, not FORBIDDEN** — confirming that a
  record exists in another tenant is itself a disclosure.
- **TOTP is hand-rolled on `node:crypto`** (~40 lines, RFC 6238) rather than a
  dependency, and verified against the RFC test vector.
- **Rate limiting degrades, lockout does not.** IP throttling needs Upstash and
  falls back to per-instance memory with a loud warning; the account lockout is
  database-backed and always works.

**Shipped**

- `src/lib/auth/session.ts` — `getSession`, `requireUser`, `requireAuthenticated`,
  `requireTenant`, `requirePermission`, `requireTenantPermission`, `assertSameTenant`.
- `src/lib/auth/totp.ts` — base32 + RFC 6238 TOTP, drift window, `otpauth://` URI.
- `src/lib/audit.ts` — audit service with recursive credential redaction that
  never throws into the operation it is auditing.
- `src/lib/ratelimit.ts` — Upstash sliding window with an in-memory fallback.
- `src/modules/identity/` — `auth.service` (login, lockout, refresh rotation,
  password change, TOTP), `signup.service` (self-registration in one
  transaction), `provisioning.service` (createUser / resetPassword /
  setUserActive), `actions.ts`, `navigation.ts`.
- `src/middleware.ts` — edge redirect + forced password-change pin.
- `src/shared/schemas/auth.ts` — zod contracts (closes Phase 1 open item #1).
- Screens: `/login` (progressive 2FA), `/signup`, `/signup/submitted`,
  `/change-password`, `/account` (TOTP enrolment), the app shell, and portal
  dashboards for patient, clinic, hospital, diagnostic, pharmacy and admin.
- `src/ui/` — Button, Field/Input/Select/Label, Alert, Card, PageHeader. Written
  by hand on shadcn conventions (cva + `cn`) so `shadcn add` still works.

**Verified**

- `pnpm test` 99/99 unit; `pnpm test:integration` 36/36 against live Neon.
- All four acceptance criteria have a named test:
  - only activated users can sign in (self-registered → refused → activated → in);
  - first login forces a change, and `requireUser()` blocks everything until then;
  - cross-tenant access denied — clinic A cannot assert clinic B's rows;
  - a patient is refused `user:create`, `payment:verify`, `audit:read`, `org:manage`.
- Also proven: 5 wrong passwords lock the account and the *correct* password is
  then refused; IP throttling trips at 10/min; a password change revokes other
  sessions; sign-out revokes the row; only a hash of the refresh token is stored;
  `user.created` audit metadata contains the username but never the password.
- `/patient` and `/admin` return 307 → `/login?next=…` when signed out.
- `pnpm lint`, `pnpm typecheck`, `next build` clean; 16 routes.

**Open items / deferred**

1. **No QR code on TOTP enrolment.** The secret and `otpauth://` URI are shown
   for manual entry, which every authenticator app accepts. A QR renderer lands
   in Phase 3, which needs the same one for the emergency card.
2. **`/api/v1/auth/refresh` is not called automatically.** Rotation works and is
   tested, but nothing refreshes in the background yet — a user is signed out
   after the 15-minute access token expires. Wiring it belongs with the client
   data layer in Phase 3.
3. **Consent is captured as a checkbox, not a record.** The signup form requires
   it, but there is no `ConsentRecord` table yet — that is Phase 13 (DPDP), and
   it is worth pulling forward before real patient data arrives in Phase 3.
4. **Portal dashboards past the shell are placeholders**, each labelled with the
   phase that builds it. Nothing is silently stubbed.
5. **`create-super-admin` still writes a raw AuditLog row** (carried over from
   Phase 1) — it runs outside a request, so it needs the audit service's
   context-free path.

---

## Phase 3 — Patient core (records, timeline, family)

**Decisions taken**

- **The "acting as" cookie is never trusted.** It names a patient, but
  `getPatientContext()` re-reads the `FamilyLink` on every request to confirm the
  link still exists and what it permits. A forged or stale cookie silently falls
  back to the caller's own record instead of erroring or granting access.
- **`accessLevel` gates writes, not reads.** `requireManageContext()` is a
  separate call, so a VIEW-only link can open a relative's timeline but cannot
  change anything.
- **Family is always managed from your own record.** A MANAGE link would
  otherwise let you extend someone else's family graph on their behalf.
- **Removing a family member removes the LINK, not the record.** Soft-deleting
  someone's health data because a relationship ended would be destroying medical
  history.
- **The emergency card shows only ACTIVE conditions**, never resolved ones — a
  first responder does not need them, and sharing them is needless exposure.
- **Re-issuing a card revokes the previous token**, which is what makes a lost
  printout recoverable.
- **Unknown, revoked and expired tokens all render identically**, so a token
  cannot be probed for validity.
- **Consent tables pulled forward from Phase 13**, because Phase 3 is where real
  health data starts landing and consent recorded ten phases later would not
  cover it. Withdrawal sets `revokedAt` rather than deleting: "was there consent
  when this record was created?" must stay answerable.
- **PDF via `@react-pdf/renderer`**, not a headless browser — a Chromium binary
  would blow the Vercel function size limit and the cold start.
- **The export route takes no patient id.** It exports whichever record the
  session is acting for; an id in the URL would invite enumeration.

**Shipped**

- `src/modules/patient/context.ts` — `getPatientContext`, `requireManageContext`,
  `assertCanReadPatient`, `setActivePatient`.
- `timeline.service.ts` — merges 9 sources (prescriptions, reports, vaccinations,
  visits, vitals, conditions, allergies, expenses, documents) into one ordered
  feed, with kind/date/text filters and day grouping.
- `emergency.service.ts` — issue, revoke, resolve, and server-rendered QR SVG.
- `patient.service.ts` — profile, family graph, and DPDP consent.
- `export.pdf.tsx` + `/api/v1/patient/export` — A4 PDF of profile and history.
- Screens: `/patient/timeline` (URL-driven filters, so a filtered view is
  shareable), `/patient/family` (switcher + add/remove), `/patient/emergency`
  (QR, copy link, view counter, revoke), and the public `/emergency/[token]`.
- `ConsentRecord` model + `ConsentType` enum (migration `consent_records`).

**Verified**

- `pnpm test:integration` 57/57, including 21 new Phase 3 tests.
- Acceptance criteria each have a named test:
  - merged timeline returns all 9 sources newest-first, filters by kind/date/text,
    and never mixes one patient's records into another's;
  - family switch honours MANAGE, refuses writes on VIEW, ignores a forged
    cookie, and falls back when a link is removed;
  - emergency card exposes only opted-in sections, hides resolved conditions,
    invalidates the old token on re-issue, and returns null for revoked/expired/
    unknown/malformed tokens alike.
- Also proven: the share token never reaches the audit trail; every card view is
  counted and audited.
- Live checks: PDF export returns a real 3.3 KB `%PDF` with an attachment
  filename and refuses anonymous callers; the public emergency page renders
  without a session, shows the opted-in sections, does **not** leak vaccination
  history, and is `noindex`.
- 44 authenticated pages render cleanly (`pnpm smoke`); lint, typecheck and build
  clean.

**Open items / deferred**

1. **Profile editing has a service and schema but no screen yet.**
   `updateProfileAction` is wired and guarded; the form lands with the settings
   screen rather than being squeezed into this phase.
2. **`/patient/medicines` and `/patient/reports` remain placeholders** — they are
   fed by the Phase 4 upload/AI pipeline, so building them now would show empty
   shells with no way to fill them.
3. **Timeline paginates by cap, not cursor.** Each source is capped at 200 and
   the merged list re-capped. Fine at current volumes; a cursor is needed once a
   patient has thousands of entries.
4. **Consent is recorded but not yet enforced.** `hasConsent()` exists and the
   emergency flow writes a record; wiring it as a *gate* (no AI processing
   without `AI_PROCESSING`) belongs with Phase 4, which is the first consumer.
5. **The signup consent checkbox still does not write a `ConsentRecord`** — the
   table now exists, so this is a small follow-up in Phase 4.
