import React from "react";

export function ValueLedger({ items, summary }: { items: Array<Record<string, unknown>>; summary?: Record<string, unknown> }): React.ReactElement {
  return (
    <section className="hub-panel">
      <h2>Value Ledger</h2>
      <p>{Number(summary?.totalItems ?? items.length)} proof-of-value items recorded.</p>
      {items.length === 0 ? <p>No client-visible ledger items yet.</p> : null}
      <div className="hub-timeline">
        {items.map((item) => (
          <article className="hub-card" key={String(item.id)}>
            <p className="eyebrow">{String(item.category || "value").replace(/_/g, " ")} · {String(item.occurredAt || "").slice(0, 10)}</p>
            <h3>{String(item.title || "Value item")}</h3>
            <p>{String(item.summary || "")}</p>
            {item.impactValue ? <strong>{String(item.impactValue)} {String(item.impactUnit || "")}</strong> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
