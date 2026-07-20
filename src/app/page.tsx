import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isR2Configured } from "@/lib/r2";
import { isQStashConfigured, isRedisConfigured } from "@/lib/upstash";
import { isWebPushConfigured } from "@/lib/webpush";

// Reads the database on every request — never prerender at build time.
export const dynamic = "force-dynamic";

type DbStatus =
  | { ok: true; latencyMs: number; organizations: number; users: number }
  | { ok: false; message: string };

async function checkDatabase(): Promise<DbStatus> {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const [organizations, users] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
    ]);

    return { ok: true, latencyMs: Date.now() - startedAt, organizations, users };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "error" }) {
  const colour = tone === "ok" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-danger";
  return <span aria-hidden className={`inline-block size-2 rounded-full ${colour}`} />;
}

function ServiceRow({ name, value, ready }: { name: string; value: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="text-sm">{name}</span>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <StatusDot tone={ready ? "ok" : "warn"} />
        {value}
      </span>
    </div>
  );
}

export default async function LandingPage() {
  const db = await checkDatabase();

  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          {env.NODE_ENV}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{env.APP_NAME}</h1>
        <p className="mt-3 text-balance text-muted-foreground">
          Digital health locker &amp; care network. Accounts are provisioned by an administrator —
          there is no public sign-up.
        </p>
      </header>

      <section aria-labelledby="db-heading" className="rounded-xl border border-border p-5">
        <h2 id="db-heading" className="mb-3 flex items-center gap-2 text-base font-semibold">
          <StatusDot tone={db.ok ? "ok" : "error"} />
          Database
        </h2>

        {db.ok ? (
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Round trip</dt>
              <dd className="mt-0.5 font-mono">{db.latencyMs} ms</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organizations</dt>
              <dd className="mt-0.5 font-mono">{db.organizations}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Users</dt>
              <dd className="mt-0.5 font-mono">{db.users}</dd>
            </div>
          </dl>
        ) : (
          <div className="text-sm">
            <p className="font-medium text-danger">Unreachable</p>
            <p className="mt-1 wrap-break-word font-mono text-xs text-muted-foreground">{db.message}</p>
            <p className="mt-3 text-muted-foreground">
              Start Postgres with{" "}
              <code className="font-mono">docker compose -f infra/docker-compose.yml up -d</code>{" "}
              then run <code className="font-mono">pnpm db:migrate</code>.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="svc-heading" className="mt-6 rounded-xl border border-border p-5">
        <h2 id="svc-heading" className="mb-1 text-base font-semibold">
          Optional services
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Unconfigured is expected locally — each is wired in a later phase.
        </p>
        <ServiceRow
          name="Upstash Redis (cache, rate limit)"
          value={isRedisConfigured() ? "configured" : "not configured"}
          ready={isRedisConfigured()}
        />
        <ServiceRow
          name="Upstash QStash (jobs, schedules)"
          value={isQStashConfigured() ? "configured" : "not configured"}
          ready={isQStashConfigured()}
        />
        <ServiceRow
          name="Object storage (R2 / MinIO)"
          value={isR2Configured() ? "configured" : "not configured"}
          ready={isR2Configured()}
        />
        <ServiceRow
          name="Web Push (VAPID)"
          value={isWebPushConfigured() ? "configured" : "not configured"}
          ready={isWebPushConfigured()}
        />
        <ServiceRow name="AI adapter" value={env.AI_PROVIDER} ready />
      </section>

      <footer className="mt-8 text-sm text-muted-foreground">
        Machine-readable status:{" "}
        <a className="underline underline-offset-4 hover:text-foreground" href="/api/v1/health">
          /api/v1/health
        </a>
      </footer>
    </main>
  );
}
