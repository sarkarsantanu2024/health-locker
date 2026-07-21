/**
 * Removes throwaway accounts left behind by test runs.
 *
 *   pnpm purge-test-accounts           # list what would go
 *   pnpm purge-test-accounts --delete  # actually delete
 *
 * Why this exists: `pnpm smoke` creates real users and deletes them in a
 * `finally`, which does not run when the process is killed — and the audit
 * tests create `audit.check.*` patients that nothing sweeps at all. One of those
 * strays was a live `SUPER_ADMIN` in a database that also serves the deployed
 * site. A stale super admin nobody created on purpose is a finding, not a
 * leftover.
 *
 * This deletes hard rather than soft: these accounts are not medical records and
 * a soft-deleted stray is still a row that has to be explained to an auditor.
 * It refuses to touch anything that does not match the throwaway prefixes, and
 * it refuses to run at all if a match has clinical data hanging off it — that
 * would mean the prefix collided with a real account, and the right response is
 * to stop rather than to cascade.
 */
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const prisma = new PrismaClient();

/** Only these. Anything else is somebody's real account. */
const THROWAWAY_PREFIXES = ["smoke.", "audit.check."];

const shouldDelete = process.argv.includes("--delete");

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: THROWAWAY_PREFIXES.map((prefix) => ({ username: { startsWith: prefix } })) },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      deletedAt: true,
      patient: {
        select: {
          id: true,
          _count: {
            select: {
              prescriptions: true,
              diagnosticReports: true,
              appointments: true,
              documents: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    console.log("No throwaway accounts found.");
    return;
  }

  let unsafe = 0;

  for (const user of users) {
    const counts = user.patient?._count;
    const clinical = counts
      ? counts.prescriptions + counts.diagnosticReports + counts.appointments + counts.documents
      : 0;

    if (clinical > 0) unsafe += 1;

    console.log(
      `${user.username.padEnd(40)} ${user.role.padEnd(18)} ${user.createdAt.toISOString()}` +
        (user.deletedAt ? "  (soft-deleted)" : "") +
        (clinical > 0 ? `  <- ${clinical} clinical record(s), NOT SAFE` : ""),
    );
  }

  console.log(`\n${users.length} throwaway account(s).`);

  if (unsafe > 0) {
    console.error(
      `\n${unsafe} of them have clinical records attached, which means the prefix has collided\n` +
        "with a real account. Refusing to delete anything. Investigate by hand.",
    );
    process.exitCode = 1;
    return;
  }

  if (!shouldDelete) {
    console.log("\nDry run. Pass --delete to remove them.");
    return;
  }

  const ids = users.map((user) => user.id);

  /*
   * The audit log is deliberately NOT touched. `AuditLog.actor` is
   * `onDelete: SetNull`, so removing the user leaves the entries in place with a
   * null actor — which is the point of an append-only trail. Deleting rows out
   * of it to tidy up is the one habit that makes the trail worthless.
   */
  const sessions = await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  const patients = await prisma.patient.deleteMany({ where: { userId: { in: ids } } });
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(
    `\nDeleted ${deleted.count} user(s), ${patients.count} patient profile(s), ` +
      `${sessions.count} session(s). Audit entries kept, with a null actor.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
