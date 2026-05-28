"use client";

/**
 * Action buttons for the approval review page. Posts to the per-action
 * routes; on success, refreshes the page to pick up the new status.
 */

import { useState } from "react";

type Action = "approve" | "reject" | "apply";

interface Props {
  approvalId: number;
  status: string;
  /** When false, the Approve and Apply buttons are disabled (server-side
   *  gating still applies regardless). Reject stays open to all reviewers,
   *  per the spec: anyone can reject; only admins approve or apply. */
  canApproveOrApply: boolean;
}

const CMS_BLUE = "#0b5394";

const baseBtn: React.CSSProperties = {
  padding: "9px 16px",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
};

export default function ApprovalActions({ approvalId, status, canApproveOrApply }: Props) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action) => {
    if (busy) return;
    if (action === "reject" && !confirm("Reject this proposal?")) return;
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/agent-approvals/${approvalId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `${action} failed (${res.status})`);
      }
      // Hard reload so the server component picks up the new status.
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const isPending = status === "pending";
  const isApproved = status === "approved";
  const approveDisabled = !isPending || busy !== null || !canApproveOrApply;
  const applyDisabled = !isApproved || busy !== null || !canApproveOrApply;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        disabled={approveDisabled}
        onClick={() => run("approve")}
        title={!canApproveOrApply ? "Admin role required" : undefined}
        style={{
          ...baseBtn,
          background: approveDisabled ? "#9ca3af" : "#15803d",
          color: "#fff",
          cursor: approveDisabled ? "not-allowed" : "pointer",
        }}
      >
        {busy === "approve" ? "Approving…" : "Approve"}
      </button>
      <button
        type="button"
        disabled={!isPending || busy !== null}
        onClick={() => run("reject")}
        style={{
          ...baseBtn,
          background: !isPending || busy !== null ? "#9ca3af" : "#dc2626",
          color: "#fff",
          cursor: !isPending || busy !== null ? "not-allowed" : "pointer",
        }}
      >
        {busy === "reject" ? "Rejecting…" : "Reject"}
      </button>
      <button
        type="button"
        disabled={applyDisabled}
        onClick={() => run("apply")}
        title={
          !canApproveOrApply
            ? "Admin role required"
            : isApproved
              ? "Mark as applied (operator pushes change manually)"
              : "Approve before applying"
        }
        style={{
          ...baseBtn,
          background: applyDisabled ? "#9ca3af" : CMS_BLUE,
          color: "#fff",
          cursor: applyDisabled ? "not-allowed" : "pointer",
        }}
      >
        {busy === "apply" ? "Applying…" : "Apply"}
      </button>
      {error && (
        <span style={{ color: "#dc2626", fontSize: 12 }}>{error}</span>
      )}
    </div>
  );
}
