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
}

const baseBtn: React.CSSProperties = {
  padding: "8px 16px",
  border: "none",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export default function ApprovalActions({ approvalId, status }: Props) {
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

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        disabled={!isPending || busy !== null}
        onClick={() => run("approve")}
        style={{
          ...baseBtn,
          background: !isPending || busy !== null ? "#9ca3af" : "#16a34a",
          color: "#fff",
          cursor: !isPending || busy !== null ? "not-allowed" : "pointer",
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
        disabled={!isApproved || busy !== null}
        onClick={() => run("apply")}
        title={isApproved ? "Mark as applied (operator pushes change manually)" : "Approve before applying"}
        style={{
          ...baseBtn,
          background: !isApproved || busy !== null ? "#9ca3af" : "#0b5394",
          color: "#fff",
          cursor: !isApproved || busy !== null ? "not-allowed" : "pointer",
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
