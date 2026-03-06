"use client";

import { useState } from "react";
import { DataTable, type Column } from "@/components/dashboards/shared/DataTable";
import type {
  GoogleAdsDashboardAuctionInsight,
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

export function CompetitorAnalysis({
  auctionInsights,
  impressionShare,
}: CompetitorAnalysisProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    () => new Set(auctionInsights.map((i) => i.campaignName))
  );

  function toggleCampaign(name: string) {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
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

      {/* Auction Insights by Campaign */}
      {auctionInsights.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-1">
            Who You&apos;re Competing Against
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Click a campaign to see which competitors appear alongside your ads
          </p>
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
        </div>
      )}

      {auctionInsights.length === 0 &&
        impressionShare.byCampaign.length === 0 && (
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-12 text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              No Competitor Data Yet
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Auction insights will appear once there is enough search campaign
              data
            </p>
          </div>
        )}
    </div>
  );
}
