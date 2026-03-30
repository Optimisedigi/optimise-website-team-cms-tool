"use client";

import { useState, useMemo } from "react";
import { DataTable, type Column } from "@/components/dashboards/shared/DataTable";
import type {
  GoogleAdsDashboardAuctionInsight,
  GoogleAdsDashboardAdGroupAuctionInsight,
  GoogleAdsDashboardImpressionShare,
  GoogleAdsDashboardCompetitor,
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
  const colorMap = {
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
  };
  const textMap = {
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };
  return (
    <div
      className={`rounded-xl border p-5 ${colorMap[color]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold ${textMap[color]}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
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
  const [viewMode, setViewMode] = useState<"campaign" | "adgroup">("campaign");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    () => new Set(auctionInsights.map((i) => i.campaignName))
  );
  const [expandedAdGroups, setExpandedAdGroups] = useState<Set<string>>(new Set());

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
      {/* Impression Share KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ImpressionKpiCard
          label="Your Search Visibility"
          value={pct(impressionShare.overallVisibility)}
          description={`You appeared in ${pct(impressionShare.overallVisibility)} of all searches where your ads were eligible`}
          color="blue"
        />
        <ImpressionKpiCard
          label="Missed Due to Budget"
          value={pct(impressionShare.budgetLost)}
          description={`You missed ${pct(impressionShare.budgetLost)} of searches because your daily budget ran out before the day ended`}
          color="amber"
        />
        <ImpressionKpiCard
          label="Missed Due to Ad Rank"
          value={pct(impressionShare.rankLost)}
          description={`You missed ${pct(impressionShare.rankLost)} of searches because competitors had higher bids or better ad quality`}
          color="red"
        />
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
