/**
 * Tool: propose_ad_copy_generate
 *
 * Queues "prepare audit for ad-copy generation" — saves brand headlines (if
 * any) and stamps adCopyStatus="draft" so the operator can click Generate
 * in the audit UI. We do NOT auto-trigger the Kimi run from the agent —
 * that route relies on cookie auth and `after()`, and is best run via the
 * existing UI button.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

interface ProposeAdCopyGenerateArgs {
  brandHeadlines?: string[];
  summary: string;
  supportingNumbers?: string[];
}

export const proposeAdCopyGenerate: CanonicalTool<ProposeAdCopyGenerateArgs> = {
  name: "propose_ad_copy_generate",
  description:
    "Queue ad-copy generation prep for human approval. Optionally provide brand headlines (each ≤30 chars) the generator will pin into 1–3 of every ad group's headlines. The campaign proposal must already be approved on the audit before generation will work.",
  inputSchema: {
    type: "object",
    properties: {
      brandHeadlines: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 30 },
        maxItems: 10,
        description: "Up to 10 brand headlines, each ≤30 chars (Google Ads RSA limit).",
      },
      summary: { type: "string", minLength: 10, maxLength: 600 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    const out: ProposeAdCopyGenerateArgs = { summary };
    if (Array.isArray(obj.brandHeadlines)) {
      const lines = obj.brandHeadlines
        .map((h) => (typeof h === "string" ? h.trim() : ""))
        .filter((h) => h.length > 0);
      const tooLong = lines.find((h) => h.length > 30);
      if (tooLong) throw new Error(`brand headline "${tooLong}" exceeds 30 chars`);
      if (lines.length > 0) out.brandHeadlines = lines;
    }
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

    const brandSection = args.brandHeadlines && args.brandHeadlines.length > 0
      ? `**Brand headlines (${args.brandHeadlines.length})**\n\n${args.brandHeadlines.map((h) => `- ${h}`).join("\n")}`
      : "_No brand headlines specified — Kimi will write all 10 headlines per ad group from scratch._";

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: brandSection,
      applyEffect: `Will set audit #${auditId ?? "?"} \`adCopyStatus\`="draft"${args.brandHeadlines ? " and save brand headlines" : ""}. Operator: open the audit and click "Generate Ad Copy" to start the Kimi run.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        proposalType: "ad-copy-generate",
        title: `Prepare audit #${auditId ?? "?"} for ad-copy generation`,
        clientId,
        proposalPayload: {
          auditId: auditId ?? null,
          ...(args.brandHeadlines ? { brandHeadlines: args.brandHeadlines } : {}),
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: `/agent-approvals/${approvalId}` } };
  },
};
