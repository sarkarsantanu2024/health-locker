# PROGRESS

Running log of the phased build. A fresh session should read this first, then
`AGENTS.md` for the architecture rules.

| Phase | Title | Status |
| --- | --- | --- |
| 0 | Scaffold (Vercel-ready) | ✅ Done — acceptance criteria met |
| 1 | Data model (Neon + Prisma) | ⏭️ Next |
| 2 | Auth (username/password, admin-provisioned) + RBAC + tenancy | ⬜ |
| 3 | Patient core (records, timeline, family) | ⬜ |
| 4 | Uploads + AI pipeline (serverless) | ⬜ |
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
5. **`ENCRYPTION_KEY` is defined but unused.** Column-level encryption lands with
   the sensitive tables in Phase 1/13.
6. **Prisma warns that `package.json#prisma` is deprecated** (removed in Prisma 7).
   Migrating to `prisma.config.ts` also disables Prisma's automatic `.env` loading,
   so it is deliberately postponed to the Phase 14 DevOps pass.
