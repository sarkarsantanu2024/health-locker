"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { money } from "@/lib/format";
import {
  addBatchAction,
  adjustBatchAction,
  createOrderAction,
  createProductAction,
  setOrderStatusAction,
  verifyOrderAction,
  emptyProviderState,
} from "@/modules/provider/actions";
import type { PatientOption } from "@/modules/provider/ui/appointment-client";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Field, Input, Label, Select } from "@/ui/field";

export interface ProductOption {
  id: string;
  name: string;
  strength: string | null;
  isScheduled: boolean;
  inStock: number;
  batches: { id: string; batchNo: string; quantity: number; mrpMinor: number | null }[];
}

export interface PrescriptionOption {
  id: string;
  label: string;
  patientId: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function CreateProductForm() {
  const [state, action] = useActionState(createProductAction, emptyProviderState);

  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Product" errors={state.fieldErrors?.name}>
          {(props) => <Input {...props} name="name" required placeholder="Paracetamol" />}
        </Field>
        <Field label="SKU" errors={state.fieldErrors?.sku} optional>
          {(props) => <Input {...props} name="sku" />}
        </Field>
        <Field label="Manufacturer" errors={state.fieldErrors?.manufacturer} optional>
          {(props) => <Input {...props} name="manufacturer" />}
        </Field>
        <Field label="Form" errors={state.fieldErrors?.form} optional>
          {(props) => <Input {...props} name="form" placeholder="Tablet, syrup…" />}
        </Field>
        <Field label="Strength" errors={state.fieldErrors?.strength} optional>
          {(props) => <Input {...props} name="strength" placeholder="500 mg" />}
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="isScheduled" className="size-4" />
          Prescription required
        </label>
      </div>

      <SubmitButton label="Add product" />
    </form>
  );
}

export function AddBatchForm({ products }: { products: { id: string; name: string }[] }) {
  const [state, action] = useActionState(addBatchAction, emptyProviderState);

  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Product" errors={state.fieldErrors?.productId}>
          {(props) => (
            <Select {...props} name="productId" required defaultValue="">
              <option value="" disabled>
                Choose a product
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Batch number" errors={state.fieldErrors?.batchNo}>
          {(props) => <Input {...props} name="batchNo" required />}
        </Field>
        <Field label="Expiry" errors={state.fieldErrors?.expiryAt}>
          {(props) => <Input {...props} name="expiryAt" type="date" required />}
        </Field>
        <Field label="Quantity" errors={state.fieldErrors?.quantity}>
          {(props) => <Input {...props} name="quantity" inputMode="numeric" required />}
        </Field>
        <Field label="Cost (₹)" errors={state.fieldErrors?.costMinor} optional>
          {(props) => <Input {...props} name="costMinor" inputMode="decimal" />}
        </Field>
        <Field label="MRP (₹)" errors={state.fieldErrors?.mrpMinor} optional>
          {(props) => <Input {...props} name="mrpMinor" inputMode="decimal" />}
        </Field>
      </div>

      <SubmitButton label="Add stock" />
    </form>
  );
}

export function AdjustBatchForm({ batchId, quantity }: { batchId: string; quantity: number }) {
  const [state, action] = useActionState(adjustBatchAction, emptyProviderState);
  const [open, setOpen] = useState(false);

  if (state.ok) return <span className="text-xs text-success">Adjusted</span>;

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)}>
        Adjust
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <Input
        name="delta"
        placeholder="-3"
        aria-label={`Change to the count of ${quantity}`}
        className="h-9 w-20 text-sm"
        required
        autoFocus
      />
      <Input
        name="reason"
        placeholder="Damaged, recount…"
        aria-label="Reason for the adjustment"
        className="h-9 w-40 text-sm"
        required
      />
      <Button type="submit" size="xs">
        Save
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.error ? (
        <span className="w-full text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

interface OrderRow {
  key: number;
  productId: string;
  batchId: string;
  quantity: string;
  price: string;
}

/**
 * Dispensing form.
 *
 * The batch picker only lists batches with stock, and choosing a product that
 * needs a prescription without attaching one is refused by the server. The
 * running total is a convenience — the server recomputes it from the lines.
 */
export function CreateOrderForm({
  patients,
  products,
  prescriptions,
}: {
  patients: PatientOption[];
  products: ProductOption[];
  prescriptions: PrescriptionOption[];
}) {
  const [state, action] = useActionState(createOrderAction, emptyProviderState);
  const [rows, setRows] = useState<OrderRow[]>([
    { key: 0, productId: "", batchId: "", quantity: "1", price: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const byId = new Map(products.map((product) => [product.id, product]));

  const total = rows.reduce(
    (sum, row) =>
      sum + (Number(row.quantity) || 0) * Math.round(Number(row.price.replace(/[,\s₹]/g, "") || "0") * 100),
    0,
  );

  const needsPrescription = rows.some((row) => byId.get(row.productId)?.isScheduled);

  const update = (key: number, patch: Partial<OrderRow>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const cellClass = "h-11 rounded-lg border border-border-strong bg-surface px-3 text-base";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispense</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.fieldErrors?.items ? (
            <Alert tone="danger">{state.fieldErrors.items.join(" ")}</Alert>
          ) : null}
          {state.fieldErrors?.prescriptionId ? (
            <Alert tone="danger">{state.fieldErrors.prescriptionId.join(" ")}</Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient" errors={state.fieldErrors?.patientId} optional>
              {(props) => (
                <Select {...props} name="patientId" defaultValue="">
                  <option value="">Walk-in, no record</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.fullName}
                      {patient.mrn ? ` · ${patient.mrn}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Against prescription"
              errors={state.fieldErrors?.prescriptionId}
              optional={!needsPrescription}
              hint={
                needsPrescription
                  ? "One of these items needs a prescription."
                  : "Attach one if this is a repeat of a written prescription."
              }
            >
              {(props) => (
                <Select {...props} name="prescriptionId" defaultValue="" required={needsPrescription}>
                  <option value="">None</option>
                  {prescriptions.map((prescription) => (
                    <option key={prescription.id} value={prescription.id}>
                      {prescription.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="space-y-3">
            <Label>Items</Label>
            {rows.map((row, index) => {
              const product = byId.get(row.productId);

              return (
                <div key={row.key} className="grid gap-2 sm:grid-cols-[1.6fr_1.2fr_4rem_6rem_auto]">
                  <select
                    name="productId"
                    value={row.productId}
                    onChange={(event) => update(row.key, { productId: event.target.value, batchId: "" })}
                    aria-label={`Product ${index + 1}`}
                    className={cellClass}
                  >
                    <option value="">Choose a product</option>
                    {products.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                        {option.strength ? ` ${option.strength}` : ""}
                        {option.isScheduled ? " (Rx)" : ""} · {option.inStock} in stock
                      </option>
                    ))}
                  </select>

                  <select
                    name="batchId"
                    value={row.batchId}
                    onChange={(event) => update(row.key, { batchId: event.target.value })}
                    aria-label={`Batch ${index + 1}`}
                    className={cellClass}
                  >
                    <option value="">No batch</option>
                    {(product?.batches ?? []).map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batchNo} · {batch.quantity} left
                      </option>
                    ))}
                  </select>

                  <input
                    name="orderQuantity"
                    value={row.quantity}
                    onChange={(event) => update(row.key, { quantity: event.target.value })}
                    inputMode="numeric"
                    aria-label={`Quantity ${index + 1}`}
                    className={cellClass}
                  />

                  <input
                    name="orderUnitPrice"
                    value={row.price}
                    onChange={(event) => update(row.key, { price: event.target.value })}
                    inputMode="decimal"
                    placeholder="₹"
                    aria-label={`Unit price ${index + 1}`}
                    className={cellClass}
                  />

                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  ) : null}
                </div>
              );
            })}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setRows([
                  ...rows,
                  { key: nextKey, productId: "", batchId: "", quantity: "1", price: "" },
                ]);
                setNextKey(nextKey + 1);
              }}
            >
              <Plus aria-hidden className="size-4" />
              Add item
            </Button>
          </div>

          <Field label="Delivery address" errors={state.fieldErrors?.deliveryAddress} optional>
            {(props) => <Input {...props} name="deliveryAddress" placeholder="Collected at counter" />}
          </Field>

          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">
              Stock is only taken when the order is packed
            </span>
            <span className="text-lg font-semibold">{money(total)}</span>
          </div>

          <SubmitButton label="Place order" />
        </form>
      </CardContent>
    </Card>
  );
}

export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const [verifyState, verifyAction] = useActionState(verifyOrderAction, emptyProviderState);
  const [statusState, statusAction] = useActionState(setOrderStatusAction, emptyProviderState);

  const message = verifyState.message ?? statusState.message;
  const error = verifyState.error ?? statusState.error;

  const next =
    status === "VERIFIED"
      ? { status: "PACKED", label: "Pack (takes stock)" }
      : status === "PACKED"
        ? { status: "DISPATCHED", label: "Dispatch" }
        : status === "DISPATCHED"
          ? { status: "DELIVERED", label: "Mark delivered" }
          : null;

  return (
    <div className="space-y-3">
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {status === "PLACED" && !verifyState.ok ? (
          <form action={verifyAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <SubmitButton label="Verify prescription" />
          </form>
        ) : null}

        {next && !statusState.ok ? (
          <form action={statusAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="status" value={next.status} />
            <SubmitButton label={next.label} />
          </form>
        ) : null}

        {!["DELIVERED", "CANCELLED", "RETURNED"].includes(status) && !statusState.ok ? (
          <form action={statusAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="status" value="CANCELLED" />
            <Button type="submit" variant="secondary" size="sm">
              Cancel order
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
