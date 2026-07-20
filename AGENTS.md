<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## HealthLocker — agent context

Multi-tenant SaaS healthcare platform: a digital health locker + care network.
Patients store prescriptions, reports, medicines, vaccinations, insurance and
expenses in one AI-structured timeline; providers (clinic, hospital, diagnostic
centre, pharmacy) manage appointments, reports, billing and inventory.

Portals/roles: Patient (+Family), Clinic, Hospital, Diagnostic Centre, Pharmacy,
Admin, Super Admin.

The build runs as numbered phases (0 → 16); the phase prompt is pasted in at the
start of each session. `PROGRESS.md` records what is done and what was deferred —
read it before starting work.

## Stack (lean / low-cost — do not substitute without asking)

- **App** — ONE Next.js app (App Router, TypeScript). API = route handlers under
  `src/app/api/v1/*` plus server actions for form mutations. No separate backend.
- **DB** — Neon serverless Postgres + Prisma. `DATABASE_URL` is the *pooled*
  connection; `DIRECT_URL` is direct and used only by `prisma migrate`.
- **Cache/queue/cron** — Upstash Redis + Upstash QStash. No always-on worker:
  background work is enqueued to QStash and processed by a signature-verified
  route under `src/app/api/jobs/*`.
- **Storage** — Cloudflare R2 (S3 API) via presigned uploads; MinIO locally.
- **Auth** — username + password only. Custom JWT (jose) in an httpOnly cookie,
  argon2id hashing. No email, no OAuth, no email password reset. Optional TOTP 2FA.
  - **Consumers self-register** (`/signup`) choosing their own credentials; the
    account is created `PENDING_ACTIVATION` and cannot sign in until a Super
    Admin verifies the manual payment. Name, phone/WhatsApp and full address are
    mandatory.
  - **Providers are admin-provisioned** — a self-registered provider could claim
    a tenant that is not theirs. They get a temporary password and are forced to
    change it at first login.
  - **Admins reset to a generated temporary password**; they can never set an
    exact one, because an admin who can choose a password can impersonate a patient.
- **Payments** — no gateway. Manual UPI/QR/bank collection + admin verification.
- **Notifications** — Web Push + in-app only. No email, no SMS. WhatsApp is sent
  by hand (generate the text + a `wa.me` link) until an adapter is added.
- **AI/OCR** — always via the `AiService` interface (`src/lib/ai`). Never call a
  vendor SDK from feature code. `mock` adapter is the default and powers CI.
- **Deploy** — Vercel + Neon + Upstash + R2, all free tier.

## Architecture rules

- Modules live at `src/modules/<domain>/{schema,service,actions,api,ui}` and talk
  to each other **through services, never through another module's Prisma tables**,
  so a module can later be extracted into its own service.
- Validate every input with zod; shared schemas in `src/shared` are the single
  source of truth for types.
- Authorization is deny-by-default. Every server action and route handler:
  authenticated → tenant-scoped → permission-checked.
- Multi-tenancy: every provider-owned row carries `orgId`, and scoping happens in
  a server-side guard — never by trusting a client-supplied id.
- Soft-delete + `AuditLog` on every create/update/delete of medical or financial
  data, and on every read of a medical record.
- Serverless-safe: no long-running processes, no in-memory state between
  requests, no BullMQ workers.
- Standard API error shape: `{ error: { code, message, details? } }` (see
  `src/shared/errors.ts`).

## Non-negotiables

- Health data is sensitive: encrypt sensitive columns at rest, TLS in transit,
  least privilege, log access to medical records. Follow DPDP (India) + GDPR
  principles + HIPAA-inspired safeguards.
- No stubs left in "done" work; flag anything deferred in `PROGRESS.md`.
- Tests ship with features.
- WCAG AA and responsive (mobile → desktop) on every screen.
