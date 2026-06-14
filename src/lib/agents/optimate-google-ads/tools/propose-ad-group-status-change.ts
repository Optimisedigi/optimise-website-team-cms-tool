import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { ensureCustomerId, growthToolsPost } from "./_growth-tools";
import { buildInternalMarkdown, mdTable, queueProposal } from "./_propose-helpers";

type StatusOperation = "pause" | "enable";

interface AdGroupStatusChangeInput {
  campaignId: string;
  campaignName?: string;
  adGroupId: string;
  adGroupName: string;
  operation: StatusOperation;
  expectedStatus?: string;
}

interface ProposeAdGroupStatusChangeArgs {
  adGroups: AdGroupStatusChangeInput[];
  summary: string;
  supportingNumbers?: string[];
}

interface LiveAdGroupRow {
  campaignId?: string;
  campaignName?: string;
  adGroupId?: string;
  adGroupName?: string;
  status?: string;
}

interface AdGroupEnvelope {
  adGroups?: LiveAdGroupRow[];
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

async function assertAdGroupsExistForCustomer(
  rawCustomerId: string | undefined,
  adGroups: AdGroupStatusChangeInput[],
): Promise<AdGroupStatusChangeInput[]> {
  const customerId = ensureCustomerId(rawCustomerId);
  const campaignIds = Array.from(new Set(adGroups.map((adGroup) => adGroup.campaignId))).sort();
  const liveRows: LiveAdGroupRow[] = [];

  for (const campaignId of campaignIds) {
    const res = await growthToolsPost<AdGroupEnvelope>("/api/google-ads/ad-groups/list", {
      customerId,
      campaignId,
      dateRange: "LAST_7_DAYS",
      limit: 500,
    });
    if (!res.ok) throw new Error(`Could not verify ad group IDs: ${res.error}`);
    liveRows.push(...(res.data?.adGroups ?? []));
  }

  const liveByKey = new Map<string, LiveAdGroupRow>();
  for (const row of liveRows) {
    const campaignId = String(row.campaignId ?? "").trim();
    const adGroupId = String(row.adGroupId ?? "").trim();
    if (campaignId && adGroupId) liveByKey.set(`${campaignId}:${adGroupId}`, row);
  }

  const unknown = adGroups.filter((adGroup) => !liveByKey.has(`${adGroup.campaignId}:${adGroup.adGroupId}`));
  if (unknown.length > 0) {
    const sample = unknown.slice(0, 5).map((adGroup) => `${adGroup.adGroupName} (${adGroup.campaignId}/${adGroup.adGroupId})`).join(", ");
    throw new Error(
      `Ad group status proposal rejected: ${unknown.length} ad group ID${unknown.length === 1 ? "" : "s"} were not found in the linked Google Ads account. Use get_ad_group_performance and retry with exact IDs. Unknown: ${sample}`,
    );
  }

  return adGroups.map((adGroup) => {
    const live = liveByKey.get(`${adGroup.campaignId}:${adGroup.adGroupId}`);
    return {
      ...adGroup,
      campaignName: String(live?.campaignName ?? adGroup.campaignName ?? "").trim() || adGroup.campaignName,
      adGroupName: String(live?.adGroupName ?? adGroup.adGroupName).trim() || adGroup.adGroupName,
      expectedStatus: adGroup.expectedStatus ?? (typeof live?.status === "string" ? live.status.toUpperCase() : undefined),
    };
  });
}

export const proposeAdGroupStatusChange: CanonicalTool<ProposeAdGroupStatusChangeArgs> = {
  name: "propose_ad_group_status_change",
  description:
    "Queue ad group pause/enable changes for human approval. This never applies Google Ads changes directly; on approval it calls the internal Growth Tools ad-group status endpoint. Use exact campaignId and adGroupId from get_ad_group_performance.",
  inputSchema: {
    type: "object",
    properties: {
      adGroups: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            campaignId: { type: "string", minLength: 1 },
            campaignName: { type: "string" },
            adGroupId: { type: "string", minLength: 1 },
            adGroupName: { type: "string", minLength: 1 },
            operation: { type: "string", enum: ["pause", "enable"] },
            expectedStatus: { type: "string", description: "Optional current status to verify at apply time, e.g. ENABLED or PAUSED." },
          },
          required: ["campaignId", "adGroupId", "adGroupName", "operation"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 12 },
    },
    required: ["adGroups", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    if (summary.length > 800) throw new Error("summary must be ≤ 800 characters");

    const rawAdGroups = Array.isArray(obj.adGroups) ? obj.adGroups : [];
    if (rawAdGroups.length === 0) throw new Error("adGroups array required");
    if (rawAdGroups.length > 50) throw new Error("adGroups cannot exceed 50 entries");

    const adGroups = rawAdGroups.map((entry, index) => {
      if (!entry || typeof entry !== "object") throw new Error(`adGroups[${index}] not an object`);
      const row = entry as Record<string, unknown>;
      const campaignId = parseGoogleAdsEntityId(row.campaignId, "campaigns");
      const campaignName = typeof row.campaignName === "string" ? row.campaignName.trim() : undefined;
      const adGroupId = parseGoogleAdsEntityId(row.adGroupId, "adGroups");
      const adGroupName = String(row.adGroupName ?? "").trim();
      const operation = String(row.operation ?? "").toLowerCase() as StatusOperation;
      if (!campaignId) throw new Error(`adGroups[${index}] missing campaignId`);
      if (!adGroupId) throw new Error(`adGroups[${index}] missing adGroupId`);
      if (!adGroupName) throw new Error(`adGroups[${index}] missing adGroupName`);
      if (!VALID_OPERATIONS.has(operation)) throw new Error(`adGroups[${index}] operation must be pause or enable`);
      const out: AdGroupStatusChangeInput = { campaignId, adGroupId, adGroupName, operation };
      if (campaignName) out.campaignName = campaignName;
      if (typeof row.expectedStatus === "string" && row.expectedStatus.trim()) out.expectedStatus = row.expectedStatus.trim().toUpperCase();
      return out;
    });

    const out: ProposeAdGroupStatusChangeArgs = { adGroups, summary };
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers.map((value) => String(value).trim()).filter(Boolean);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    const clientId = ctx.context.clientId as string | number | undefined;
    const customerId = ctx.context.customerId as string | undefined;

    let adGroups: AdGroupStatusChangeInput[];
    try {
      adGroups = await assertAdGroupsExistForCustomer(customerId, args.adGroups);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const diffSection = mdTable(
      ["Campaign", "Ad group", "Expected", "Proposed"],
      adGroups.map((adGroup) => [
        `${adGroup.campaignName ?? adGroup.campaignId} (${adGroup.campaignId})`,
        `${adGroup.adGroupName} (${adGroup.adGroupId})`,
        adGroup.expectedStatus ?? "verify live at apply",
        desiredStatus(adGroup.operation),
      ]),
    );

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection,
      applyEffect: `Will call Growth Tools \`/api/google-ads/ad-groups/pause\` against customer ${customerId ?? "?"} only after this approval is applied. No live ad group status changes happen in chat.`,
    });

    try {
      const approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "ad-group-status-change",
        title: `Update statuses for ${adGroups.length} ad group${adGroups.length === 1 ? "" : "s"}`,
        clientId,
        proposalPayload: { auditId: auditId ?? null, adGroups },
        rendered: { internalMarkdown },
      });
      return { ok: true, data: { approvalId, approvalUrl: agentApprovalPath(approvalId) } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
