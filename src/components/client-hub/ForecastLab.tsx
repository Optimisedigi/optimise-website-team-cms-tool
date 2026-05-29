import React from "react";

export function ForecastLab({ scenarios }: { scenarios: Array<Record<string, unknown>> }): React.ReactElement {
  return (
    <section className="hub-panel">
      <h2>Forecast Lab</h2>
      {scenarios.length === 0 ? <p>No published scenarios yet.</p> : null}
      <div className="hub-grid">
        {scenarios.map((scenario) => (
          <article className="hub-card" key={String(scenario.id)}>
            <p className="eyebrow">{String(scenario.scenarioType || "Scenario").replace(/_/g, " ")}</p>
            <h3>{String(scenario.title || "Forecast scenario")}</h3>
            <p>{String(scenario.clientSummary || scenario.notes || "Transparent conservative/base/optimistic planning scenario.")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
