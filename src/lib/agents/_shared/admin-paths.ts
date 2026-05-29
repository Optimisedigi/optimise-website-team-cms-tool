/**
 * Canonical in-app paths for agent approval screens.
 *
 * The agent approval pages live under the Payload admin shell
 * (`src/app/(payload)/admin/agent-*`) so they render with the sidebar/header.
 * Keeping the base path in ONE place stops the 13+ propose-* tools, the system
 * prompt, notifications, and chat link-parsing from drifting apart.
 */

export const AGENT_APPROVALS_BASE_PATH = "/admin/agent-approvals";

export function agentApprovalPath(id: number | string): string {
  return `${AGENT_APPROVALS_BASE_PATH}/${id}`;
}
