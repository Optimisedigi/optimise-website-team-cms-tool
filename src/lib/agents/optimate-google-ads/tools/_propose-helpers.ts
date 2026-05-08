/**
 * Shared scaffolding for the propose-* tools.
 *
 * Every propose-* tool:
 *  1. Validates inputs against a tool-specific schema.
 *  2. Renders an internalMarkdown summary the human reads in
 *     /agent-approvals/[id] (and the inline chat-bubble proposal card).
 *  3. Calls queueProposal() (this module) which:
 *       a. enforces the per-turn proposal cap (5 by default), and
 *       b. delegates to queueForApproval() in _shared/approval-queue.
 *
 * The per-turn cap is keyed by `agentRunId` so a runaway agent that calls
 * five propose-* tools in one chat turn gets a hard error on the sixth. The
 * cap is in-memory — across processes (Vercel, multi-instance) you'd see
 * up to 5 × N proposals per turn, which is acceptable for a chat agent that
 * always runs in a single function invocation.
 */

import { queueForApproval, type QueueForApprovalInput } from "@/lib/agents/_shared/approval-queue";

const MAX_PROPOSALS_PER_TURN = 5;

const counts = new Map<string, number>();

export function resetProposalCounter(agentRunId: string): void {
  counts.delete(agentRunId);
}

interface ProposalAccountingInput extends QueueForApprovalInput {
  agentRunId: string;
}

export async function queueProposal(input: ProposalAccountingInput): Promise<number> {
  const current = counts.get(input.agentRunId) ?? 0;
  if (current >= MAX_PROPOSALS_PER_TURN) {
    throw new Error(
      `Proposal cap reached for this turn (${MAX_PROPOSALS_PER_TURN}). ` +
        `Bundle related changes into one proposal, or split across separate chat turns.`,
    );
  }
  counts.set(input.agentRunId, current + 1);
  return queueForApproval(input);
}

/**
 * Render an internal-markdown block that follows the convention required by
 * the system prompt: 1-line summary, supporting numbers (caller-supplied),
 * proposed change/diff (caller-supplied), and the apply-effect line.
 */
export function buildInternalMarkdown(args: {
  summary: string;
  supportingNumbers?: string[];
  diffSection: string;
  applyEffect: string;
}): string {
  const lines: string[] = [];
  lines.push("**Summary**");
  lines.push("");
  lines.push(args.summary.trim());
  lines.push("");

  if (args.supportingNumbers && args.supportingNumbers.length > 0) {
    lines.push("**Supporting numbers**");
    lines.push("");
    for (const n of args.supportingNumbers) {
      lines.push(`- ${n.trim()}`);
    }
    lines.push("");
  }

  lines.push("**Proposed change**");
  lines.push("");
  lines.push(args.diffSection.trim());
  lines.push("");

  lines.push("**Apply effect**");
  lines.push("");
  lines.push(args.applyEffect.trim());
  return lines.join("\n");
}

/** Markdown table builder. Pass an array of column headers + array of row arrays. */
export function mdTable(headers: string[], rows: string[][]): string {
  const escape = (s: string) => s.replace(/\|/g, "\\|");
  const out: string[] = [];
  out.push(`| ${headers.map(escape).join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map(escape).join(" | ")} |`);
  }
  return out.join("\n");
}
