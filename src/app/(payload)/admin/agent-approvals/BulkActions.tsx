"use client";

import { useMemo, useState } from "react";

type BulkApprovalRow = {
  id: number;
  title: string;
  status: string;
};

export default function AgentApprovalsBulkActions({ rows }: { rows: BulkApprovalRow[] }) {
  const pendingRows = useMemo(() => rows.filter((row) => row.status === "pending"), [rows]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedSet = new Set(selectedIds);
  const allSelected = pendingRows.length > 0 && pendingRows.every((row) => selectedSet.has(row.id));

  const toggleAll = () => {
    setMessage("");
    setSelectedIds(allSelected ? [] : pendingRows.map((row) => row.id));
  };

  const toggleOne = (id: number) => {
    setMessage("");
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const rejectSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Reject ${selectedIds.length} selected approval${selectedIds.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/agent-approvals/bulk-reject", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to reject approvals");
      if (Array.isArray(json.failed) && json.failed.length > 0) {
        setMessage(`Rejected ${json.rejected || 0}; ${json.failed.length} failed.`);
        return;
      }
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to reject approvals");
    } finally {
      setBusy(false);
    }
  };

  if (pendingRows.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 12,
        padding: 12,
        border: "1px solid var(--theme-elevation-150, #dfe3ea)",
        borderRadius: 12,
        background: "var(--theme-elevation-0, #fff)",
      }}
    >
      <button type="button" onClick={toggleAll} disabled={busy} style={buttonStyle}>
        {allSelected ? "Clear selection" : `Select all pending (${pendingRows.length})`}
      </button>
      <button
        type="button"
        onClick={rejectSelected}
        disabled={busy || selectedIds.length === 0}
        style={{
          ...buttonStyle,
          background: "#991b1b",
          opacity: busy || selectedIds.length === 0 ? 0.55 : 1,
        }}
      >
        {busy ? "Rejecting…" : `Reject selected (${selectedIds.length})`}
      </button>
      {message && <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 700 }}>{message}</span>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
        {pendingRows.map((row) => (
          <label key={row.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={selectedSet.has(row.id)}
              onChange={() => toggleOne(row.id)}
              disabled={busy}
            />
            #{row.id} {row.title}
          </label>
        ))}
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "7px 14px",
  background: "#0b5394",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
