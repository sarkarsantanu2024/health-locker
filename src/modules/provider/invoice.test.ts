import { describe, expect, it } from "vitest";

import { computeTotals } from "@/modules/provider/invoice.service";

/**
 * The invoice arithmetic, tested away from the database.
 *
 * This is the function that makes a client-supplied total irrelevant: whatever
 * the form posts, the server recomputes from the line items.
 */
describe("computeTotals", () => {
  it("multiplies quantity by unit price per line", () => {
    const result = computeTotals([
      { description: "Consultation", quantity: 1, unitPriceMinor: 50000 },
      { description: "Dressing", quantity: 3, unitPriceMinor: 12000 },
    ]);

    expect(result.lines[0].amountMinor).toBe(50000);
    expect(result.lines[1].amountMinor).toBe(36000);
    expect(result.subtotalMinor).toBe(86000);
    expect(result.totalMinor).toBe(86000);
  });

  it("applies discount then tax", () => {
    const result = computeTotals(
      [{ description: "Scan", quantity: 1, unitPriceMinor: 200000 }],
      50000,
      9000,
    );

    expect(result.totalMinor).toBe(159000);
  });

  it("never produces a negative total", () => {
    // A discount larger than the bill would otherwise create an invoice the
    // clinic owes the patient, which nothing downstream is built to handle.
    const result = computeTotals(
      [{ description: "Consultation", quantity: 1, unitPriceMinor: 30000 }],
      99999999,
    );

    expect(result.totalMinor).toBe(0);
  });

  it("totals an empty invoice as zero rather than NaN", () => {
    expect(computeTotals([]).totalMinor).toBe(0);
  });
});
