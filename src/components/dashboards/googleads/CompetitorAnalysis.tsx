"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { DataTable, type Column } from "@/components/dashboards/shared/DataTable";
import type {
  GoogleAdsDashboardAuctionInsight,
  GoogleAdsDashboardAdGroupAuctionInsight,
  GoogleAdsDashboardImpressionShare,
  GoogleAdsDashboardCompetitor,
  GoogleAdsDashboardImpressionShareMonthlyPoint,
} from "@/lib/dashboard-types";

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

const competitorColumns: Column<GoogleAdsDashboardCompetitor>[] = [
  { key: "domain", label: "Competitor", align: "left" },
  {
    key: "impressionShare",
    label: "How Often They Show",
    align: "center",
    format: (v) => pct(v as number),
  },
  {
    key: "overlapRate",
    label: "You Both Show",
    align: "center",
    format: (v) => pct(v as number),
  },
  {
    key: "positionAboveRate",
    label: "They Appear Above You",
    align: "center",
    format: (v) => pct(v as number),
  },
  {
    key: "outrankingShare",
    label: "They Outrank You",
    align: "center",
    format: (v) => pct(v as number),
  },
];

const campaignIsColumns: Column<{
  name: string;
  impressionShare: number;
  budgetLost: number;
  rankLost: number;
  impressions: number;
}>[] = [
  { key: "name", label: "Campaign", align: "left" },
  {
    key: "impressionShare",
    label: "Visibility",
    align: "center",
    format: (v) => pct(v as number),
  },
  {
    key: "budgetLost",
    label: "Lost (Budget)",
    align: "center",
    format: (v) => pct(v as number),
  },
  {
    key: "rankLost",
    label: "Lost (Rank)",
    align: "center",
    format: (v) => pct(v as number),
  },
  {
    key: "impressions",
    label: "Impressions",
    align: "right",
    format: (v) => (v as number).toLocaleString("en-US"),
  },
];

interface CompetitorAnalysisProps {
  auctionInsights: GoogleAdsDashboardAuctionInsight[];
  adGroupAuctionInsights?: GoogleAdsDashboardAdGroupAuctionInsight[];
  impressionShare: GoogleAdsDashboardImpressionShare;
}

function ImpressionKpiCard({
  label,
  value,
  description,
  color,
}: {
  label: string;
  value: string;
  description: string;
  color: "blue" | "amber" | "red";
}) {
  // Dimensions match the Overview KpiCard / Progress StatCard so all rows
  // sitting directly under the tabs feel like the same component. Colour is
  // preserved as a top accent strip + text tint so the semantic blue/amber/
  // red distinction is still readable at a glance.
  const accentMap = {
    blue: "#3b82f6",
    amber: "#f59e0b",
    red: "#ef4444",
  };
  const textMap = {
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };
  return (
    <div
      className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 text-center relative overflow-hidden"
      style={{ paddingTop: 3, paddingBottom: 3 }}
      title={description}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: accentMap[color] }}
      />
      <p
        className="text-xs font-medium uppercase tracking-wider text-slate-500"
        style={{ lineHeight: 1.4 }}
      >
        {label}
      </p>
      <p
        className={`font-bold ${textMap[color]}`}
        style={{ fontSize: 20, lineHeight: 1, paddingTop: 4 }}
      >
        {value}
      </p>
      <p className="text-[10px] text-slate-500" style={{ lineHeight: 1.4 }}>
        {description}
      </p>
    </div>
  );
}

/** Aggregate competitors across all campaigns, returning the top N */
interface AggregatedCompetitor {
  domain: string;
  avgImpressionShare: number;
  avgOverlapRate: number;
  avgPositionAboveRate: number;
  avgOutrankingShare: number;
  campaignCount: number;
}

function aggregateCompetitors(
  insights: GoogleAdsDashboardAuctionInsight[],
  topN: number,
): AggregatedCompetitor[] {
  const map = new Map<
    string,
    {
      impressionShare: number;
      overlapRate: number;
      positionAboveRate: number;
      outrankingShare: number;
      count: number;
    }
  >();

  for (const insight of insights) {
    for (const comp of insight.competitors) {
      const existing = map.get(comp.domain) || {
        impressionShare: 0,
        overlapRate: 0,
        positionAboveRate: 0,
        outrankingShare: 0,
        count: 0,
      };
      existing.impressionShare += comp.impressionShare;
      existing.overlapRate += comp.overlapRate;
      existing.positionAboveRate += comp.positionAboveRate;
      existing.outrankingShare += comp.outrankingShare;
      existing.count += 1;
      map.set(comp.domain, existing);
    }
  }

  return Array.from(map.entries())
    .map(([domain, d]) => ({
      domain,
      avgImpressionShare: d.impressionShare / d.count,
      avgOverlapRate: d.overlapRate / d.count,
      avgPositionAboveRate: d.positionAboveRate / d.count,
      avgOutrankingShare: d.outrankingShare / d.count,
      campaignCount: d.count,
    }))
    .sort((a, b) => b.avgImpressionShare - a.avgImpressionShare)
    .slice(0, topN);
}

function ThreatBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${styles[level]}`}>
      {level === "high" ? "High Threat" : level === "medium" ? "Medium Threat" : "Low Threat"}
    </span>
  );
}

function getThreatLevel(comp: AggregatedCompetitor): "high" | "medium" | "low" {
  if (comp.avgImpressionShare >= 50 && comp.avgPositionAboveRate >= 40) return "high";
  if (comp.avgImpressionShare >= 30 || comp.avgPositionAboveRate >= 30) return "medium";
  return "low";
}

function monthLabel(yyyymm: string): string {
  const parts = yyyymm.split("-");
  const mm = parts[1] || "01";
  const yy = (parts[0] || "").slice(2);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(mm, 10) - 1] || mm} '${yy}`;
}

function normaliseMonthKey(point: GoogleAdsDashboardImpressionShareMonthlyPoint): string {
  return point.month;
}

function lastNMonths(points: GoogleAdsDashboardImpressionShareMonthlyPoint[], n = 14) {
  return [...points]
    .filter((p) => typeof p.impressionShare === "number")
    .sort((a, b) => normaliseMonthKey(a).localeCompare(normaliseMonthKey(b)))
    .slice(-n);
}

function averageMonthlySeries(series: GoogleAdsDashboardImpressionShareMonthlyPoint[][]) {
  const map = new Map<string, { total: number; count: number }>();
  for (const points of series) {
    for (const point of points) {
      if (typeof point.impressionShare !== "number") continue;
      const key = normaliseMonthKey(point);
      const existing = map.get(key) || { total: 0, count: 0 };
      existing.total += point.impressionShare;
      existing.count += 1;
      map.set(key, existing);
    }
  }
  return lastNMonths(Array.from(map.entries()).map(([month, d]) => ({
    month,
    impressionShare: d.count ? d.total / d.count : 0,
  })));
}

function ImpressionShareTrendChart({ points }: { points: GoogleAdsDashboardImpressionShareMonthlyPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const color = "#3b82f6";
  const height = 280;
  const padTop = 30;
  const padBottom = 56;
  const padLeft = 55;
  const padRight = 36;
  const chartH = height - padTop - padBottom;
  const chartW = width - padLeft - padRight;
  const values = points.map((p) => p.impressionShare);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 100);
  const range = maxVal - minVal || 1;
  const yMin = Math.max(minVal - range * 0.1, 0);
  const yMax = Math.min(maxVal + range * 0.1, 100);
  const yRange = yMax - yMin || 1;
  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;
  const toX = (i: number) => padLeft + i * xStep;
  const toY = (v: number) => padTop + chartH - ((v - yMin) / yRange) * chartH;
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = yMin + (yRange * i) / 4;
    return { val, y: toY(val) };
  });

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && points.length > 0 && (
        <svg width={width} height={height}>
          <defs>
            <linearGradient id="competitor-is-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={padLeft} x2={width - padRight} y1={tick.y} y2={tick.y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padLeft - 8} y={tick.y + 4} fontSize={10} fill="#94a3b8" textAnchor="end">
                {pct(tick.val)}
              </text>
            </g>
          ))}
          {points.length > 1 && (
            <path
              d={`M${toX(0)},${toY(points[0].impressionShare)} ${points.slice(1).map((p, i) => `L${toX(i + 1)},${toY(p.impressionShare)}`).join(" ")} L${toX(points.length - 1)},${padTop + chartH} L${toX(0)},${padTop + chartH} Z`}
              fill="url(#competitor-is-grad)"
            />
          )}
          <polyline
            points={points.map((p, i) => `${toX(i)},${toY(p.impressionShare)}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => {
            const showLabel = i === 0 || i === points.length - 1 || i % 2 === 0;
            const x = toX(i);
            const y = toY(p.impressionShare);
            return (
              <g key={p.month}>
                <circle cx={x} cy={y} r={3} fill="white" stroke={color} strokeWidth={2} />
                {showLabel && (
                  <text x={x} y={y - 10} fontSize={10} fill={color} textAnchor="middle" fontWeight="600">
                    {pct(p.impressionShare)}
                  </text>
                )}
                <text x={x} y={height - 22} fontSize={10} fill="#94a3b8" textAnchor="end" transform={`rotate(-35 ${x} ${height - 22})`}>
                  {monthLabel(p.month)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function TopCompetitorCard({ comp, rank }: { comp: AggregatedCompetitor; rank: number }) {
  const threat = getThreatLevel(comp);

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-sm font-bold">
            #{rank}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">{comp.domain}</p>
            <p className="text-xs text-slate-400">
              Appears in {comp.campaignCount} campaign{comp.campaignCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <ThreatBadge level={threat} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Shows For</p>
          <p className="text-lg font-bold text-slate-700">{pct(comp.avgImpressionShare)}</p>
          <p className="text-[10px] text-slate-400">of your target searches</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Overlap Rate</p>
          <p className="text-lg font-bold text-slate-700">{pct(comp.avgOverlapRate)}</p>
          <p className="text-[10px] text-slate-400">you both appear together</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Above You</p>
          <p className={`text-lg font-bold ${comp.avgPositionAboveRate >= 40 ? "text-red-600" : comp.avgPositionAboveRate >= 20 ? "text-amber-600" : "text-emerald-600"}`}>
            {pct(comp.avgPositionAboveRate)}
          </p>
          <p className="text-[10px] text-slate-400">of the time</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Outranks You</p>
          <p className={`text-lg font-bold ${comp.avgOutrankingShare >= 50 ? "text-red-600" : comp.avgOutrankingShare >= 30 ? "text-amber-600" : "text-emerald-600"}`}>
            {pct(comp.avgOutrankingShare)}
          </p>
          <p className="text-[10px] text-slate-400">overall outranking share</p>
        </div>
      </div>
    </div>
  );
}

/** Group ad-group auction insights by campaign for drill-down display */
function groupAdGroupInsightsByCampaign(
  insights: GoogleAdsDashboardAdGroupAuctionInsight[],
): Map<string, GoogleAdsDashboardAdGroupAuctionInsight[]> {
  const map = new Map<string, GoogleAdsDashboardAdGroupAuctionInsight[]>();
  for (const insight of insights) {
    const existing = map.get(insight.campaignName) || [];
    existing.push(insight);
    map.set(insight.campaignName, existing);
  }
  return map;
}

export function CompetitorAnalysis({
  auctionInsights,
  adGroupAuctionInsights,
  impressionShare,
}: CompetitorAnalysisProps) {
  const hasAdGroupData = adGroupAuctionInsights && adGroupAuctionInsights.length > 0;
  const [viewMode, setViewMode] = useState<"campaign" | "adgroup">(hasAdGroupData ? "adgroup" : "campaign");
  const [trendScope, setTrendScope] = useState<"account" | "campaign" | "adgroup">("account");
  const [selectedCampaign, setSelectedCampaign] = useState(impressionShare.byCampaign[0]?.name || "");
  const [adGroupSearch, setAdGroupSearch] = useState("");
  const [selectedAdGroups, setSelectedAdGroups] = useState<Set<string>>(() => new Set());
  const [adGroupPickerOpen, setAdGroupPickerOpen] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    () => new Set(auctionInsights.map((i) => i.campaignName))
  );
  const [expandedAdGroups, setExpandedAdGroups] = useState<Set<string>>(
    () => {
      if (!adGroupAuctionInsights) return new Set<string>();
      return new Set(
        adGroupAuctionInsights.map((ag) => `${ag.campaignName}::${ag.adGroupName}`)
      );
    }
  );

  const topCompetitors = useMemo(
    () => aggregateCompetitors(auctionInsights, 2),
    [auctionInsights],
  );

  const adGroupsByCampaign = useMemo(
    () => hasAdGroupData
      ? groupAdGroupInsightsByCampaign(adGroupAuctionInsights)
      : new Map<string, GoogleAdsDashboardAdGroupAuctionInsight[]>(),
    [adGroupAuctionInsights, hasAdGroupData],
  );

  const adGroupTrendOptions = useMemo(
    () => (impressionShare.byAdGroup || []).filter((ag) => !selectedCampaign || ag.campaignName === selectedCampaign),
    [impressionShare.byAdGroup, selectedCampaign],
  );

  const filteredAdGroupOptions = useMemo(() => {
    const q = adGroupSearch.trim().toLowerCase();
    if (!q) return adGroupTrendOptions;
    return adGroupTrendOptions.filter((ag) => `${ag.campaignName} ${ag.adGroupName}`.toLowerCase().includes(q));
  }, [adGroupSearch, adGroupTrendOptions]);

  const trendPoints = useMemo(() => {
    if (trendScope === "campaign") {
      const campaign = impressionShare.byCampaign.find((c) => c.name === selectedCampaign);
      return lastNMonths(campaign?.monthly || []);
    }
    if (trendScope === "adgroup") {
      const selected = adGroupTrendOptions.filter((ag) => selectedAdGroups.has(`${ag.campaignName}::${ag.adGroupName}`));
      return averageMonthlySeries(selected.map((ag) => ag.monthly));
    }
    if (impressionShare.monthly?.length) return lastNMonths(impressionShare.monthly);
    return averageMonthlySeries(impressionShare.byCampaign.map((c) => c.monthly || []).filter((m) => m.length > 0));
  }, [adGroupTrendOptions, impressionShare.byCampaign, impressionShare.monthly, selectedAdGroups, selectedCampaign, trendScope]);

  function toggleAdGroupTrend(campaignName: string, adGroupName: string) {
    const key = `${campaignName}::${adGroupName}`;
    setSelectedAdGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCampaign(name: string) {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAdGroup(key: string) {
    setExpandedAdGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Impression Share KPIs — compact format matches the Overview tab. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <ImpressionKpiCard
          label="Search Visibility"
          value={pct(impressionShare.overallVisibility)}
          description="of eligible searches you appeared in"
          color="blue"
        />
        <ImpressionKpiCard
          label="Missed — Budget"
          value={pct(impressionShare.budgetLost)}
          description="missed because daily budget ran out"
          color="amber"
        />
        <ImpressionKpiCard
          label="Missed — Ad Rank"
          value={pct(impressionShare.rankLost)}
          description="missed to higher bids or better ad quality"
          color="red"
        />
      </div>

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
              Impression Share by Month
            </h2>
            <p className="text-xs text-slate-400 mt-1">Last 14 months, matching the Progress tab trend style.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {(["account", "campaign", "adgroup"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setTrendScope(scope)}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${trendScope === scope ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"}`}
              >
                {scope === "account" ? "Account wide" : scope === "campaign" ? "By campaign" : "By ad group"}
              </button>
            ))}
          </div>
        </div>

        {trendScope !== "account" && (
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Campaign</span>
              <select
                value={selectedCampaign}
                onChange={(e) => {
                  setSelectedCampaign(e.target.value);
                  setSelectedAdGroups(new Set());
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {impressionShare.byCampaign.map((campaign) => (
                  <option key={campaign.name} value={campaign.name}>{campaign.name}</option>
                ))}
              </select>
            </label>
            {trendScope === "adgroup" && (
              <div className="relative">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Ad groups</span>
                <button
                  type="button"
                  onClick={() => setAdGroupPickerOpen((open) => !open)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {selectedAdGroups.size > 0 ? `${selectedAdGroups.size} selected` : "Search and select ad groups"}
                </button>
                {adGroupPickerOpen && (
                  <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg p-3">
                    <input
                      value={adGroupSearch}
                      onChange={(e) => setAdGroupSearch(e.target.value)}
                      placeholder="Search ad groups..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="mt-2 max-h-56 overflow-auto space-y-1">
                      {filteredAdGroupOptions.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-slate-400">No ad groups found.</p>
                      ) : filteredAdGroupOptions.map((ag) => {
                        const key = `${ag.campaignName}::${ag.adGroupName}`;
                        return (
                          <label key={key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selectedAdGroups.has(key)}
                              onChange={() => toggleAdGroupTrend(ag.campaignName, ag.adGroupName)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="truncate">{ag.adGroupName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {trendPoints.length > 0 ? (
          <ImpressionShareTrendChart points={trendPoints} />
        ) : (
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-8 text-center text-sm text-slate-500">
            No monthly impression share data is available for this selection yet.
          </div>
        )}
      </div>

      {/* Top 2 Biggest Competitors */}
      {topCompetitors.length > 0 && (
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3">
            Biggest Competitors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topCompetitors.map((comp, i) => (
              <TopCompetitorCard key={comp.domain} comp={comp} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Per-campaign impression share */}
      {impressionShare.byCampaign.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3">
            Visibility by Campaign
          </h2>
          <DataTable
            columns={campaignIsColumns}
            rows={impressionShare.byCampaign}
            emptyMessage="No impression share data"
          />
        </div>
      )}

      {/* Auction Insights */}
      {auctionInsights.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
              Who You&apos;re Competing Against
            </h2>
            {hasAdGroupData && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                <button
                  onClick={() => setViewMode("campaign")}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    viewMode === "campaign"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  By Campaign
                </button>
                <button
                  onClick={() => setViewMode("adgroup")}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    viewMode === "adgroup"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  By Ad Group
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">
            {viewMode === "campaign"
              ? "Click a campaign to see which competitors appear alongside your ads"
              : "Drill into campaigns and ad groups for granular competitor visibility"}
          </p>

          {/* Campaign-level view */}
          {viewMode === "campaign" && (
            <div className="space-y-2">
              {auctionInsights.map((insight) => {
                const isOpen = expandedCampaigns.has(insight.campaignName);
                return (
                  <div
                    key={insight.campaignName}
                    className="border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCampaign(insight.campaignName)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {insight.campaignName}
                      </span>
                      <span className="text-xs text-slate-400">
                        {insight.competitors.length} competitor
                        {insight.competitors.length !== 1 ? "s" : ""}{" "}
                        <span
                          className={`inline-block transition-transform ${isOpen ? "rotate-180" : ""}`}
                        >
                          &#9662;
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="p-4">
                        <DataTable
                          columns={competitorColumns}
                          rows={insight.competitors}
                          emptyMessage="No competitor data"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ad-group-level view: campaign → ad group drill-down */}
          {viewMode === "adgroup" && hasAdGroupData && (
            <div className="space-y-2">
              {Array.from(adGroupsByCampaign.entries()).map(([campaignName, adGroups]) => {
                const isCampaignOpen = expandedCampaigns.has(campaignName);
                const totalCompetitors = new Set(
                  adGroups.flatMap((ag) => ag.competitors.map((c) => c.domain)),
                ).size;
                return (
                  <div
                    key={campaignName}
                    className="border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCampaign(campaignName)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {campaignName}
                      </span>
                      <span className="text-xs text-slate-400">
                        {adGroups.length} ad group{adGroups.length !== 1 ? "s" : ""} · {totalCompetitors} competitor{totalCompetitors !== 1 ? "s" : ""}{" "}
                        <span
                          className={`inline-block transition-transform ${isCampaignOpen ? "rotate-180" : ""}`}
                        >
                          &#9662;
                        </span>
                      </span>
                    </button>
                    {isCampaignOpen && (
                      <div className="p-3 space-y-2">
                        {adGroups.map((ag) => {
                          const agKey = `${campaignName}::${ag.adGroupName}`;
                          const isAgOpen = expandedAdGroups.has(agKey);
                          return (
                            <div
                              key={agKey}
                              className="border border-slate-100 rounded-lg overflow-hidden"
                            >
                              <button
                                onClick={() => toggleAdGroup(agKey)}
                                className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="text-sm text-slate-600">
                                  {ag.adGroupName}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {ag.competitors.length} competitor{ag.competitors.length !== 1 ? "s" : ""}{" "}
                                  <span
                                    className={`inline-block transition-transform ${isAgOpen ? "rotate-180" : ""}`}
                                  >
                                    &#9662;
                                  </span>
                                </span>
                              </button>
                              {isAgOpen && (
                                <div className="p-4 pt-2">
                                  <DataTable
                                    columns={competitorColumns}
                                    rows={ag.competitors}
                                    emptyMessage="No competitor data"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {auctionInsights.length === 0 &&
        impressionShare.byCampaign.length === 0 && (
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-12 text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              No Competitor Data Available
            </h2>
            <p className="mt-2 text-sm text-slate-500 max-w-lg mx-auto">
              Auction insights and impression share data are only available for
              Search campaigns. If this account runs only Performance Max,
              Shopping, or Display campaigns, this section will remain empty.
            </p>
          </div>
        )}
    </div>
  );
}
