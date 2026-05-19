/**
 * Tool: propose_nkl_push_live
 *
 * Queues a "push this NKL's keywords to Google Ads" action for human approval.
 * On Apply, dispatcher calls Growth Tools `negative-sweep/apply` with the
 * NKL's current keywords. The list itself must already exist (created via
 * propose_nkl_create or in the CMS UI).
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

interface ProposeNklPushArgs {
  nklId: number;
  summary: string;
  supportingNumbers?: string[];
}

export const proposeNklPushLive: CanonicalTool<ProposeNklPushArgs> = {
  name: "propose_nkl_push_live",
  description:
    "Queue a live push of an existing NKL's keywords to Google Ads for human approval. The list must already exist (use propose_nkl_create first). On Apply, all keywords on the NKL are pushed to the linked customer ID via Growth Tools.",
  inputSchema: {
    type: "object",
    properties: {
      nklId: { type: "integer", description: "The negative-keyword-lists doc id to push." },
      summary: { type: "string", minLength: 10, maxLength: 600 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["nklId", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const nklId = Number(obj.nklId);
    if (!Number.isFinite(nklId) || nklId <= 0) throw new Error("nklId must be a positive integer");
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    const out: ProposeNklPushArgs = { nklId, summary };
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers
        .map((s) => (typeof s === "string" ? s : String(s)))
        .filter((s) => s.trim().length > 0);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as string | number | undefined;
    const auditId = ctx.context.auditId as string | number | undefined;
    const customerId = ctx.context.customerId as string | undefined;

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: `Push the full keyword set from \`negative-keyword-lists\` doc #${args.nklId} to Google Ads customer ${customerId ?? "?"}.`,
      applyEffect: `Will call Growth Tools \`negative-sweep/apply\` against audit #${auditId ?? "?"}. Existing keywords already negated remain unchanged; new ones get added.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "nkl-push-live",
        title: `Push NKL #${args.nklId} to Google Ads`,
        clientId,
        proposalPayload: { nklId: args.nklId, auditId: auditId ?? null },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: `/agent-approvals/${approvalId}`, nklId: args.nklId } };
  },
};
