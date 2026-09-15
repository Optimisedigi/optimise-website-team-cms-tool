import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { firstMonthRetainerAmount } from "@/lib/client-revenue";
import type { ToolDef } from "@/lib/agents/_shared/llm/types";

export const CLIENT_BILLING_TOOL_NAMES = new Set(["getClientBillingProfile"]);

export const clientBillingTools: ToolDef[] = [
  {
    name: "getClientBillingProfile",
    description:
      "Find a client in the CMS and return invoice-ready billing facts: client and retainer start dates, client type, monthly retainer, calculated first-month proration, setup fee, and one-off projects. Use this before drafting an invoice from a client's billing profile.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: {
          type: "string",
          description: "Client or business name to search for",
        },
      },
      required: ["clientName"],
    },
  },
];

export async function executeClientBillingTool(
  name: string,
  args: Record<string, unknown>,
  user: unknown,
): Promise<unknown> {
  if (name !== "getClientBillingProfile") return { error: `Unknown client billing tool: ${name}` };
  if (!userHasFeature(user, "nav:invoices") || !userHasFeature(user, "clients")) {
    return { error: "You do not have access to client billing profiles." };
  }

  const clientName = typeof args.clientName === "string" ? args.clientName.trim() : "";
  if (!clientName) return { error: "clientName is required" };
  if (clientName.length > 120) return { error: "clientName must be 120 characters or fewer" };

  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "clients",
    overrideAccess: false,
    user: user as never,
    depth: 0,
    limit: 10,
    sort: "name",
    where: {
      or: [
        { name: { contains: clientName } },
        { tradingName: { contains: clientName } },
      ],
    },
    select: {
      name: true,
      tradingName: true,
      clientType: true,
      clientStartDate: true,
      retainerStartDate: true,
      monthlyRetainer: true,
      setupFee: true,
      oneOffProjects: true,
    },
  });

  return {
    profiles: result.docs.map((client) => {
      const retainerStartDate = client.retainerStartDate ?? client.clientStartDate ?? null;
      return {
        clientId: client.id,
        name: client.name,
        tradingName: client.tradingName ?? null,
        clientType: client.clientType ?? null,
        clientStartDate: client.clientStartDate ?? null,
        retainerStartDate,
        monthlyRetainer: client.monthlyRetainer ?? 0,
        firstMonthProratedAmount: firstMonthRetainerAmount(client.monthlyRetainer, retainerStartDate),
        setupFee: client.setupFee ?? 0,
        oneOffProjects: (client.oneOffProjects ?? []).map((project) => ({
          projectName: project.projectName,
          amount: project.amount,
          date: project.date,
          countTowardsRetainer: Boolean(project.countTowardsRetainer),
        })),
      };
    }),
  };
}
