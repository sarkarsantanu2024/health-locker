# HealthLocker

A multi-tenant SaaS healthcare platform — a digital health locker and care
network. Patients keep prescriptions, reports, medicines, vaccinations, insurance
and expenses in one AI-structured timeline; providers (clinic, hospital,
diagnostic centre, pharmacy) manage appointments, reports, billing and inventory.

Built to run on free tiers: **Vercel + Neon + Upstash + Cloudflare R2**.

> **There is no public sign-up.** Accounts are provisioned by a Super Admin after
> a manual payment is verified, and credentials are handed over out-of-band. The
> system never sends email.

## Quick start

```bash
pnpm install
cp infra/.env.example .env          # edit DATABASE_URL + AUTH_JWT_SECRET

# Local Postgres (optional — a Neon URL works just as well)
docker compose -f infra/docker-compose.yml up -d

pnpm db:migrate                     # create schema
pnpm db:seed                        # platform organization
pnpm create-super-admin --username root.admin   # prints the password ONCE

pnpm dev                            # http://localhost:3000
```

The landing page shows live database and service status; `/api/v1/health`
returns the same thing as JSON.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm db:migrate` | Create + apply a migration (dev) |
| `pnpm db:deploy` | Apply existing migrations (CI/prod) |
| `pnpm db:seed` | Seed baseline data |
| `pnpm db:studio` | Prisma Studio |
| `pnpm create-super-admin` | Bootstrap the first Super Admin login |

## Layout

```text
src/
├─ app/            Next routes — portals + api/v1/* + api/jobs/*
├─ modules/        Feature domains: identity, patient, clinical, documents-ai,
│                  notify, billing, ops — each {schema,service,actions,api,ui}
├─ shared/         zod schemas, enums, error shape — source of truth for types
├─ lib/            prisma, auth, r2, upstash, webpush, ai, env
└─ ui/             shared components
prisma/            schema, migrations, seed
infra/             .env.example, docker-compose (local postgres + minio)
scripts/           create-super-admin CLI
```

## Environment

Every variable is listed and explained in [`infra/.env.example`](infra/.env.example).
Only `DATABASE_URL` and `AUTH_JWT_SECRET` are required to boot — Upstash, R2, Web
Push and the AI provider are validated lazily at the point of use, so the app runs
fine before they are configured.

On Neon, `DATABASE_URL` must be the **pooled** host (`…-pooler.…`) and `DIRECT_URL`
the direct one; `prisma migrate` cannot run through a transaction pooler.

## Deploying to Vercel

1. Import the repo; the framework preset is detected automatically.
2. Set the environment variables from `infra/.env.example` for Production and
   Preview. At minimum: `DATABASE_URL`, `DIRECT_URL`, `AUTH_JWT_SECRET`, `APP_URL`.
3. Deploy, then run `pnpm db:deploy` against the production database and
   `pnpm create-super-admin` once to create the first login.

`vercel.json` pins the region to `bom1` (Mumbai — India-first) and sets baseline
security headers. Scheduled jobs are added to its `crons` array as later phases
introduce them.

## Build phases

See `PROGRESS.md` for what is done, what is next, and what has been deferred.
Architecture rules and non-negotiables live in `AGENTS.md`.
