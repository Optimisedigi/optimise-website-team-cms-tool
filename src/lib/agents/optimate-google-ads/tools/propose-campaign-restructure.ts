/**
 * Tool: propose_campaign_restructure
 *
 * Queues a campaign-structure proposal for human approval. On Apply, the
 * dispatcher PATCHes the audit's proposal settings and kicks off the existing
 * Growth Tools `campaign-proposal/cms` pipeline (5\u201310 min run that PATCHes
 * the result back). Use this when the user wants a fresh campaign structure
 * (e.g. local services-geo split, new brand campaign, etc.).
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

const VALID_BUSINESS_TYPES = ["distributor", "ecommerce", "service", "other"] as const;
const VALID_CONVERSION_GOALS = ["leads", "sales", "bookings", "signups"] as const;
const VALID_SERVICE_RADII = ["local", "metro", "state", "national"] as const;
const VALID_SERVICE_SPLITS = ["single", "auto"] as const;
const VALID_PRIMARY_FOCUS = ["services", "products", "equal"] as const;
const VALID_ENABLED_CAMPAIGNS = ["brand", "brand-product", "products", "services", "services-geo", "industry"] as const;

type BusinessType = (typeof VALID_BUSINESS_TYPES)[number];
type ConversionGoal = (typeof VALID_CONVERSION_GOALS)[number];
type ServiceRadius = (typeof VALID_SERVICE_RADII)[number];
type ServiceSplit = (typeof VALID_SERVICE_SPLITS)[number];
type PrimaryFocus = (typeof VALID_PRIMARY_FOCUS)[number];
type EnabledCampaign = (typeof VALID_ENABLED_CAMPAIGNS)[number];

interface ProposalSettings {
  proposalBusinessType?: BusinessType;
  proposalConversionGoal?: ConversionGoal;
  proposalServiceRadius?: ServiceRadius;
  proposalServiceSplit?: ServiceSplit;
  proposalPrimaryFocus?: PrimaryFocus;
  proposalEnabledCampaigns?: EnabledCampaign[];
  proposalMinAdGroupVolume?: number;
  proposalMinBrandImpressions?: number;
  proposalMaxIndustryVerticals?: number;
  proposalMaxAdGroupsPerCampaign?: number;
  proposalBrandVolumeExempt?: boolean;
}

interface ProposeCampaignRestructureArgs {
  proposalSettings: ProposalSettings;
  summary: string;
  supportingNumbers?: string[];
}

export const proposeCampaignRestructure: CanonicalTool<ProposeCampaignRestructureArgs> = {
  name: "propose_campaign_restructure",
  description:
    "Queue a fresh campaign-structure proposal for human approval. On Apply, the audit's proposal settings are PATCHed and Growth Tools generates the structure (5\u201310 min). Use for scenarios like 'split services into geo-targeted ad groups', 'add a brand campaign', etc. Always include supportingNumbers citing the search-term or campaign data that justifies the change.",
  inputSchema: {
    type: "object",
    properties: {
      proposalSettings: {
        type: "object",
        description: "Settings written to the audit doc before kicking off Growth Tools. All fields optional \u2014 omitted fields keep their current value.",
        properties: {
          proposalBusinessType: { type: "string", enum: VALID_BUSINESS_TYPES as unknown as string[] },
          proposalConversionGoal: { type: "string", enum: VALID_CONVERSION_GOALS as unknown as string[] },
          proposalServiceRadius: { type: "string", enum: VALID_SERVICE_RADII as unknown as string[] },
          proposalServiceSplit: { type: "string", enum: VALID_SERVICE_SPLITS as unknown as string[] },
          proposalPrimaryFocus: { type: "string", enum: VALID_PRIMARY_FOCUS as unknown as string[] },
          proposalEnabledCampaigns: {
            type: "array",
            items: { type: "string", enum: VALID_ENABLED_CAMPAIGNS as unknown as string[] },
          },
          proposalMinAdGroupVolume: { type: "integer", minimum: 0 },
          proposalMinBrandImpressions: { type: "integer", minimum: 0 },
          proposalMaxIndustryVerticals: { type: "integer", minimum: 0 },
          proposalMaxAdGroupsPerCampaign: { type: "integer", minimum: 0 },
          proposalBrandVolumeExempt: { type: "boolean" },
        },
        additionalProperties: false,
      },
      summary: { type: "string", minLength: 10, maxLength: 1200 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["proposalSettings", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");

    const settingsRaw = obj.proposalSettings;
    if (!settingsRaw || typeof settingsRaw !== "object") throw new Error("proposalSettings is required");
    const sObj = settingsRaw as Record<string, unknown>;
    const settings: ProposalSettings = {};

    if (typeof sObj.proposalBusinessType === "string") {
      if (!(VALID_BUSINESS_TYPES as readonly string[]).includes(sObj.proposalBusinessType)) {
        throw new Error("proposalBusinessType invalid");
      }
      settings.proposalBusinessType = sObj.proposalBusinessType as BusinessType;
    }
    if (typeof sObj.proposalConversionGoal === "string") {
      if (!(VALID_CONVERSION_GOALS as readonly string[]).includes(sObj.proposalConversionGoal)) {
        throw new Error("proposalConversionGoal invalid");
      }
      settings.proposalConversionGoal = sObj.proposalConversionGoal as ConversionGoal;
    }
    if (typeof sObj.proposalServiceRadius === "string") {
      if (!(VALID_SERVICE_RADII as readonly string[]).includes(sObj.proposalServiceRadius)) {
        throw new Error("proposalServiceRadius invalid");
      }
      settings.proposalServiceRadius = sObj.proposalServiceRadius as ServiceRadius;
    }
    if (typeof sObj.proposalServiceSplit === "string") {
      if (!(VALID_SERVICE_SPLITS as readonly string[]).includes(sObj.proposalServiceSplit)) {
        throw new Error("proposalServiceSplit invalid");
      }
      settings.proposalServiceSplit = sObj.proposalServiceSplit as ServiceSplit;
    }
    if (typeof sObj.proposalPrimaryFocus === "string") {
      if (!(VALID_PRIMARY_FOCUS as readonly string[]).includes(sObj.proposalPrimaryFocus)) {
        throw new Error("proposalPrimaryFocus invalid");
      }
      settings.proposalPrimaryFocus = sObj.proposalPrimaryFocus as PrimaryFocus;
    }
    if (Array.isArray(sObj.proposalEnabledCampaigns)) {
      const arr = (sObj.proposalEnabledCampaigns as unknown[])
        .map((s) => (typeof s === "string" ? s : ""))
        .filter((s): s is EnabledCampaign => (VALID_ENABLED_CAMPAIGNS as readonly string[]).includes(s));
      if (arr.length > 0) settings.proposalEnabledCampaigns = arr;
    }
    for (const k of [
      "proposalMinAdGroupVolume",
      "proposalMinBrandImpressions",
      "proposalMaxIndustryVerticals",
      "proposalMaxAdGroupsPerCampaign",
    ] as const) {
      if (sObj[k] !== undefined) {
        const n = Number(sObj[k]);
        if (Number.isFinite(n) && n >= 0) settings[k] = Math.floor(n);
      }
    }
    if (typeof sObj.proposalBrandVolumeExempt === "boolean") {
      settings.proposalBrandVolumeExempt = sObj.proposalBrandVolumeExempt;
    }

    const out: ProposeCampaignRestructureArgs = { proposalSettings: settings, summary };
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers
        .map((s) => (typeof s === "string" ? s : String(s)))
        .filter((s) => s.trim().length > 0);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    const clientId = ctx.context.clientId as string | number | undefined;

    const settingsLines: string[] = Object.entries(args.proposalSettings).map(([k, v]) => {
      if (Array.isArray(v)) return `- **${k}**: ${v.join(", ")}`;
      return `- **${k}**: ${String(v)}`;
    });

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: settingsLines.length > 0
        ? `**Proposed audit settings**\n\n${settingsLines.join("\n")}`
        : "_No setting changes \u2014 will re-run with current audit settings._",
      applyEffect: `Will PATCH audit #${auditId ?? "?"} with the settings above and POST to Growth Tools \`campaign-proposal/cms\`. Run takes 5\u201310 min; check status with get_campaign_proposal_status.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        proposalType: "campaign-restructure",
        title: `Restructure campaigns \u2014 audit #${auditId ?? "?"}`,
        clientId,
        proposalPayload: { auditId: auditId ?? null, proposalSettings: args.proposalSettings },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: `/agent-approvals/${approvalId}` } };
  },
};
