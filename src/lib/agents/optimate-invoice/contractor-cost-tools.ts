import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { filterContractorPayments, loadContractorOverview, type ContractorFortnightPayment } from "@/lib/contractor-overview";
import type { ToolDef } from "@/lib/agents/_shared/llm/types";

export const CONTRACTOR_COST_TOOL_NAMES = new Set(["listContractorCosts"]);

export const contractorCostTools: ToolDef[] = [
  {
    name: "listContractorCosts",
    description:
      "Look up Optimise Digital contractor fortnightly payments from Contractor Costs (not Xero). Use this when the user asks how much they owe a contractor, what to transfer, or a payment reference. Returns contractor name, fortnight dates, transfer amount, reference, and unpaid/paid status.",
    inputSchema: {
      type: "object",
      properties: {
        contractorName: {
          type: "string",
          description: "Optional contractor name to match, e.g. Lorenzo",
        },
        status: {
          type: "string",
          enum: ["unpaid", "paid"],
          description: "Optional status filter. Default unpaid when asking what is owed.",
        },
      },
      required: [],
    },
  },
];

export type ContractorCostToolResult = {
  payments: Array<{
    contractorId: number;
    contractorName: string;
    fortnightStartDate: string;
    fortnightEndDate: string | null;
    amount: number;
    currency: string;
    transferReference: string;
    status: "paid" | "unpaid";
  }>;
  totalOwed: number;
};

function toChatPayments(payments: ContractorFortnightPayment[]): ContractorCostToolResult {
  return {
    payments: payments.map((payment) => ({
      contractorId: payment.contractorId,
      contractorName: payment.contractorName,
      fortnightStartDate: payment.fortnightStartDate,
      fortnightEndDate: payment.fortnightEndDate,
      amount: payment.amount,
      currency: payment.currency,
      transferReference: payment.transferReference,
      status: payment.status,
    })),
    totalOwed: payments
      .filter((payment) => payment.status === "unpaid")
      .reduce((sum, payment) => sum + payment.amount, 0),
  };
}

export function canAccessInvoiceMateContractorCosts(user: unknown): boolean {
  return (
    userHasFeature(user, "nav:invoices") &&
    (userHasFeature(user, "nav:contractor-costs") || userHasFeature(user, "contractors"))
  );
}


export async function executeContractorCostTool(
  name: string,
  args: Record<string, unknown>,
  user: unknown,
): Promise<unknown> {
  if (name !== "listContractorCosts") return { error: `Unknown contractor cost tool: ${name}` };
  if (!canAccessInvoiceMateContractorCosts(user)) {
    return { error: "You do not have access to contractor costs." };
  }

  const payload = await getPayload({ config });
  const overview = await loadContractorOverview(payload);
  const status = args.status === "paid" || args.status === "unpaid" ? args.status : "unpaid";
  const contractorName = typeof args.contractorName === "string" ? args.contractorName : undefined;
  const payments = filterContractorPayments(overview.fortnightlyPayments, {
    contractorName,
    status,
  });

  return toChatPayments(payments);
}
