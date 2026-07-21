import { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { notifyPatient } from "@/modules/notify/notify.service";
import { requirePatientOfOrg } from "@/modules/provider/patients.service";
import { AppError } from "@/shared/errors";
import type { OrderStatus } from "@/shared/enums";

/**
 * Pharmacy: inventory by batch, and dispensing.
 *
 * Two rules the rest of the module is built around:
 *
 *  1. **Stock lives on batches, never on products.** Expiry and cost belong to a
 *     batch, and "how many paracetamol do we have" is a sum over unexpired
 *     batches. A quantity column on Product cannot answer the only question that
 *     matters at the counter — which of these can I legally dispense today.
 *
 *  2. **Stock moves once, at PACKED.** Decrementing at order time would strand
 *     stock behind abandoned orders; decrementing at delivery would let you
 *     promise the same tablets twice. Packing is when they physically leave the
 *     shelf, so that is when the number changes.
 */

// ---------------------------------------------------------------------------
// Products & batches
// ---------------------------------------------------------------------------

export async function listProducts(orgId: string, query = "") {
  const trimmed = query.trim();

  const products = await prisma.product.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: Prisma.QueryMode.insensitive } },
              { sku: { contains: trimmed, mode: Prisma.QueryMode.insensitive } },
              { manufacturer: { contains: trimmed, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      sku: true,
      manufacturer: true,
      form: true,
      strength: true,
      isScheduled: true,
      isActive: true,
      batches: {
        where: { deletedAt: null },
        orderBy: { expiryAt: "asc" },
        select: { id: true, batchNo: true, expiryAt: true, quantity: true, mrpMinor: true },
      },
    },
  });

  const now = new Date();

  return products.map((product) => {
    const usable = product.batches.filter((batch) => batch.expiryAt > now && batch.quantity > 0);

    return {
      ...product,
      // Expired stock is deliberately excluded from "in stock": it is on the
      // shelf, but it is not sellable, and showing it as available is how
      // expired medicine gets dispensed.
      inStock: usable.reduce((sum, batch) => sum + batch.quantity, 0),
      expiredQuantity: product.batches
        .filter((batch) => batch.expiryAt <= now)
        .reduce((sum, batch) => sum + batch.quantity, 0),
      nextExpiry: usable[0]?.expiryAt ?? null,
    };
  });
}

export async function createProduct(
  orgId: string,
  input: {
    name: string;
    sku?: string | null;
    manufacturer?: string | null;
    form?: string | null;
    strength?: string | null;
    isScheduled?: boolean;
  },
  actorId: string,
): Promise<{ id: string }> {
  try {
    const product = await prisma.product.create({
      data: {
        orgId,
        name: input.name,
        sku: input.sku ?? null,
        manufacturer: input.manufacturer ?? null,
        form: input.form ?? null,
        strength: input.strength ?? null,
        isScheduled: input.isScheduled ?? false,
      },
      select: { id: true },
    });

    await audit({
      action: "product:created",
      entityType: "Product",
      entityId: product.id,
      actorId,
      orgId,
      metadata: { name: input.name, isScheduled: input.isScheduled },
    });

    return product;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "A product with that SKU already exists.", { field: "sku" });
    }
    throw error;
  }
}

export async function addBatch(
  orgId: string,
  input: {
    productId: string;
    batchNo: string;
    expiryAt: Date;
    quantity: number;
    costMinor?: number | null;
    mrpMinor?: number | null;
  },
  actorId: string,
): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, orgId, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!product) throw new AppError("NOT_FOUND", "Not found.");

  if (input.expiryAt <= new Date()) {
    throw new AppError("VALIDATION_FAILED", "That batch has already expired.", {
      field: "expiryAt",
    });
  }

  try {
    await prisma.stockBatch.create({
      data: {
        productId: input.productId,
        batchNo: input.batchNo,
        expiryAt: input.expiryAt,
        quantity: input.quantity,
        costMinor: input.costMinor ?? null,
        mrpMinor: input.mrpMinor ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "That batch number already exists for this product.", {
        field: "batchNo",
      });
    }
    throw error;
  }

  await audit({
    action: "stock-batch:created",
    entityType: "StockBatch",
    actorId,
    orgId,
    metadata: {
      product: product.name,
      batchNo: input.batchNo,
      quantity: input.quantity,
      expiryAt: input.expiryAt.toISOString(),
    },
  });
}

/**
 * A counted correction, not a set-to-value. The delta and the reason both go to
 * the audit trail, because "the number changed" with no explanation is exactly
 * the shape stock shrinkage hides in.
 */
export async function adjustBatch(
  orgId: string,
  batchId: string,
  delta: number,
  reason: string,
  actorId: string,
): Promise<void> {
  const batch = await prisma.stockBatch.findFirst({
    where: { id: batchId, deletedAt: null, product: { orgId, deletedAt: null } },
    select: { id: true, quantity: true, batchNo: true, product: { select: { name: true } } },
  });

  if (!batch) throw new AppError("NOT_FOUND", "Not found.");

  const next = batch.quantity + delta;

  if (next < 0) {
    throw new AppError("BAD_REQUEST", `Only ${batch.quantity} left in that batch.`);
  }

  await prisma.stockBatch.update({ where: { id: batchId }, data: { quantity: next } });

  await audit({
    action: "stock-batch:adjusted",
    entityType: "StockBatch",
    entityId: batchId,
    actorId,
    orgId,
    metadata: {
      product: batch.product.name,
      batchNo: batch.batchNo,
      from: batch.quantity,
      to: next,
      delta,
      reason,
    },
  });
}

export async function expiringBatches(orgId: string, withinDays = 90) {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);

  return prisma.stockBatch.findMany({
    where: {
      deletedAt: null,
      quantity: { gt: 0 },
      expiryAt: { lte: cutoff },
      product: { orgId, deletedAt: null },
    },
    orderBy: { expiryAt: "asc" },
    take: 100,
    select: {
      id: true,
      batchNo: true,
      expiryAt: true,
      quantity: true,
      product: { select: { id: true, name: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderItemInput {
  productId: string;
  batchId?: string | null;
  quantity: number;
  unitPriceMinor: number;
}

export async function createOrder(
  orgId: string,
  input: {
    patientId?: string | null;
    prescriptionId?: string | null;
    deliveryAddress?: string | null;
    items: OrderItemInput[];
  },
  actorId: string,
): Promise<{ id: string }> {
  if (input.items.length === 0) {
    throw new AppError("VALIDATION_FAILED", "Add at least one item.", { field: "items" });
  }

  if (input.patientId) await requirePatientOfOrg(orgId, input.patientId);

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, orgId, deletedAt: null },
    select: { id: true, name: true, isScheduled: true },
  });

  if (products.length !== new Set(productIds).size) {
    throw new AppError("NOT_FOUND", "One of those products is not in your inventory.");
  }

  // A scheduled drug without a prescription attached is refused outright rather
  // than flagged for later: "we'll check it before dispensing" is precisely the
  // control that gets skipped when the counter is busy.
  const scheduled = products.filter((product) => product.isScheduled);

  if (scheduled.length > 0 && !input.prescriptionId) {
    throw new AppError(
      "BAD_REQUEST",
      `${scheduled.map((product) => product.name).join(", ")} require a prescription. Attach one to continue.`,
      { field: "prescriptionId" },
    );
  }

  const totalMinor = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceMinor,
    0,
  );

  const order = await prisma.pharmacyOrder.create({
    data: {
      orgId,
      patientId: input.patientId ?? null,
      prescriptionId: input.prescriptionId ?? null,
      deliveryAddress: input.deliveryAddress ?? null,
      status: "PLACED",
      placedAt: new Date(),
      totalMinor,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          batchId: item.batchId ?? null,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          amountMinor: item.quantity * item.unitPriceMinor,
        })),
      },
    },
    select: { id: true },
  });

  await audit({
    action: "pharmacy-order:created",
    entityType: "PharmacyOrder",
    entityId: order.id,
    actorId,
    orgId,
    metadata: {
      patientId: input.patientId,
      totalMinor,
      items: input.items.length,
      prescriptionId: input.prescriptionId,
      scheduledDrugs: scheduled.length,
    },
  });

  return order;
}

/**
 * A pharmacist confirms the prescription covers what is being dispensed. Records
 * who verified it, which is the row a regulator asks for.
 */
export async function verifyOrder(
  orgId: string,
  orderId: string,
  actorId: string,
): Promise<void> {
  const order = await prisma.pharmacyOrder.findFirst({
    where: { id: orderId, orgId, deletedAt: null },
    select: {
      id: true,
      status: true,
      prescriptionId: true,
      items: { select: { product: { select: { name: true, isScheduled: true } } } },
    },
  });

  if (!order) throw new AppError("NOT_FOUND", "Not found.");
  if (order.status !== "PLACED") {
    throw new AppError("BAD_REQUEST", "Only a placed order can be verified.");
  }

  const needsRx = order.items.some((item) => item.product.isScheduled);

  if (needsRx && !order.prescriptionId) {
    throw new AppError("BAD_REQUEST", "This order contains a scheduled drug and has no prescription.");
  }

  await prisma.pharmacyOrder.update({
    where: { id: orderId },
    data: { status: "VERIFIED", verifiedById: actorId, verifiedAt: new Date() },
  });

  await audit({
    action: "pharmacy-order:verified",
    entityType: "PharmacyOrder",
    entityId: orderId,
    actorId,
    orgId,
    metadata: { prescriptionId: order.prescriptionId, hadScheduledDrug: needsRx },
  });
}

export async function setOrderStatus(
  orgId: string,
  orderId: string,
  status: OrderStatus,
  actorId: string,
): Promise<void> {
  const order = await prisma.pharmacyOrder.findFirst({
    where: { id: orderId, orgId, deletedAt: null },
    select: {
      id: true,
      status: true,
      patientId: true,
      items: { select: { id: true, batchId: true, quantity: true, product: { select: { name: true } } } },
    },
  });

  if (!order) throw new AppError("NOT_FOUND", "Not found.");

  // The one stock movement in the whole flow. Guarded by the current status so a
  // double click on "Pack" cannot take the stock twice.
  if (status === "PACKED" && order.status !== "PACKED") {
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.batchId) continue;

        const batch = await tx.stockBatch.findUnique({
          where: { id: item.batchId },
          select: { quantity: true },
        });

        if (!batch || batch.quantity < item.quantity) {
          throw new AppError(
            "CONFLICT",
            `Not enough stock of ${item.product.name} in the chosen batch.`,
          );
        }

        await tx.stockBatch.update({
          where: { id: item.batchId },
          data: { quantity: batch.quantity - item.quantity },
        });
      }

      await tx.pharmacyOrder.update({ where: { id: orderId }, data: { status } });
    });
  } else {
    await prisma.pharmacyOrder.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      },
    });
  }

  await audit({
    action: "pharmacy-order:status-changed",
    entityType: "PharmacyOrder",
    entityId: orderId,
    actorId,
    orgId,
    metadata: { from: order.status, to: status },
  });

  if (status === "DISPATCHED" && order.patientId) {
    await notifyPatient(order.patientId, {
      type: "ACCOUNT_NOTICE",
      title: "Your medicines are on the way",
      body: `Dispatched on ${formatDate(new Date())}.`,
      data: { url: "/patient/medicines", orderId },
      dedupeKey: `order-dispatched:${orderId}`,
    });
  }
}

export async function listOrders(orgId: string, filters: { status?: OrderStatus } = {}) {
  return prisma.pharmacyOrder.findMany({
    where: { orgId, deletedAt: null, ...(filters.status ? { status: filters.status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      totalMinor: true,
      placedAt: true,
      deliveredAt: true,
      prescriptionId: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          amountMinor: true,
          product: { select: { name: true, isScheduled: true } },
          batch: { select: { batchNo: true, expiryAt: true } },
        },
      },
    },
  });
}

export async function getOrder(orgId: string, orderId: string) {
  const order = await prisma.pharmacyOrder.findFirst({
    where: { id: orderId, orgId, deletedAt: null },
    select: {
      id: true,
      status: true,
      totalMinor: true,
      placedAt: true,
      deliveredAt: true,
      verifiedAt: true,
      deliveryAddress: true,
      prescriptionId: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPriceMinor: true,
          amountMinor: true,
          product: { select: { name: true, strength: true, isScheduled: true } },
          batch: { select: { batchNo: true, expiryAt: true } },
        },
      },
    },
  });

  if (!order) throw new AppError("NOT_FOUND", "Not found.");

  return order;
}

/**
 * Prescriptions a pharmacy may dispense against.
 *
 * Deliberately limited to prescriptions for patients registered with this
 * pharmacy. Out-of-network dispensing was left unresolved in Phase 1 (that is
 * why `PharmacyOrder.prescriptionId` is not a foreign key); this is the
 * conservative half of that decision, and widening it later is additive.
 */
export async function dispensablePrescriptions(orgId: string, patientId?: string) {
  return prisma.prescription.findMany({
    where: {
      deletedAt: null,
      ...(patientId ? { patientId } : {}),
      patient: { orgLinks: { some: { orgId, deletedAt: null } } },
    },
    orderBy: { issuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      issuedAt: true,
      patientId: true,
      patient: { select: { fullName: true } },
      org: { select: { name: true } },
      prescriberName: true,
      practitioner: { select: { fullName: true } },
      items: { where: { deletedAt: null }, select: { drugName: true, dose: true, frequency: true } },
    },
  });
}

export async function pharmacySummary(orgId: string) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [toVerify, toPack, expiringSoon, expired] = await Promise.all([
    prisma.pharmacyOrder.count({ where: { orgId, deletedAt: null, status: "PLACED" } }),
    prisma.pharmacyOrder.count({ where: { orgId, deletedAt: null, status: "VERIFIED" } }),
    prisma.stockBatch.count({
      where: {
        deletedAt: null,
        quantity: { gt: 0 },
        expiryAt: { gt: now, lte: in30Days },
        product: { orgId, deletedAt: null },
      },
    }),
    prisma.stockBatch.count({
      where: {
        deletedAt: null,
        quantity: { gt: 0 },
        expiryAt: { lte: now },
        product: { orgId, deletedAt: null },
      },
    }),
  ]);

  return { toVerify, toPack, expiringSoon, expired };
}
