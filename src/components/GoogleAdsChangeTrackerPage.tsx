"use client";

import { useEffect, useRef, useState } from "react";
import RocketSplash from "./RocketSplash";

type MetricKey = "clicks" | "impressions" | "cost" | "conversions" | "cpa" | "cpc";
type ViewMode = "weekly" | "daily";

type TrackerRow = {
  date: string;
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  cpa: number | null;
  cpc: number | null;
};

type ClientOption = {
  id: string | number;
  name: string;
  googleAdsCustomerId: string | null;
};

type TrackerData = {
  customerId: string;
  start: string;
  end: string;
  view: ViewMode;
  weeks: number;
  days: number;
  changeDate: string;
  trackedCampaigns: string[];
  availableCampaigns: string[];
  rows: TrackerRow[];
};

type ChartConfig = {
  id: number;
  name: string;
  customerId: string;
  campaigns: string[];
  campaignSearch: string;
  metrics: MetricKey[];
  changeDate: string;
  showTrend: boolean;
  showLabels: boolean;
  controlsOpen: boolean;
};

type ChartPoint = {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  cpa: number | null;
  cpc: number | null;
};

const METRICS: Array<{ key: MetricKey; label: string; color: string; kind: "bar" | "line" }> = [
  { key: "clicks", label: "Clicks", color: "#2563eb", kind: "line" },
  { key: "impressions", label: "Impressions", color: "#8b5cf6", kind: "line" },
  { key: "cost", label: "Cost", color: "#ef4444", kind: "line" },
  { key: "conversions", label: "Conversions", color: "#10b981", kind: "line" },
  { key: "cpa", label: "CPA", color: "#f59e0b", kind: "line" },
  { key: "cpc", label: "CPC", color: "#06b6d4", kind: "line" },
];

function fmtDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString("en-AU", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtWeekCommencing(value: string): string {
  return `W/C ${fmtDate(value)}`;
}

function fmtMetric(key: MetricKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (key === "cost" || key === "cpa") return `$${Math.round(value).toLocaleString()}`;
  if (key === "cpc") return `$${value.toFixed(2)}`;
  if (key === "conversions") return value.toFixed(value % 1 ? 1 : 0);
  return Math.round(value).toLocaleString();
}

function metricDef(key: MetricKey) {
  return METRICS.find((metric) => metric.key === key)!;
}

function valueFor(point: ChartPoint, key: MetricKey): number | null {
  return point[key];
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildTimeline(data: TrackerData, changeDate: string): string[] {
  if (data.view === "weekly") {
    const weekDates = Array.from(new Set(data.rows.map((row) => row.date).filter(Boolean))).sort();
    if (weekDates.length > 0) return weekDates.slice(-8);
  }

  const dates = new Set<string>();
  const start = data.view === "daily" && changeDate
    ? (changeDate > data.start ? addDays(changeDate, -14) : data.start)
    : data.start;
  const boundedStart = start < data.start ? data.start : start;
  for (let date = boundedStart; date <= data.end; date = addDays(date, 1)) dates.add(date);
  for (const row of data.rows) {
    if (row.date >= boundedStart) dates.add(row.date);
  }
  return Array.from(dates).sort();
}

function emptyPoint(date: string): ChartPoint {
  return { date, impressions: 0, clicks: 0, cost: 0, conversions: 0, cpa: null, cpc: null };
}

function aggregateRows(rows: TrackerRow[], campaigns: string[], timeline: string[]): ChartPoint[] {
  const campaignSet = new Set(campaigns);
  const byDate = new Map<string, ChartPoint>(timeline.map((date) => [date, emptyPoint(date)]));
  for (const row of rows) {
    if (!campaignSet.has(row.campaignName)) continue;
    const current = byDate.get(row.date) ?? emptyPoint(row.date);
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.cost += row.cost;
    current.conversions += row.conversions;
    current.cpa = current.conversions > 0 ? current.cost / current.conversions : null;
    current.cpc = current.clicks > 0 ? current.cost / current.clicks : null;
    byDate.set(row.date, current);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function hasMetricActivity(points: ChartPoint[], metrics: MetricKey[]): boolean {
  return points.some((point) => metrics.some((metric) => {
    const value = valueFor(point, metric);
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }));
}

function buildTrend(values: Array<number | null>, xFor: (index: number) => number, yFor: (value: number | null) => number): string {
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => typeof point.value === "number" && Number.isFinite(point.value));
  if (points.length < 2) return "";
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.index, 0);
  const sumY = points.reduce((sum, point) => sum + point.value, 0);
  const sumXY = points.reduce((sum, point) => sum + point.index * point.value, 0);
  const sumXX = points.reduce((sum, point) => sum + point.index * point.index, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (!denominator) return "";
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, index) => `${xFor(index)},${yFor(intercept + slope * index)}`).join(" ");
}

function SeriesChart({ points, metrics, showTrend, showLabels, changeDate, view }: {
  points: ChartPoint[];
  metrics: MetricKey[];
  showTrend: boolean;
  showLabels: boolean;
  changeDate: string;
  view: ViewMode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isSingle = metrics.length === 1;
  const height = view === "daily" ? 300 : 280;
  const tiltLabels = view === "daily";
  const padTop = 34 + Math.max(0, metrics.length - 1) * 10;
  const padBottom = tiltLabels ? 58 : 44;
  const padLeft = isSingle ? 55 : 36;
  const padRight = 42;
  const chartH = height - padTop - padBottom;
  const chartW = Math.max(0, width - padLeft - padRight);
  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;
  const changeIndex = points.findIndex((point) => point.date >= changeDate);
  const changeX = changeIndex >= 0 ? padLeft + changeIndex * xStep : null;

  const ranges = metrics.reduce((acc, metric) => {
    const values = points
      .map((point) => valueFor(point, metric))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 1;
    const range = maxVal - minVal || 1;
    const yMin = Math.max(minVal - range * 0.1, 0);
    const yMax = maxVal + range * 0.1;
    acc[metric] = { yMin, yRange: yMax - yMin || 1 };
    return acc;
  }, {} as Record<MetricKey, { yMin: number; yRange: number }>);

  const toX = (index: number) => padLeft + index * xStep;
  const toY = (metric: MetricKey, value: number | null) => {
    const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
    const range = ranges[metric] || { yMin: 0, yRange: 1 };
    return padTop + chartH - ((safeValue - range.yMin) / range.yRange) * chartH;
  };

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 18, background: "#fff", padding: "18px 24px 16px", boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)" }}>
      <div ref={containerRef} style={{ width: "100%" }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Google Ads change tracker chart">
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = padTop + chartH * tick;
              return <line key={tick} x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />;
            })}

            {changeX !== null && (
              <g>
                <rect x={changeX} y={padTop} width={width - padRight - changeX} height={chartH} fill="#fee2e2" opacity="0.18" />
                <line x1={changeX} x2={changeX} y1={padTop - 26} y2={height - 6} stroke="#991b1b" strokeDasharray="6 5" strokeWidth={3.5} />
                <text x={changeX > width - 150 ? changeX - 8 : changeX + 8} y={padTop - 16} textAnchor={changeX > width - 150 ? "end" : "start"} fontSize={12} fontWeight={800} fill="#991b1b">Change date</text>
              </g>
            )}

            {metrics.map((metric, metricIndex) => {
              const def = metricDef(metric);
              const values = points.map((point) => valueFor(point, metric));
              const linePath = values
                .map((value, index) => ({ value, index }))
                .filter((point): point is { value: number; index: number } => typeof point.value === "number" && Number.isFinite(point.value))
                .map((point) => `${toX(point.index)},${toY(metric, point.value)}`)
                .join(" ");
              const trendPoints = buildTrend(values, toX, (value) => toY(metric, value));
              const slotsPerLabel = Math.max(1, Math.ceil((42 * metrics.length) / Math.max(xStep, 1)));
              const labelOffset = -10 - metricIndex * 11;

              return (
                <g key={metric}>
                  {linePath && <polyline points={linePath} fill="none" stroke={def.color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />}
                  {showTrend && trendPoints && <polyline points={trendPoints} fill="none" stroke={def.color} strokeWidth={2} strokeDasharray="4 5" opacity={0.65} />}
                  {values.map((value, index) => {
                    if (typeof value !== "number" || !Number.isFinite(value)) return null;
                    const isLastPoint = index === points.length - 1;
                    const showLabel = showLabels && (index === 0 || isLastPoint || index % slotsPerLabel === 0);
                    return (
                      <g key={`${metric}-${points[index].date}`}>
                        <circle cx={toX(index)} cy={toY(metric, value)} r={3} fill="#fff" stroke={def.color} strokeWidth={2} />
                        {showLabel && (
                          <text x={toX(index)} y={toY(metric, value) + labelOffset} textAnchor="middle" fontSize={10} fontWeight={700} fill={def.color}>
                            {fmtMetric(metric, value)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {points.map((point, index) => {
              const x = toX(index);
              const y = height - (tiltLabels ? 22 : 14);
              if (tiltLabels) {
                return (
                  <text key={point.date} x={x} y={y} textAnchor="end" transform={`rotate(-35 ${x} ${y})`} fontSize={9} fill="#94a3b8">
                    {fmtDate(point.date)}
                  </text>
                );
              }
              const anchor: "start" | "middle" | "end" = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
              return (
                <text key={point.date} x={x} y={y} textAnchor={anchor} fontSize={10} fill="#94a3b8">
                  {fmtWeekCommencing(point.date)}
                </text>
              );
            })}

            {points.map((point, index) => {
              const x = toX(index);
              const hitWidth = Math.max(10, xStep || 18);
              return (
                <rect
                  key={`hit-${point.date}`}
                  x={x - hitWidth / 2}
                  y={padTop}
                  width={hitWidth}
                  height={chartH + padBottom - 8}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}

            {hoveredPoint && hoveredIndex !== null && (() => {
              const x = toX(hoveredIndex);
              const tooltipWidth = 172;
              const tooltipHeight = 88;
              const selectedValues = metrics
                .map((metric) => valueFor(hoveredPoint, metric))
                .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
              const anchorY = selectedValues.length
                ? Math.min(...metrics.map((metric) => toY(metric, valueFor(hoveredPoint, metric))))
                : padTop + chartH / 2;
              const tooltipX = Math.min(Math.max(x - tooltipWidth / 2, 8), width - tooltipWidth - 8);
              const tooltipY = Math.max(8, anchorY - tooltipHeight - 14);
              return (
                <g pointerEvents="none">
                  <line x1={x} x2={x} y1={padTop} y2={padTop + chartH} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} opacity={0.65} />
                  <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx={10} fill="#0f172a" opacity="0.92" />
                  <path d={`M${x - 6},${tooltipY + tooltipHeight} L${x + 6},${tooltipY + tooltipHeight} L${x},${tooltipY + tooltipHeight + 7} Z`} fill="#0f172a" opacity="0.92" />
                  <text x={tooltipX + 12} y={tooltipY + 20} fontSize={11} fontWeight={800} fill="#fff">{fmtDate(hoveredPoint.date)}</text>
                  <text x={tooltipX + 12} y={tooltipY + 40} fontSize={11} fill="#dbeafe">Impressions: {fmtMetric("impressions", hoveredPoint.impressions)}</text>
                  <text x={tooltipX + 12} y={tooltipY + 58} fontSize={11} fill="#dbeafe">Clicks: {fmtMetric("clicks", hoveredPoint.clicks)}</text>
                  <text x={tooltipX + 12} y={tooltipY + 76} fontSize={11} fill="#dbeafe">Cost: {fmtMetric("cost", hoveredPoint.cost)}</text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "22px", marginTop: 8, color: "#334155" }}>
        {metrics.map((metric) => {
          const def = metricDef(metric);
          return (
            <div key={metric} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
              <span style={{ width: 18, height: 3, borderRadius: 999, background: def.color, display: "inline-block" }} />
              <span>{def.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function defaultCampaigns(data: TrackerData): string[] {
  const active = new Set(data.availableCampaigns);
  const campaignsWithRows = new Set(data.rows.map((row) => row.campaignName));
  const trackedWithRows = data.trackedCampaigns.filter((campaign) => active.has(campaign) && campaignsWithRows.has(campaign));
  if (trackedWithRows.length > 0) return trackedWithRows;
  const trackedActive = data.trackedCampaigns.filter((campaign) => active.has(campaign));
  if (trackedActive.length > 0) return trackedActive;
  return data.availableCampaigns.slice(0, 1);
}

function defaultGraph(id: number, customerId: string, campaigns: string[]): ChartConfig {
  return {
    id,
    name: id === 1 ? "Changed campaigns" : `Graph ${id}`,
    customerId,
    campaigns,
    campaignSearch: "",
    metrics: ["clicks", "cost", "cpc", "conversions"],
    changeDate: "2026-06-17",
    showTrend: true,
    showLabels: false,
    controlsOpen: true,
  };
}

function cleanCustomerId(value: string | null | undefined): string {
  return String(value || "").replace(/-/g, "");
}

export default function GoogleAdsChangeTrackerPage() {
  const [view, setView] = useState<ViewMode>("daily");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [dataByCustomer, setDataByCustomer] = useState<Record<string, TrackerData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphs, setGraphs] = useState<ChartConfig[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);

  const normaliseSavedGraph = (graph: Partial<ChartConfig>, index: number, fallbackCustomerId: string, fallbackCampaigns: string[]): ChartConfig => ({
    id: Number(graph.id) || index + 1,
    name: graph.name || (index === 0 ? "Changed campaigns" : `Graph ${index + 1}`),
    customerId: cleanCustomerId(graph.customerId || fallbackCustomerId),
    campaigns: Array.isArray(graph.campaigns) ? graph.campaigns : fallbackCampaigns,
    campaignSearch: "",
    metrics: Array.isArray(graph.metrics) && graph.metrics.length ? graph.metrics.slice(0, 4) : ["clicks", "cost", "cpc", "conversions"],
    changeDate: graph.changeDate || "2026-06-17",
    showTrend: graph.showTrend !== false,
    showLabels: graph.showLabels === true,
    controlsOpen: graph.controlsOpen !== false,
  });

  const loadTrackerData = async (customerId: string, requestedView: ViewMode = view) => {
    const params = new URLSearchParams({ view: requestedView, days: "45", weeks: "8" });
    if (customerId) params.set("customerId", customerId);
    const res = await fetch(`/api/google-ads/change-tracker?${params}`);
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load tracker");
    const payload = await res.json() as TrackerData;
    const cleanId = cleanCustomerId(payload.customerId || customerId);
    setDataByCustomer((current) => ({ ...current, [cleanId]: payload }));
    return payload;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDataByCustomer({});

    Promise.all([
      fetch("/api/clients/google-ads-list").then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load clients");
        return res.json() as Promise<ClientOption[]>;
      }),
      fetch("/api/google-ads/change-tracker/config").then(async (res) => {
        if (!res.ok) return { view: "daily" as ViewMode, graphs: [] };
        return res.json() as Promise<{ view?: ViewMode; graphs?: Partial<ChartConfig>[] }>;
      }),
    ])
      .then(async ([clientPayload, savedConfig]) => {
        const savedView = savedConfig.view === "weekly" ? "weekly" : "daily";
        const defaultData = await loadTrackerData("", savedView);
        if (cancelled) return;
        const googleAdsClients = clientPayload.filter((client) => cleanCustomerId(client.googleAdsCustomerId));
        const fallbackCustomerId = cleanCustomerId(defaultData.customerId);
        const fallbackCampaigns = defaultCampaigns(defaultData);
        setClients(googleAdsClients);
        setView(savedView);
        setGraphs(Array.isArray(savedConfig.graphs) && savedConfig.graphs.length
          ? savedConfig.graphs.map((graph, index) => normaliseSavedGraph(graph, index, fallbackCustomerId, fallbackCampaigns))
          : [defaultGraph(1, fallbackCustomerId, fallbackCampaigns)]);
        setConfigLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load tracker");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    const customerIds = Array.from(new Set(graphs.map((graph) => graph.customerId).filter(Boolean)));
    const missingCustomerIds = customerIds.filter((customerId) => !dataByCustomer[customerId] || dataByCustomer[customerId].view !== view);
    if (missingCustomerIds.length === 0) return;
    missingCustomerIds.forEach((customerId) => {
      loadTrackerData(customerId, view).catch((err) => setError(err.message || "Failed to load tracker"));
    });
  }, [graphs, dataByCustomer, view, configLoaded]);

  const updateGraph = (id: number, patch: Partial<ChartConfig>) => {
    setGraphs((items) => items.map((graph) => graph.id === id ? { ...graph, ...patch } : graph));
  };

  const changeGraphClient = (graph: ChartConfig, customerId: string) => {
    const graphData = dataByCustomer[customerId];
    updateGraph(graph.id, {
      customerId,
      campaigns: graphData ? defaultCampaigns(graphData) : [],
      campaignSearch: "",
      controlsOpen: true,
    });

    if (!graphData) {
      loadTrackerData(customerId, view)
        .then((payload) => {
          updateGraph(graph.id, { campaigns: defaultCampaigns(payload) });
        })
        .catch((err) => setError(err.message || "Failed to load tracker"));
    }
  };

  const toggleMetric = (graph: ChartConfig, metric: MetricKey) => {
    if (graph.metrics.includes(metric)) {
      updateGraph(graph.id, { metrics: graph.metrics.filter((item) => item !== metric) });
      return;
    }
    if (graph.metrics.length >= 4) return;
    updateGraph(graph.id, { metrics: [...graph.metrics, metric] });
  };

  const addCampaign = (graph: ChartConfig, campaign: string) => {
    if (graph.campaigns.includes(campaign)) return;
    updateGraph(graph.id, { campaigns: [...graph.campaigns, campaign], campaignSearch: "" });
  };

  const removeCampaign = (graph: ChartConfig, campaign: string) => {
    updateGraph(graph.id, { campaigns: graph.campaigns.filter((item) => item !== campaign) });
  };

  useEffect(() => {
    if (!configLoaded || graphs.length === 0) return;
    const timeout = window.setTimeout(() => {
      fetch("/api/google-ads/change-tracker/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, graphs }),
      }).catch((err) => {
        console.error("[change-tracker autosave]", err);
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [configLoaded, graphs, view]);

  const fallbackData = Object.values(dataByCustomer)[0] || null;

  if (loading && !fallbackData) return <RocketSplash />;
  if (error) return <div className="od-box" style={{ color: "#b91c1c" }}>{error}</div>;
  if (!fallbackData) return null;

  return (
    <div
      className="od-settings"
      style={{
        maxWidth: "none",
        width: "calc(100% + 220px)",
        marginLeft: "-36px",
        marginRight: "-184px",
      }}
    >
      <h2 className="od-settings__title">Google Ads Change Tracker</h2>
      <p className="od-settings__subtitle">
        Internal tracker for campaign changes. Add one or more graphs, choose active campaigns, compare up to four metrics, and move each graph's change marker to its own rollout date.
      </p>

      <div className="od-box" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={() => setView("weekly")} className="od-settings__btn" style={view === "weekly" ? { background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" } : undefined}>Weekly - 8 weeks</button>
        <button type="button" onClick={() => setView("daily")} className="od-settings__btn" style={view === "daily" ? { background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" } : undefined}>Daily - 45 days</button>
        <button type="button" onClick={() => setGraphs((items) => [...items, defaultGraph((items.at(-1)?.id ?? 0) + 1, cleanCustomerId(fallbackData.customerId), defaultCampaigns(fallbackData).slice(0, 1))])} className="od-settings__btn" aria-label="Add graph" title="Add graph" style={{ fontSize: 20, lineHeight: 1, padding: "9px 14px" }}>+</button>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {graphs.map((graph) => {
          const graphData = dataByCustomer[graph.customerId] || null;
          const graphClient = clients.find((client) => cleanCustomerId(client.googleAdsCustomerId) === graph.customerId);
          const campaignNames = graphData?.availableCampaigns ?? [];
          const graphChangeDate = graph.changeDate || "2026-06-17";
          const timeline = graphData ? buildTimeline(graphData, graphChangeDate) : [];
          const search = graph.campaignSearch.trim().toLowerCase();
          const campaignOptions = search
            ? campaignNames.filter((campaign) => campaign.toLowerCase().includes(search) && !graph.campaigns.includes(campaign)).slice(0, 12)
            : [];
          const points = graphData ? aggregateRows(graphData.rows, graph.campaigns, timeline) : [];
          const hasActivity = graphData ? hasMetricActivity(points, graph.metrics) : false;
          return (
            <section key={graph.id} className="od-box" style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <input value={graph.name} onChange={(event) => updateGraph(graph.id, { name: event.target.value })} className="od-gsc-page__date-input" style={{ minWidth: 260, fontWeight: 900 }} />
                  <div style={{ marginTop: 8, fontSize: 13, color: "#64748b", maxWidth: 980 }}>
                    <strong>{graphClient?.name || `Customer ${graph.customerId}`}</strong>{" — "}
                    {graph.campaigns.length ? graph.campaigns.join(" + ") : "No campaigns selected"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                  {METRICS.map((item) => {
                    const selected = graph.metrics.includes(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => toggleMetric(graph, item.key)}
                        disabled={!selected && graph.metrics.length >= 4}
                        className="od-settings__btn"
                        style={{
                          background: selected ? "#fff" : "#f8fafc",
                          borderColor: selected ? "#dbeafe" : "#e2e8f0",
                          borderBottom: selected ? `3px solid ${item.color}` : "1px solid #e2e8f0",
                          color: selected ? "#1e293b" : "#cbd5e1",
                          boxShadow: selected ? `0 2px 8px ${item.color}22` : "none",
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => updateGraph(graph.id, { controlsOpen: !graph.controlsOpen })} className="od-settings__btn">{graph.controlsOpen ? "Hide setup" : "Edit setup"}</button>
                  <button type="button" onClick={() => updateGraph(graph.id, { showTrend: !graph.showTrend })} className="od-settings__btn" style={graph.showTrend ? { background: "#f8fafc", borderColor: "#cbd5e1", color: "#334155" } : undefined}>Trend line</button>
                  <button type="button" onClick={() => updateGraph(graph.id, { showLabels: !graph.showLabels })} className="od-settings__btn" style={graph.showLabels ? { background: "#f8fafc", borderColor: "#cbd5e1", color: "#334155" } : undefined}>Data labels</button>
                </div>
              </div>

              {graph.controlsOpen && (
                <div style={{ display: "grid", gap: 12 }}>
                  <label style={{ display: "grid", gap: 4, maxWidth: 560, fontSize: 12, fontWeight: 800 }}>
                    Change date
                    <input type="date" value={graphChangeDate} onChange={(event) => updateGraph(graph.id, { changeDate: event.target.value })} className="od-gsc-page__date-input" />
                  </label>

                  <label style={{ display: "grid", gap: 4, maxWidth: 560, fontSize: 12, fontWeight: 800 }}>
                    Client
                    <select value={graph.customerId} onChange={(event) => changeGraphClient(graph, event.target.value)} className="od-gsc-page__date-input">
                      {clients.length === 0 && <option value={graph.customerId}>Customer {graph.customerId}</option>}
                      {clients.map((client) => {
                        const customerId = cleanCustomerId(client.googleAdsCustomerId);
                        return <option key={client.id} value={customerId}>{client.name} — {customerId}</option>;
                      })}
                    </select>
                  </label>

                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      value={graph.campaignSearch}
                      onChange={(event) => updateGraph(graph.id, { campaignSearch: event.target.value })}
                      placeholder="Search active campaigns to add..."
                      className="od-gsc-page__date-input"
                      style={{ maxWidth: 560 }}
                    />
                    {campaignOptions.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {campaignOptions.map((campaign) => <button key={campaign} type="button" className="od-settings__btn" onClick={() => addCampaign(graph, campaign)}>+ {campaign}</button>)}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {graph.campaigns.map((campaign) => (
                        <button
                          key={campaign}
                          type="button"
                          className="od-settings__btn"
                          style={{ background: "#2563eb", borderColor: "#2563eb", color: "#fff" }}
                          onClick={() => removeCampaign(graph, campaign)}
                          title="Remove campaign from this graph"
                        >
                          {campaign} ×
                        </button>
                      ))}
                    </div>
                  </div>

                  {graphs.length > 1 && (
                    <div>
                      <button type="button" onClick={() => setGraphs((items) => items.filter((item) => item.id !== graph.id))} className="od-settings__btn">Remove graph</button>
                    </div>
                  )}
                </div>
              )}

              {!graphData ? (
                <div style={{ border: "1px dashed #cbd5e1", borderRadius: 18, padding: 32, color: "#64748b", textAlign: "center" }}>Loading data for {graphClient?.name || `Customer ${graph.customerId}`}...</div>
              ) : graph.metrics.length === 0 || graph.campaigns.length === 0 ? (
                <div style={{ border: "1px dashed #cbd5e1", borderRadius: 18, padding: 32, color: "#64748b", textAlign: "center" }}>Select at least one active campaign and one metric.</div>
              ) : (
                <>
                  {!hasActivity && (
                    <div style={{ border: "1px solid #fde68a", borderRadius: 14, padding: "10px 12px", color: "#92400e", background: "#fffbeb", fontSize: 13, fontWeight: 700 }}>
                      No non-zero activity for the selected metrics in this {view === "daily" ? "45 day" : "8 week"} range. The timeline and change marker are still shown so new/quiet campaigns are easy to monitor.
                    </div>
                  )}
                  <SeriesChart points={points} metrics={graph.metrics} showTrend={graph.showTrend} showLabels={graph.showLabels} changeDate={graphChangeDate} view={view} />
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
