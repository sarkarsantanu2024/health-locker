import "./load-env";

import { PrismaClient } from "@prisma/client";

import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";

/**
 * Gives every demo account a new shared password and signs them all out.
 *
 *   pnpm rotate-demo-passwords                 # generate one and print it ONCE
 *   DEMO_PASSWORD=… pnpm rotate-demo-passwords # use this one instead
 *
 * Why this exists: the demo seed used to default its password to a literal in
 * a public repository, so every database it had ever been run against had five
 * accounts anyone could sign in to. This touches ONLY the `*.demo` usernames
 * the seed creates, writes a fresh argon2id hash, revokes their sessions, and
 * never prints anything but the new password. It does not run the seed, so no
 * demo medical data is rewritten.
 */

const DEMO_USERNAMES = ["priya.demo", "clinic.demo", "hospital.demo", "diagnostic.demo", "pharmacy.demo"];

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const password = process.env.DEMO_PASSWORD?.trim() || generateTemporaryPassword();
  if (password.length < 12) throw new Error("DEMO_PASSWORD must be at least 12 characters.");

  const users = await prisma.user.findMany({
    where: { username: { in: DEMO_USERNAMES }, deletedAt: null },
    select: { id: true, username: true },
  });

  if (users.length === 0) {
    console.log("No demo accounts found; nothing to rotate.");
    return;
  }

  const passwordHash = await hashPassword(password);
  const ids = users.map((u) => u.id);

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    }),
    prisma.session.updateMany({
      where: { userId: { in: ids }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  console.log(`Rotated ${users.length} demo account(s): ${users.map((u) => u.username).join(", ")}`);
  console.log("New shared demo password (shown once):");
  console.log(`  ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
