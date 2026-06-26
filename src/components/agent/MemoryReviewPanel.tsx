"use client";

import React, { useEffect, useState } from "react";

interface MemoryReviewSummary {
  total: number;
  active: number;
  pinned: number;
  needsReview: number;
  archived: number;
  stale: number;
  neverUsed: number;
  lowConfidence: number;
  dueForReview: number;
  expired: number;
}

const panelShellStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 0,
  isolation: "isolate",
  contain: "layout paint",
  boxSizing: "border-box",
  width: "100%",
  clear: "both",
  overflow: "hidden",
  filter: "none",
  backdropFilter: "none",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--theme-elevation-150)",
  borderRadius: 6,
  padding: 12,
  background: "var(--theme-bg)",
};

const MemoryReviewPanel: React.FC = () => {
  const [summary, setSummary] = useState<MemoryReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/memory-review-summary");
        if (!res.ok) {
          if (!cancelled) setError(`Failed to load (HTTP ${res.status})`);
          return;
        }
        const json = (await res.json()) as MemoryReviewSummary;
        if (!cancelled) setSummary(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metric = (label: string, value: number, detail: string) => (
    <div style={cardStyle}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--theme-elevation-500)", marginTop: 4 }}>{detail}</div>
    </div>
  );

  return (
    <section
      role="region"
      aria-label="Memory review"
      style={{
        ...panelShellStyle,
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 6,
        padding: 16,
        marginBottom: "var(--base, 1rem)",
        background: "var(--theme-elevation-50)",
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Memory review</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--theme-elevation-500)", lineHeight: 1.5 }}>
        Long-term memory is stored in <strong>Agent Memory</strong>, scoped per client by default. Keep most rows search-only. Only pin facts that would be harmful to omit because pinned rows add tokens to every matching OptiMate prompt.
      </p>

      {loading && <div style={{ fontSize: 13, color: "var(--theme-elevation-500)" }}>Loading…</div>}
      {error && <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>}

      {summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {metric("Active memories", summary.active, `${summary.total.toLocaleString()} total rows`)}
            {metric("Pinned", summary.pinned, "Auto-loaded into matching prompts")}
            {metric("Needs review", summary.needsReview, "Marked manually for cleanup")}
            {metric("Never used", summary.neverUsed, "Searchable, but never retrieved")}
            {metric("Stale", summary.stale, "Not used in 90+ days")}
            {metric("Low confidence", summary.lowConfidence, "Confidence below 60")}
            {metric("Due", summary.dueForReview, "Past reviewAfter date")}
            {metric("Expired", summary.expired, "Ignored by retrieval")}
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--theme-elevation-500)", lineHeight: 1.5 }}>
            Review suggestions: archive memories that are stale and low-value, unpin rarely used pinned rows, merge duplicates by subject, and set review dates on facts tied to temporary campaigns or client preferences.
          </p>
        </>
      )}
    </section>
  );
};

export default MemoryReviewPanel;
