import "./load-env";

import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";

/**
 * Creates the first SUPER_ADMIN. There is no self-signup anywhere in this
 * product, so this script is the only way to bootstrap a login.
 *
 *   pnpm create-super-admin --username root.admin
 *   pnpm create-super-admin --username root.admin --password "…" --name "Ops Lead"
 *
 * The generated password is printed ONCE. It is handed to the person
 * out-of-band (WhatsApp/call) — the system never sends email.
 */

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      username: { type: "string", short: "u" },
      password: { type: "string", short: "p" },
      name: { type: "string", short: "n" },
      phone: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });

  const username = values.username?.trim().toLowerCase();

  if (!username) {
    throw new Error("Missing --username. Usage: pnpm create-super-admin --username <name>");
  }

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username must be 3-32 chars of a-z, 0-9, dot, underscore or hyphen.");
  }

  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing && !values.force) {
    throw new Error(`User "${username}" already exists. Pass --force to reset its password instead.`);
  }

  const password = values.password?.trim() || generateTemporaryPassword();

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);
  const displayName = values.name?.trim() || "Super Admin";

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, mustChangePassword: true, status: "ACTIVE", deletedAt: null },
      })
    : await prisma.user.create({
        data: {
          username,
          passwordHash,
          displayName,
          phone: values.phone?.trim() || null,
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          mustChangePassword: true,
        },
      });

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: existing ? "user.password_reset" : "user.created",
      entityType: "User",
      entityId: user.id,
      metadata: { via: "create-super-admin CLI", role: "SUPER_ADMIN" },
    },
  });

  const banner = "─".repeat(52);
  process.stdout.write(
    [
      "",
      banner,
      existing ? "  SUPER ADMIN PASSWORD RESET" : "  SUPER ADMIN CREATED",
      banner,
      `  username : ${user.username}`,
      `  password : ${password}`,
      banner,
      "  Shown once. Hand it over out-of-band (WhatsApp/call).",
      "  The user must change it at first login.",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\ncreate-super-admin failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
