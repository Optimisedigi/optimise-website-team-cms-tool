"use client";

import { useMemo, useState } from "react";
import styles from "./approvals.module.css";

type BulkApprovalRow = {
  id: number;
  title: string;
  status: string;
  /** Phone card details (optional so the desktop bulk bar works without them). */
  agentName?: string;
  clientLabel?: string;
  age?: string;
  href?: string;
};

function statusColors(s: string): { bg: string; fg: string } {
  switch (s) {
    case "pending":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "approved":
      return { bg: "#dbeafe", fg: "#1e40af" };
    case "rejected":
    case "failed":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "applied":
      return { bg: "#dcfce7", fg: "#166534" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

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

  const desktopBar = pendingRows.length === 0 ? null : (
    <div
      className={styles.desktopOnly}
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

  const cards = rows.length === 0 ? null : (
    <div className={styles.phoneOnly}>
      <ul className={styles.cards} aria-label="Approvals">
        {rows.map((row) => {
          const sc = statusColors(row.status);
          const selectable = row.status === "pending";
          const selected = selectedSet.has(row.id);
          const details = (
            <span className={styles.cardBody}>
              <span className={styles.cardTitle}>{row.title}</span>
              <span className={styles.chips}>
                {row.agentName ? <span className={styles.chip}>{row.agentName}</span> : null}
                {row.clientLabel ? <span className={styles.chip}>{row.clientLabel}</span> : null}
                {row.age ? <span className={styles.chip}>{row.age}</span> : null}
                <span className={styles.chip} style={{ background: sc.bg, color: sc.fg, fontWeight: 700 }}>
                  {row.status}
                </span>
              </span>
            </span>
          );
          return (
            <li key={row.id} className={`${styles.card} ${selected ? styles.cardSelected : ""}`} data-testid="approval-card">
              {selectable ? (
                // The whole card (bar the Review link) toggles selection.
                <label className={styles.cardMain}>
                  <span className={styles.cardSelect}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleOne(row.id)}
                      disabled={busy}
                      aria-label={`Select ${row.title}`}
                    />
                  </span>
                  {details}
                </label>
              ) : (
                <div className={styles.cardMain}>{details}</div>
              )}
              {row.href ? (
                <a href={row.href} className={styles.review}>
                  Review
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {selectedIds.length > 0 ? (
        <div className={styles.stickyBar} role="region" aria-label="Selected approvals">
          <button type="button" onClick={toggleAll} disabled={busy} style={buttonStyle}>
            {allSelected ? "Clear selection" : `Select all pending (${pendingRows.length})`}
          </button>
          <button type="button" onClick={rejectSelected} disabled={busy} style={{ ...buttonStyle, background: "#991b1b" }}>
            {busy ? "Rejecting…" : `Reject selected (${selectedIds.length})`}
          </button>
          {message && <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 700, width: "100%" }}>{message}</span>}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {desktopBar}
      {cards}
    </>
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
