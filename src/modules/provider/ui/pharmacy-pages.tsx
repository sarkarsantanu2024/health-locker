import { Package, ShoppingCart } from "lucide-react";
import Link from "next/link";

import { requireTenantPermission } from "@/lib/auth/session";
import { formatDate, money } from "@/lib/format";
import {
  dispensablePrescriptions,
  expiringBatches,
  getOrder,
  listOrders,
  listProducts,
} from "@/modules/provider/pharmacy.service";
import { searchPatients } from "@/modules/provider/patients.service";
import {
  AddBatchForm,
  AdjustBatchForm,
  CreateOrderForm,
  CreateProductForm,
  OrderActions,
} from "@/modules/provider/ui/pharmacy-client";
import { StatusBadge } from "@/modules/provider/ui/status";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/field";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { toneFor } from "@/ui/tone";

const INVENTORY = toneFor("inventory");
/* An order is a prescription being dispensed, so it carries the prescription hue. */
const ORDER = toneFor("prescription");

export async function InventoryPage({ query }: { query: string }) {
  const { orgId } = await requireTenantPermission("inventory:read");

  const [products, expiring] = await Promise.all([
    listProducts(orgId, query),
    expiringBatches(orgId, 90),
  ]);

  const now = new Date();

  return (
    <>
      <PageHeader
        title="Inventory"
        icon={Package}
        tone={INVENTORY}
        description="Stock is held per batch, so expiry is always answerable."
      />

      {expiring.length > 0 ? (
        <Alert tone="warning" className="mb-4">
          <p className="font-medium">{expiring.length} batch(es) expiring within 90 days</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {expiring.slice(0, 5).map((batch) => (
              <li key={batch.id}>
                {batch.product.name} · batch {batch.batchNo} · {batch.quantity} left ·{" "}
                {batch.expiryAt <= now ? "already expired" : `expires ${formatDate(batch.expiryAt)}`}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <form method="get" className="mb-4 flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Product, SKU or manufacturer"
          aria-label="Search inventory"
        />
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Search
        </button>
      </form>

      {products.length === 0 ? (
        <div className="mb-6">
          <EmptyState
            title={query ? "Nothing matches" : "No products yet"}
            description="Add a product below, then add a batch of stock against it."
            art={query ? "search" : "medicine"}
            tone={INVENTORY}
          />
        </div>
      ) : (
        <TableWrap className="mb-6">
          <Table>
            <Thead>
              <Tr>
                <Th>Product</Th>
                <Th>In stock</Th>
                <Th>Batches</Th>
                <Th>Next expiry</Th>
              </Tr>
            </Thead>
            <Tbody>
              {products.map((product) => (
                <Tr key={product.id}>
                  <Td>
                    <span className="font-medium">{product.name}</span>
                    {product.isScheduled ? (
                      <Badge tone="warning" className="ml-2">
                        Rx only
                      </Badge>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {[product.strength, product.form, product.manufacturer]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </Td>
                  <Td>
                    <span className={product.inStock === 0 ? "text-danger" : "font-medium"}>
                      {product.inStock}
                    </span>
                    {product.expiredQuantity > 0 ? (
                      <p className="text-xs text-danger">
                        {product.expiredQuantity} expired, not sellable
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <ul className="space-y-1 text-xs">
                      {product.batches.map((batch) => (
                        <li key={batch.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono">{batch.batchNo}</span>
                          <span className="text-muted-foreground">
                            {batch.quantity} · exp {formatDate(batch.expiryAt)}
                            {batch.mrpMinor ? ` · ${money(batch.mrpMinor)}` : ""}
                          </span>
                          <AdjustBatchForm batchId={batch.id} quantity={batch.quantity} />
                        </li>
                      ))}
                      {product.batches.length === 0 ? (
                        <li className="text-muted-foreground">No batches</li>
                      ) : null}
                    </ul>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {product.nextExpiry ? formatDate(product.nextExpiry) : "—"}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card hue={INVENTORY}>
          <CardHeader>
            <CardTitle>Add a product</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateProductForm />
          </CardContent>
        </Card>

        <Card hue={INVENTORY}>
          <CardHeader>
            <CardTitle>Add stock</CardTitle>
          </CardHeader>
          <CardContent>
            <AddBatchForm
              products={products.map((product) => ({ id: product.id, name: product.name }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export async function OrdersPage() {
  const { orgId } = await requireTenantPermission("order:read");

  const [orders, products, patients, prescriptions] = await Promise.all([
    listOrders(orgId),
    listProducts(orgId),
    searchPatients(orgId, "", { take: 200 }),
    dispensablePrescriptions(orgId),
  ]);

  return (
    <>
      <PageHeader
        title="Orders"
        icon={ShoppingCart}
        tone={ORDER}
        description="Verify, pack, dispatch and deliver."
      />

      {orders.length === 0 ? (
        <div className="mb-6">
          <EmptyState
            title="No orders yet"
            description="Start one below, against a prescription or as a counter sale."
            art="medicine"
            tone={ORDER}
          />
        </div>
      ) : (
        <TableWrap className="mb-6">
          <Table>
            <Thead>
              <Tr>
                <Th>Order</Th>
                <Th>Patient</Th>
                <Th>Items</Th>
                <Th>Total</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {orders.map((order) => (
                <Tr key={order.id}>
                  <Td>
                    <Link
                      href={`/pharmacy/orders/${order.id}`}
                      className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {order.id.slice(-8)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {order.placedAt ? formatDate(order.placedAt) : "Draft"}
                    </p>
                  </Td>
                  <Td>{order.patient?.fullName ?? "Walk-in"}</Td>
                  <Td className="text-muted-foreground">
                    {order.items.map((item) => `${item.product.name} ×${item.quantity}`).join(", ")}
                  </Td>
                  <Td className="font-medium">{money(order.totalMinor)}</Td>
                  <Td>
                    <StatusBadge value={order.status} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}

      <CreateOrderForm
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          mrn: patient.mrn,
          phone: patient.phone,
        }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          strength: product.strength,
          isScheduled: product.isScheduled,
          inStock: product.inStock,
          batches: product.batches
            .filter((batch) => batch.quantity > 0 && batch.expiryAt > new Date())
            .map((batch) => ({
              id: batch.id,
              batchNo: batch.batchNo,
              quantity: batch.quantity,
              mrpMinor: batch.mrpMinor,
            })),
        }))}
        prescriptions={prescriptions.map((prescription) => ({
          id: prescription.id,
          patientId: prescription.patientId,
          label: `${prescription.patient.fullName} · ${formatDate(prescription.issuedAt)} · ${prescription.items
            .map((item) => item.drugName)
            .slice(0, 3)
            .join(", ")}`,
        }))}
      />
    </>
  );
}

export async function OrderDetailPage({ orderId }: { orderId: string }) {
  const { orgId } = await requireTenantPermission("order:read");
  const order = await getOrder(orgId, orderId);

  const needsRx = order.items.some((item) => item.product.isScheduled);

  return (
    <>
      <PageHeader
        title={`Order ${order.id.slice(-8)}`}
        icon={ShoppingCart}
        tone={ORDER}
        description={`${order.patient?.fullName ?? "Walk-in"} · ${money(order.totalMinor)}`}
        action={<StatusBadge value={order.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <TableWrap className="rounded-none border-0">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Item</Th>
                      <Th>Batch</Th>
                      <Th>Qty</Th>
                      <Th>Amount</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {order.items.map((item) => (
                      <Tr key={item.id}>
                        <Td>
                          {item.product.name}
                          {item.product.strength ? ` ${item.product.strength}` : ""}
                          {item.product.isScheduled ? (
                            <Badge tone="warning" className="ml-2">
                              Rx only
                            </Badge>
                          ) : null}
                        </Td>
                        <Td className="font-mono text-xs">
                          {item.batch ? (
                            <>
                              {item.batch.batchNo}
                              <span className="block text-muted-foreground">
                                exp {formatDate(item.batch.expiryAt)}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>{item.quantity}</Td>
                        <Td className="font-medium">{money(item.amountMinor)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {needsRx ? (
                order.prescriptionId ? (
                  <Alert tone="info">
                    Contains a prescription-only medicine. A prescription is attached.
                  </Alert>
                ) : (
                  <Alert tone="danger">
                    Contains a prescription-only medicine with no prescription attached. This cannot
                    be verified.
                  </Alert>
                )
              ) : null}

              <OrderActions orderId={order.id} status={order.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Placed {order.placedAt ? formatDate(order.placedAt) : "—"}</p>
              <p>Verified {order.verifiedAt ? formatDate(order.verifiedAt) : "not yet"}</p>
              <p>Delivered {order.deliveredAt ? formatDate(order.deliveredAt) : "not yet"}</p>
              <p className="pt-2 text-foreground">
                {order.deliveryAddress ?? "Collected at the counter"}
              </p>
            </CardContent>
          </Card>

          {order.patientId ? (
            <Link
              href={`/pharmacy/patients/${order.patientId}`}
              className={buttonVariants({ variant: "ghost", size: "sm", full: true })}
            >
              Open the patient record
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
