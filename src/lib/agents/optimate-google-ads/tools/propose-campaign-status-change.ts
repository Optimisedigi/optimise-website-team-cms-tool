import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { assertCampaignsExistForCustomer } from "./_campaign-validation";
import { buildInternalMarkdown, mdTable, queueProposal } from "./_propose-helpers";

type StatusOperation = "pause" | "enable";

interface CampaignStatusChangeInput {
  campaignId: string;
  campaignName: string;
  operation: StatusOperation;
  expectedStatus?: string;
}

interface ProposeCampaignStatusChangeArgs {
  campaigns: CampaignStatusChangeInput[];
  summary: string;
  supportingNumbers?: string[];
}

const VALID_OPERATIONS: ReadonlySet<StatusOperation> = new Set(["pause", "enable"]);

function desiredStatus(operation: StatusOperation): string {
  return operation === "pause" ? "PAUSED" : "ENABLED";
}

function parseGoogleAdsEntityId(value: unknown, entityPath: "campaigns" | "adGroups"): string {
  const raw = String(value ?? "").trim();
  const resourceMatch = raw.match(new RegExp(`${entityPath}/(\\d+)$`));
  if (resourceMatch?.[1]) return resourceMatch[1];
  if (/^\d+$/.test(raw)) return raw;
  return "";
}

export const proposeCampaignStatusChange: CanonicalTool<ProposeCampaignStatusChangeArgs> = {
  name: "propose_campaign_status_change",
  description:
    "Queue campaign pause/enable changes for human approval. This never applies Google Ads changes directly; on approval it calls the internal Growth Tools campaign status endpoint. Use exact Google Ads campaign IDs from get_campaign_performance/get_account_overview.",
  inputSchema: {
    type: "object",
    properties: {
      campaigns: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            campaignId: { type: "string", minLength: 1 },
            campaignName: { type: "string", minLength: 1 },
            operation: { type: "string", enum: ["pause", "enable"] },
            expectedStatus: { type: "string", description: "Optional current status to verify at apply time, e.g. ENABLED or PAUSED." },
          },
          required: ["campaignId", "campaignName", "operation"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 12 },
    },
    required: ["campaigns", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    if (summary.length > 800) throw new Error("summary must be ≤ 800 characters");

    const rawCampaigns = Array.isArray(obj.campaigns) ? obj.campaigns : [];
    if (rawCampaigns.length === 0) throw new Error("campaigns array required");
    if (rawCampaigns.length > 50) throw new Error("campaigns cannot exceed 50 entries");

    const campaigns = rawCampaigns.map((entry, index) => {
      if (!entry || typeof entry !== "object") throw new Error(`campaigns[${index}] not an object`);
      const row = entry as Record<string, unknown>;
      const campaignId = parseGoogleAdsEntityId(row.campaignId, "campaigns");
      const campaignName = String(row.campaignName ?? "").trim();
      const operation = String(row.operation ?? "").toLowerCase() as StatusOperation;
      if (!campaignId) throw new Error(`campaigns[${index}] missing campaignId`);
      if (!campaignName) throw new Error(`campaigns[${index}] missing campaignName`);
      if (!VALID_OPERATIONS.has(operation)) throw new Error(`campaigns[${index}] operation must be pause or enable`);
      const out: CampaignStatusChangeInput = { campaignId, campaignName, operation };
      if (typeof row.expectedStatus === "string" && row.expectedStatus.trim()) out.expectedStatus = row.expectedStatus.trim().toUpperCase();
      return out;
    });

    const out: ProposeCampaignStatusChangeArgs = { campaigns, summary };
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers.map((value) => String(value).trim()).filter(Boolean);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    const clientId = ctx.context.clientId as string | number | undefined;
    const customerId = ctx.context.customerId as string | undefined;

    let campaigns: CampaignStatusChangeInput[];
    try {
      campaigns = await assertCampaignsExistForCustomer(customerId, args.campaigns);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const diffSection = mdTable(
      ["Campaign", "ID", "Expected", "Proposed"],
      campaigns.map((campaign) => [
        campaign.campaignName,
        campaign.campaignId,
        campaign.expectedStatus ?? "verify live at apply",
        desiredStatus(campaign.operation),
      ]),
    );

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection,
      applyEffect: `Will call Growth Tools \`/api/google-ads/campaigns/status\` against customer ${customerId ?? "?"} only after this approval is applied. No live campaign status changes happen in chat.`,
    });

    try {
      const approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "campaign-status-change",
        title: `${campaigns.length === 1 ? desiredStatus(campaigns[0]?.operation ?? "pause") : "Update statuses for"} ${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`,
        clientId,
        proposalPayload: { auditId: auditId ?? null, campaigns },
        rendered: { internalMarkdown },
      });
      return { ok: true, data: { approvalId, approvalUrl: agentApprovalPath(approvalId) } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
