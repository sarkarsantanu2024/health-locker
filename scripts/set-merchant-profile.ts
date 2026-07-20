import "./load-env";

import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import { encrypt, maskIdentifier } from "@/lib/crypto";

/**
 * Sets the UPI / bank details money is collected into.
 *
 * Values are passed as arguments and encrypted before they touch the database.
 * They are NEVER written to a source file — this repository is public, and a
 * bank account in Git history cannot be un-published.
 *
 *   pnpm set-merchant-profile \
 *     --payee "ACCOUNT HOLDER NAME" \
 *     --vpa yourname@bank \
 *     --bank "YOUR BANK" \
 *     --account 000000000000 \
 *     --ifsc BANK0000000
 *
 * Omit --org for the platform's own profile (consumer subscriptions); pass an
 * organization id to set a provider's own collection details.
 */

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      payee: { type: "string" },
      vpa: { type: "string" },
      bank: { type: "string" },
      account: { type: "string" },
      ifsc: { type: "string" },
      org: { type: "string" },
    },
  });

  const payeeName = values.payee?.trim();
  const vpa = values.vpa?.trim();
  const accountNo = values.account?.trim().replace(/\s/g, "");
  const ifsc = values.ifsc?.trim().toUpperCase();
  const bankName = values.bank?.trim();

  if (!payeeName) throw new Error("--payee is required (the name shown to the payer).");

  if (!vpa && !accountNo) {
    throw new Error("Provide at least --vpa (UPI) or --account with --ifsc.");
  }

  // A malformed VPA silently breaks every UPI deep link, and the payer just sees
  // their app reject the QR — so validate the shape up front. The handle after
  // "@" is alphanumeric, not letters-only: real PSP handles include @69ibl, @axl.
  if (vpa && !/^[\w.\-]{2,64}@[a-zA-Z0-9]{2,64}$/.test(vpa)) {
    throw new Error(`"${vpa}" is not a valid UPI VPA (expected name@bank).`);
  }

  if (accountNo && !/^\d{6,20}$/.test(accountNo)) {
    throw new Error("--account must be 6-20 digits.");
  }

  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new Error(`"${ifsc}" is not a valid IFSC (4 letters, 0, then 6 alphanumerics).`);
  }

  if (accountNo && !ifsc) throw new Error("--ifsc is required when --account is given.");

  const orgId = values.org?.trim() || null;

  if (orgId) {
    const org = await prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new Error(`No organization with id "${orgId}".`);
  }

  const data = {
    payeeName,
    upiVpaEnc: vpa ? encrypt(vpa) : null,
    bankNameEnc: bankName ? encrypt(bankName) : null,
    accountNoEnc: accountNo ? encrypt(accountNo) : null,
    ifscEnc: ifsc ? encrypt(ifsc) : null,
    // Kept in clear so an admin can tell two accounts apart in a list.
    accountLast4: accountNo ? accountNo.slice(-4) : null,
    isActive: true,
  };

  const existing = await prisma.merchantPaymentProfile.findFirst({
    where: orgId ? { orgId } : { orgId: null },
    select: { id: true },
  });

  const profile = existing
    ? await prisma.merchantPaymentProfile.update({ where: { id: existing.id }, data })
    : await prisma.merchantPaymentProfile.create({ data: { ...data, orgId } });

  await prisma.auditLog.create({
    data: {
      action: existing ? "merchant_profile.updated" : "merchant_profile.created",
      entityType: "MerchantPaymentProfile",
      entityId: profile.id,
      orgId,
      // Masked: the audit trail must not become a second copy of the account number.
      metadata: {
        payeeName,
        via: "set-merchant-profile CLI",
        accountLast4: data.accountLast4,
        hasUpi: Boolean(vpa),
      },
    },
  });

  const line = "─".repeat(52);
  process.stdout.write(
    [
      "",
      line,
      `  ${existing ? "UPDATED" : "CREATED"} ${orgId ? `profile for org ${orgId}` : "platform payment profile"}`,
      line,
      `  payee    : ${payeeName}`,
      `  upi      : ${vpa ? `${vpa.split("@")[0].slice(0, 3)}…@${vpa.split("@")[1]}` : "—"}`,
      `  bank     : ${bankName ?? "—"}`,
      `  account  : ${accountNo ? maskIdentifier(accountNo) : "—"}`,
      `  ifsc     : ${ifsc ?? "—"}`,
      line,
      "  Stored encrypted (AES-256-GCM). Readable only with ENCRYPTION_KEY.",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\nset-merchant-profile failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
