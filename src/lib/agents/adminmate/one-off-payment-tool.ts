import type { Payload } from "payload";
import type { CanonicalTool } from "../_shared/tool";
import { parseOneOffRequest } from "../../hosting-one-off-payment";
import type { AdminMateClient } from "./tools";

/**
 * A one-off card payment request AdminMate has staged for the admin to
 * review. Nothing is created or emailed until the admin confirms the card,
 * which calls the same endpoint as the client page's One-off payment panel.
 */
export interface StagedOneOffPayment {
  clientId: string;
  clientName: string;
  description: string;
  /** Dollars before the card surcharge. */
  amount: number;
  /** YYYY-MM-DD (Sydney) to email the link on; absent sends it on confirm. */
  sendOn?: string;
}

/** Billing details shown on the review card, read from the CMS by the server. */
export interface OneOffPaymentPreview {
  recipientEmail: string;
  currency: string;
  surcharge: { percentage: number; fixedCents: number };
}

/**
 * Reads the billing email and surcharge the confirmed link will use, so the
 * review card shows the real recipient and total before anything is sent.
 */
export async function loadOneOffPaymentPreview(
  payload: Payload,
  clientId: string,
): Promise<OneOffPaymentPreview> {
  const [client, settings] = await Promise.all([
    payload.findByID({ collection: "clients", id: Number(clientId), depth: 0, overrideAccess: true }),
    payload.findGlobal({ slug: "hosting-billing-settings", overrideAccess: true }),
  ]);
  const hosting = ((client as { hostingSubscription?: { recipientEmail?: string | null } }).hostingSubscription ?? {});
  const billing = settings as { currency?: string | null; cardSurchargePercentage?: number | null; cardSurchargeFixedCents?: number | null };
  return {
    recipientEmail: hosting.recipientEmail ?? "",
    currency: billing.currency || "aud",
    surcharge: {
      percentage: Number(billing.cardSurchargePercentage),
      fixedCents: Number(billing.cardSurchargeFixedCents),
    },
  };
}

/** Validates a staged payment exactly as the create endpoint will. */
export function validateStagedOneOffPayment(
  raw: unknown,
  existing: AdminMateClient[],
  now: Date = new Date(),
): StagedOneOffPayment {
  const input = (raw ?? {}) as Record<string, unknown>;
  const clientId = typeof input.clientId === "string" ? input.clientId.trim() : "";
  const client = existing.find((candidate) => candidate.id === clientId);
  if (!client) throw new Error("clientId does not match an existing client — call find_clients");
  const sendOn = typeof input.sendOn === "string" && input.sendOn.trim() ? input.sendOn.trim() : undefined;
  const parsed = parseOneOffRequest({ description: input.description, amount: input.amount, sendOn }, now);
  if (!parsed.ok) throw new Error(parsed.error);
  return {
    clientId: client.id,
    clientName: client.name,
    description: parsed.value.description,
    amount: parsed.value.baseCents / 100,
    ...(sendOn ? { sendOn } : {}),
  };
}

export function createOneOffPaymentTool(existing: AdminMateClient[]): CanonicalTool<StagedOneOffPayment> {
  return {
    name: "stage_one_off_payment",
    description:
      "Stage a one-off card payment request (for example backdated hosting) for an existing client, for human review. No payment link is created and no email is sent here — the admin checks the card and confirms it, and the link is then emailed from accounts to the client's hosting billing email, now or on the chosen send date. The card surcharge from Hosting Billing Settings is added automatically; never include it in amount.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Id of an existing client from find_clients." },
        description: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description: "What the payment is for, as the client will see it, e.g. 'Backdated hosting, July to September 2026'.",
        },
        amount: { type: "number", exclusiveMinimum: 0, description: "Amount in dollars before the card surcharge, at most two decimal places." },
        sendOn: {
          type: "string",
          description: "Optional YYYY-MM-DD date (after today, Sydney time) to email the link at 9am Sydney. Omit to email it as soon as the admin confirms.",
        },
      },
      required: ["clientId", "description", "amount"],
      additionalProperties: false,
    },
    validate: (raw) => validateStagedOneOffPayment(raw, existing),
    execute: async (staged) => ({ ok: true, data: { staged } }),
  };
}
