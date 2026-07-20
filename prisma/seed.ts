import "../scripts/load-env";

import { PrismaClient } from "@prisma/client";

/**
 * Phase 0 seed: the platform tenant only. Demo tenants, patients and families
 * arrive in Phase 1 with the full data model.
 *
 * Deliberately does NOT create users — accounts are admin-provisioned, and the
 * first one comes from `pnpm create-super-admin`.
 */

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const platform = await prisma.organization.upsert({
    where: { slug: "healthlocker-platform" },
    update: {},
    create: {
      slug: "healthlocker-platform",
      name: "HealthLocker Platform",
      type: "PLATFORM",
    },
  });

  process.stdout.write(`Seeded platform organization: ${platform.slug} (${platform.id})\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\nSeed failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
