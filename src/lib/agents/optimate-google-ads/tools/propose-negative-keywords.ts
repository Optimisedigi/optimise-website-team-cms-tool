/**
 * Tool: propose_negative_keywords
 *
 * Queues a negative-keyword proposal into the agent-approval-queue. The agent
 * never writes to Google Ads directly — a human approves, and (in v1) the
 * operator pushes the change manually via the existing NLB flow.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal } from "./_propose-helpers";

type MatchType = "exact" | "phrase" | "broad";

interface Candidate {
  term: string;
  matchType: MatchType;
  reason: string;
}

interface ProposeNegativesArgs {
  candidates: Candidate[];
  summary: string;
}

const VALID_MATCH_TYPES: MatchType[] = ["exact", "phrase", "broad"];

export const proposeNegativeKeywords: CanonicalTool<ProposeNegativesArgs> = {
  name: "propose_negative_keywords",
  description:
    "Queue a negative-keyword list for human approval. Each candidate must include the term, matchType (exact/phrase/broad), and a one-line reason citing the metric that justifies it (e.g. '$140 spend, 0 conversions, 12 clicks'). The summary is a 1–3 sentence overview a reviewer will read first.",
  inputSchema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        minLength: 10,
        maxLength: 800,
        description: "Short overview a reviewer reads first.",
      },
      candidates: {
        type: "array",
        minItems: 1,
        maxItems: 200,
        items: {
          type: "object",
          properties: {
            term: { type: "string", minLength: 1, maxLength: 200 },
            matchType: { type: "string", enum: VALID_MATCH_TYPES },
            reason: { type: "string", minLength: 4, maxLength: 400 },
          },
          required: ["term", "matchType", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["candidates", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");

    const rawCands = Array.isArray(obj.candidates) ? obj.candidates : null;
    if (!rawCands || rawCands.length === 0) throw new Error("candidates must be a non-empty array");
    if (rawCands.length > 200) throw new Error("candidates cannot exceed 200 entries");

    const candidates: Candidate[] = rawCands.map((c, i) => {
      if (!c || typeof c !== "object") throw new Error(`candidate ${i} is not an object`);
      const co = c as Record<string, unknown>;
      const term = typeof co.term === "string" ? co.term.trim() : "";
      const matchType = co.matchType;
      const reason = typeof co.reason === "string" ? co.reason.trim() : "";
      if (!term) throw new Error(`candidate ${i}: term is required`);
      if (typeof matchType !== "string" || !VALID_MATCH_TYPES.includes(matchType as MatchType)) {
        throw new Error(`candidate ${i}: matchType must be exact, phrase, or broad`);
      }
      if (!reason) throw new Error(`candidate ${i}: reason is required`);
      return { term, matchType: matchType as MatchType, reason };
    });

    return { summary, candidates };
  },
  execute: async (args, ctx) => {
    const { candidates, summary } = args;
    const clientId = ctx.context.clientId as string | number | undefined;
    const auditId = ctx.context.auditId as string | number | undefined;
    const customerId = ctx.context.customerId as string | undefined;

    const internalMarkdown = renderInternalMarkdown(summary, candidates);
    const clientHtml = renderClientHtml(summary, candidates);

    const title = `${candidates.length} negative keyword${candidates.length === 1 ? "" : "s"} proposed${customerId ? ` (CID ${customerId})` : ""}`;

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "negative-keywords",
        title,
        clientId,
        proposalPayload: {
          summary,
          candidates,
          customerId: customerId ?? null,
          auditId: auditId ?? null,
        },
        rendered: { internalMarkdown, clientHtml },
      });
    } catch (err) {
      return { ok: false, error: `Failed to queue approval: ${(err as Error).message}` };
    }

    return {
      ok: true,
      data: {
        approvalId,
        approvalUrl: `/agent-approvals/${approvalId}`,
        candidatesQueued: candidates.length,
      },
    };
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInternalMarkdown(summary: string, candidates: Candidate[]): string {
  const lines: string[] = [];
  lines.push(`**Summary**`);
  lines.push("");
  lines.push(summary);
  lines.push("");
  lines.push(`**Candidates (${candidates.length})**`);
  lines.push("");
  lines.push("| Term | Match | Reason |");
  lines.push("| --- | --- | --- |");
  for (const c of candidates) {
    const term = c.term.replace(/\|/g, "\\|");
    const reason = c.reason.replace(/\|/g, "\\|");
    lines.push(`| ${term} | ${c.matchType} | ${reason} |`);
  }
  return lines.join("\n");
}

function renderClientHtml(summary: string, candidates: Candidate[]): string {
  const rows = candidates
    .map(
      (c) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(c.term)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-transform:capitalize;">${escapeHtml(c.matchType)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${escapeHtml(c.reason)}</td></tr>`,
    )
    .join("\n");
  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:640px;">
  <p style="margin:0 0 12px;">${escapeHtml(summary)}</p>
  <p style="margin:0 0 8px;font-size:13px;color:#555;">${candidates.length} candidate${candidates.length === 1 ? "" : "s"} proposed for review.</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead><tr style="background:#f5f5f5;text-align:left;">
      <th style="padding:6px 10px;">Term</th>
      <th style="padding:6px 10px;">Match</th>
      <th style="padding:6px 10px;">Why</th>
    </tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>`;
}
