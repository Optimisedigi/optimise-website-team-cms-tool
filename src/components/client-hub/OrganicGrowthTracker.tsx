import React from "react";

export function OrganicGrowthTracker({ snapshots }: { snapshots: Array<Record<string, unknown>> }): React.ReactElement {
  const latest = snapshots[0];
  const organic = latest?.organic && typeof latest.organic === "object" ? latest.organic as Record<string, unknown> : {};
  return (
    <section className="hub-panel">
      <h2>Organic Growth</h2>
      {!latest ? <p>No organic growth snapshots yet.</p> : null}
      {latest ? (
        <div className="hub-grid metrics">
          <div className="hub-card"><span>Total clicks</span><strong>{Number(organic.totalClicks ?? 0).toLocaleString()}</strong></div>
          <div className="hub-card"><span>Total impressions</span><strong>{Number(organic.totalImpressions ?? 0).toLocaleString()}</strong></div>
          <div className="hub-card"><span>Non-brand clicks</span><strong>{Number(organic.nonBrandClicks ?? 0).toLocaleString()}</strong></div>
        </div>
      ) : null}
    </section>
  );
}
