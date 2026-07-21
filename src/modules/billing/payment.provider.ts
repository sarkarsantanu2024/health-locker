import type { PaymentMethod } from "@prisma/client";

/**
 * The seam a real gateway drops into later.
 *
 * Modelled on intent → proof → settlement rather than on the manual flow itself.
 * A gateway settles automatically and has no human approval step; the manual
 * flow has approval and no redirect. Shaping the interface around the manual
 * flow would have forced a gateway to fake steps it does not have — so
 * `instructions` is optional (a gateway returns a redirect URL instead) and
 * `settle` is where a webhook or an admin click both land.
 */

export interface PaymentIntent {
  refCode: string;
  amountMinor: number;
  currency: string;
  description: string;
}

export interface PaymentInstructions {
  kind: "MANUAL";
  /** upi://pay deep link, when a VPA is configured. */
  upiLink: string | null;
  /** Inline SVG QR of the same link. */
  qrSvg: string | null;
  payeeName: string;
  vpa: string | null;
  bank: { name: string; accountNo: string; ifsc: string } | null;
}

export interface PaymentProof {
  method: PaymentMethod;
  reference: string;
  paidAt?: Date | null;
  amountMinor?: number | null;
  proofDocumentId?: string | null;
}

export interface PaymentProvider {
  readonly id: string;
  /** True when a human has to approve; false for an auto-settling gateway. */
  readonly requiresManualVerification: boolean;

  /** What to show the payer so they can pay. */
  getInstructions(intent: PaymentIntent, merchantProfileId: string | null): Promise<PaymentInstructions>;

  /** The payer's claim that they paid. A gateway would call this from a webhook. */
  submitProof(refCode: string, proof: PaymentProof, submittedBy: { userId?: string | null; phone?: string | null }): Promise<void>;
}
