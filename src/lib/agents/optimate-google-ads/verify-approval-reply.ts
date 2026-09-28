type ApprovalRef = Readonly<{ id: number }>;

/** Do not show a newly queued approval link unless this run can read its row. */
export function verifyApprovalReply(reply: string, proposals: readonly ApprovalRef[]): string {
  if (!/\bqueued\b/i.test(reply)) return reply;

  const ids = [
    ...reply.matchAll(/\/admin\/agent-approvals\/(\d+)|\bapproval\s*#(\d+)/gi),
  ].map((match) => Number(match[1] ?? match[2]));
  if (ids.length === 0) return reply;

  const persisted = new Set(proposals.map((proposal) => proposal.id));
  if (ids.every((id) => persisted.has(id))) return reply;

  return "I couldn't verify the queued approval in the review list, so I can't give you an approval link or confirm the goal was queued. Please retry the request.";
}
