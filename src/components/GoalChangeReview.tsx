"use client";

/**
 * Read-only Change-Review widget for goal-agent runs. Fetches the partitioned
 * approved/disapproved change feed from /api/goal-agents/changes and renders an
 * approved view by default with a toggle to reveal disapproved/blocked changes.
 * No mutation surface — every row is a read of existing audit data.
 */
import { useEffect, useState } from "react";

interface ChangeRow {
  id: number;
  step: number | null;
  action: string;
  status: string;
  riskTier: string | null;
  campaignIds: string[];
  reason: string;
  measuredResult: Record<string, unknown> | null;
  createdAt: string | null;
}

interface ChangesResponse {
  goalRuns?: Array<{ id: number; goal: string | null; status: string | null }>;
  approved?: ChangeRow[];
  disapproved?: ChangeRow[];
  error?: string;
}

interface Props {
  clientId?: number | string;
  goalRunId?: number | string;
}

function tierColor(tier: string | null): { bg: string; fg: string } {
  switch (tier) {
    case "green":
      return { bg: "#dcfce7", fg: "#166534" };
    case "yellow":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "red":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "black":
      return { bg: "#1f2937", fg: "#f9fafb" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

function statusColor(status: string): { bg: string; fg: string } {
  if (status === "approved" || status === "applied") return { bg: "#dcfce7", fg: "#166534" };
  if (status === "rejected") return { bg: "#fee2e2", fg: "#991b1b" };
  if (status.startsWith("blocked_by_")) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#f3f4f6", fg: "#374151" };
}

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
  marginBottom: 10,
};

function ChangeCard({ row }: { row: ChangeRow }): React.ReactElement {
  const tier = tierColor(row.riskTier);
  const st = statusColor(row.status);
  return (
    <div style={CARD}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {row.step != null && (
          <span style={{ color: "#9ca3af", fontSize: 12 }}>#{row.step}</span>
        )}
        <strong style={{ fontSize: 14 }}>{row.action}</strong>
        <span style={{ background: st.bg, color: st.fg, borderRadius: 4, padding: "2px 8px", fontSize: 12 }}>
          {row.status}
        </span>
        {row.riskTier && (
          <span style={{ background: tier.bg, color: tier.fg, borderRadius: 4, padding: "2px 8px", fontSize: 12 }}>
            {row.riskTier}
          </span>
        )}
        {row.campaignIds.length > 0 && (
          <span style={{ color: "#6b7280", fontSize: 12 }}>
            {row.campaignIds.length} campaign{row.campaignIds.length === 1 ? "" : "s"}
          </span>
        )}
        {row.createdAt && (
          <span style={{ color: "#9ca3af", fontSize: 12, marginLeft: "auto" }}>
            {new Date(row.createdAt).toLocaleString()}
          </span>
        )}
      </div>
      <p style={{ margin: "8px 0 0", color: "#374151", fontSize: 13 }}>{row.reason}</p>
      {row.measuredResult && (
        <pre
          style={{
            margin: "8px 0 0",
            background: "#f9fafb",
            border: "1px solid #f3f4f6",
            borderRadius: 6,
            padding: 8,
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(row.measuredResult, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function GoalChangeReview({ clientId, goalRunId }: Props): React.ReactElement {
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDisapproved, setShowDisapproved] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (clientId != null) qs.set("clientId", String(clientId));
    if (goalRunId != null) qs.set("goalRunId", String(goalRunId));
    let cancelled = false;
    setLoading(true);
    fetch(`/api/goal-agents/changes?${qs.toString()}`, { credentials: "include" })
      .then(async (r) => {
        const json = (await r.json()) as ChangesResponse;
        if (cancelled) return;
        if (!r.ok) {
          setError(json.error ?? `Request failed (${r.status})`);
        } else {
          setData(json);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, goalRunId]);

  if (loading) return <p style={{ color: "#6b7280" }}>Loading changes…</p>;
  if (error) return <p style={{ color: "#991b1b" }}>Error: {error}</p>;

  const approved = data?.approved ?? [];
  const disapproved = data?.disapproved ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>
          Approved changes <span style={{ color: "#9ca3af" }}>({approved.length})</span>
        </h2>
        <label style={{ marginLeft: "auto", fontSize: 13, color: "#374151", display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showDisapproved}
            onChange={(e) => setShowDisapproved(e.target.checked)}
          />
          Show disapproved / blocked ({disapproved.length})
        </label>
      </div>

      {approved.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No approved changes yet.</p>
      ) : (
        approved.map((row) => <ChangeCard key={row.id} row={row} />)
      )}

      {showDisapproved && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>
            Disapproved / blocked <span style={{ color: "#9ca3af" }}>({disapproved.length})</span>
          </h2>
          {disapproved.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No disapproved or blocked changes.</p>
          ) : (
            disapproved.map((row) => <ChangeCard key={row.id} row={row} />)
          )}
        </div>
      )}
    </div>
  );
}
