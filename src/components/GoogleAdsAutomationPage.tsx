"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SearchIncident = {
  id: number;
  title?: string | null;
  kind?: string | null;
  begin?: string | null;
  end?: string | null;
  latestUpdate?: string | null;
  sourceUri?: string | null;
};

type AutomationEvent = {
  id: number;
  client?: { id: number; name?: string } | number | null;
  customerId?: string | null;
  changeDateTime?: string | null;
  changeResourceType?: string | null;
  clientType?: string | null;
  campaignName?: string | null;
  summary?: string | null;
  isGoogleAutomated?: boolean | null;
  reviewStatus?: string | null;
  impact?: {
    spendBefore?: number | null;
    spendAfter?: number | null;
    convBefore?: number | null;
    convAfter?: number | null;
    computedAt?: string | null;
  } | null;
};

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION", label: "Auto-applied recommendation" },
  { value: "GOOGLE_ADS_RECOMMENDATIONS", label: "Recommendation" },
  { value: "GOOGLE_ADS_AUTOMATED_RULE", label: "Automated rule" },
  { value: "GOOGLE_ADS_SCRIPTS", label: "Script" },
  { value: "GOOGLE_ADS_API", label: "Our tooling (API)" },
  { value: "GOOGLE_ADS_WEB_CLIENT", label: "Person in the Ads UI" },
];

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pctChange(before: number | null | undefined, after: number | null | undefined): string {
  if (before === null || before === undefined || after === null || after === undefined) return "";
  if (before === 0) return after === 0 ? "0%" : "new";
  const delta = ((after - before) / before) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`;
}

function clientName(event: AutomationEvent): string {
  if (event.client && typeof event.client === "object") return event.client.name || `Client ${event.client.id}`;
  return event.customerId || "—";
}

export default function GoogleAdsAutomationPage() {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [source, setSource] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [incidents, setIncidents] = useState<SearchIncident[]>([]);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (showAll) params.set("all", "1");
    if (source) params.set("clientType", source);
    if (resourceType) params.set("resourceType", resourceType);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return params.toString();
  }, [showAll, source, resourceType, start, end]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/google-ads-automation?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/google-search-updates?limit=20", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
        if (!cancelled) setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
      })
      .catch((err) => {
        if (!cancelled) setIncidentsError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resourceTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.changeResourceType).filter(Boolean) as string[])).sort(),
    [events],
  );

  async function flag(id: number) {
    setFlagging(id);
    try {
      const response = await fetch(`/api/google-ads-automation/${id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Flag failed");
      setEvents((rows) => rows.map((row) => (row.id === id ? { ...row, reviewStatus: "flagged" } : row)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFlagging(null);
    }
  }

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">Google Automation Watchtower</h2>
      <p className="od-settings__subtitle">
        Ads changes Google made to managed accounts, plus confirmed Search algorithm updates. Both polled daily.
      </p>

      <div className="od-box" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>Google Search updates</h3>
        {incidentsError && <p style={{ color: "#b91c1c" }}>{incidentsError}</p>}
        {!incidentsError && incidents.length === 0 && (
          <p style={{ color: "#64748b", margin: 0 }}>No ranking updates stored yet — the 06:00 cron fills this.</p>
        )}
        {incidents.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "8px 6px" }}>Began</th>
                <th style={{ padding: "8px 6px" }}>Update</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{(incident.begin || "").slice(0, 10) || "—"}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <span style={{ background: "#dbeafe", color: "#1e40af", borderRadius: 4, padding: "1px 6px", marginRight: 6, fontSize: 11, fontWeight: 700 }}>
                      {(incident.kind || "other").toUpperCase()}
                    </span>
                    {incident.sourceUri ? (
                      <a href={incident.sourceUri} target="_blank" rel="noopener noreferrer">{incident.title}</a>
                    ) : (
                      incident.title
                    )}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {incident.end ? `Complete ${(incident.end || "").slice(0, 10)}` : "Rolling out"}
                    {incident.latestUpdate ? <div style={{ color: "#64748b", marginTop: 4 }}>{incident.latestUpdate}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="od-box" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="od-gsc-page__date-input">
          {SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="od-gsc-page__date-input">
          <option value="">All resource types</option>
          {resourceTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="od-gsc-page__date-input" aria-label="From date" />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="od-gsc-page__date-input" aria-label="To date" />
        <button
          type="button"
          className="od-settings__btn"
          onClick={() => setShowAll((value) => !value)}
          style={showAll ? { background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" } : undefined}
        >
          {showAll ? "Showing all changes" : "Google changes only"}
        </button>
        <button type="button" className="od-settings__btn" onClick={() => void load()}>Refresh</button>
      </div>

      {error && <div className="od-box" style={{ color: "#b91c1c", marginBottom: 16 }}>{error}</div>}

      <div className="od-box">
        {loading ? (
          <p>Loading changes…</p>
        ) : events.length === 0 ? (
          <p>No changes recorded for these filters yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "8px 6px" }}>Date</th>
                <th style={{ padding: "8px 6px" }}>Client</th>
                <th style={{ padding: "8px 6px" }}>What changed</th>
                <th style={{ padding: "8px 6px" }}>Impact (7d before → after)</th>
                <th style={{ padding: "8px 6px" }}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{(event.changeDateTime || "").slice(0, 10) || "—"}</td>
                  <td style={{ padding: "8px 6px" }}>{clientName(event)}</td>
                  <td style={{ padding: "8px 6px" }}>
                    {event.isGoogleAutomated && (
                      <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "1px 6px", marginRight: 6, fontSize: 11, fontWeight: 700 }}>
                        Not ours
                      </span>
                    )}
                    {event.summary || event.changeResourceType || "Change"}
                  </td>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                    {event.impact?.computedAt ? (
                      <>
                        spend {money(event.impact.spendBefore)} → {money(event.impact.spendAfter)} {pctChange(event.impact.spendBefore, event.impact.spendAfter)}
                        <br />
                        conv {event.impact.convBefore ?? "—"} → {event.impact.convAfter ?? "—"} {pctChange(event.impact.convBefore, event.impact.convAfter)}
                      </>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>pending (7 days after change)</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                    {event.reviewStatus === "flagged" ? (
                      <span style={{ color: "#0f766e", fontWeight: 700 }}>Flagged</span>
                    ) : (
                      <button type="button" className="od-settings__btn" disabled={flagging === event.id} onClick={() => void flag(event.id)}>
                        {flagging === event.id ? "Flagging…" : "Flag for review"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
