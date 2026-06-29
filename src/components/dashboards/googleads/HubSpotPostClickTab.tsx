"use client";

import { useMemo, useState } from "react";
import { StackedBarChart, type BarData } from "@/components/dashboards/shared/StackedBarChart";
import type { HubSpotPostClickDashboardData } from "@/lib/dashboard-types";

type MetricKey = "paidLeads" | "meetings" | "meetingRate" | "qualifiedLeadRate";

const METRICS: Array<{ key: MetricKey; label: string; shortLabel: string }> = [
  { key: "paidLeads", label: "Google Ads / HubSpot paid leads checked", shortLabel: "Paid leads" },
  { key: "meetings", label: "HubSpot meetings", shortLabel: "Meetings" },
  { key: "meetingRate", label: "Lead → HubSpot meeting conversion rate", shortLabel: "Meeting rate" },
  { key: "qualifiedLeadRate", label: "Lead quality metric", shortLabel: "Qualified lead rate" },
];

const CONFIDENCE_LABELS: Record<string, string> = {
  single_candidate: "Single search-term candidate",
  multiple_candidates: "Multiple search-term candidates",
  keyword_fallback: "Keyword fallback",
  hubspot_source_fallback: "HubSpot source fallback",
};

function monthLabel(yyyymm: string): string {
  const [, mm] = yyyymm.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[Number(mm) - 1] || yyyymm;
}

function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function HubSpotPostClickTab({ data }: { data: HubSpotPostClickDashboardData }) {
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["paidLeads", "meetings", "meetingRate"]);
  const [showLeadDetails, setShowLeadDetails] = useState(false);

  const chartData = useMemo<BarData[]>(() => {
    return data.monthly.map((month) => ({
      label: monthLabel(month.month),
      segments: [
        selectedMetrics.includes("paidLeads")
          ? { value: month.paidLeads, color: "#2563eb", label: "Paid leads" }
          : null,
        selectedMetrics.includes("meetings")
          ? { value: month.meetings, color: "#16a34a", label: "HubSpot meetings" }
          : null,
      ].filter(Boolean) as BarData["segments"],
      lineValue: selectedMetrics.includes("meetingRate")
        ? month.meetingRate ?? 0
        : selectedMetrics.includes("qualifiedLeadRate")
          ? month.qualifiedLeadRate ?? 0
          : undefined,
    })).filter((row) => row.segments.length > 0 || row.lineValue != null);
  }, [data.monthly, selectedMetrics]);

  const lineLabel = selectedMetrics.includes("meetingRate")
    ? "Lead → meeting rate %"
    : selectedMetrics.includes("qualifiedLeadRate")
      ? "Qualified lead rate %"
      : "Rate %";

  function toggleMetric(key: MetricKey) {
    setSelectedMetrics((current) => {
      if (current.includes(key)) {
        const next = current.filter((item) => item !== key);
        return next.length ? next : current;
      }
      if (key === "meetingRate") return [...current.filter((item) => item !== "qualifiedLeadRate"), key];
      if (key === "qualifiedLeadRate") return [...current.filter((item) => item !== "meetingRate"), key];
      return [...current, key];
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Post-click Quality</h2>
            <p className="mt-1 text-sm text-slate-500">
              Checks whether Google Ads traffic is turning into real HubSpot meetings and qualified leads.
            </p>
          </div>
          <span className="text-xs text-slate-400">Updated {formatDate(data.lastUpdated)}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {METRICS.map((metric) => {
            const active = selectedMetrics.includes(metric.key);
            return (
              <button
                key={metric.key}
                type="button"
                onClick={() => toggleMetric(metric.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
                title={metric.label}
              >
                {metric.shortLabel}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {chartData.length ? (
            <StackedBarChart
              data={chartData}
              lineLabel={lineLabel}
              lineColor="#0f172a"
              height={230}
              valueFormat="number"
              totalLabel="Total leads / meetings"
              showDiff={false}
              showBarTotal
            />
          ) : (
            <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">No post-click data for this range yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Attribution by search evidence</h3>
          <p className="mt-1 text-xs text-slate-400">Grouped by month, best available search-term evidence, campaign, ad group, and keyword.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Month</th>
                <th className="px-4 py-3 text-left font-medium">Search term evidence</th>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Ad group</th>
                <th className="px-4 py-3 text-left font-medium">Keyword</th>
                <th className="px-4 py-3 text-right font-medium">Paid leads</th>
                <th className="px-4 py-3 text-right font-medium">Meetings</th>
                <th className="px-4 py-3 text-right font-medium">Meeting rate</th>
                <th className="px-4 py-3 text-right font-medium">Lead quality</th>
                <th className="px-4 py-3 text-left font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.attributionRows.length ? data.attributionRows.map((row, index) => (
                <tr key={`${row.month}-${row.campaignName}-${row.keywordText}-${index}`} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.month}</td>
                  <td className="min-w-[220px] px-4 py-3 text-slate-800">{row.searchTermEvidence}</td>
                  <td className="min-w-[180px] px-4 py-3 text-slate-600">{row.campaignName}</td>
                  <td className="min-w-[160px] px-4 py-3 text-slate-600">{row.adGroupName}</td>
                  <td className="min-w-[160px] px-4 py-3 text-slate-600">
                    {row.keywordText}
                    {row.keywordMatchType && <span className="ml-1 text-xs text-slate-400">({row.keywordMatchType})</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{row.paidLeads}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{row.meetings}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatRate(row.meetingRate)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatRate(row.qualifiedLeadRate)}</td>
                  <td className="min-w-[180px] px-4 py-3 text-xs text-slate-500">{CONFIDENCE_LABELS[row.searchTermConfidence] || row.searchTermConfidence}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">No attribution rows for this range yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setShowLeadDetails((open) => !open)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-700"
        >
          <span>Lead details</span>
          <span className="text-xs text-slate-400">{showLeadDetails ? "Hide" : "Show"}</span>
        </button>
        {showLeadDetails && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-left font-medium">Company/contact</th>
                  <th className="px-4 py-3 text-left font-medium">Campaign</th>
                  <th className="px-4 py-3 text-left font-medium">Ad group</th>
                  <th className="px-4 py-3 text-left font-medium">Keyword</th>
                  <th className="px-4 py-3 text-left font-medium">Search term evidence</th>
                  <th className="px-4 py-3 text-left font-medium">Meeting?</th>
                  <th className="px-4 py-3 text-left font-medium">Lead status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.leadDetails.map((lead) => (
                  <tr key={lead.contactId}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(lead.createdAt)}</td>
                    <td className="min-w-[180px] px-4 py-3 text-slate-800">{lead.company || lead.contactName}</td>
                    <td className="min-w-[180px] px-4 py-3 text-slate-600">{lead.campaignName || lead.hubspotCampaign || "—"}</td>
                    <td className="min-w-[160px] px-4 py-3 text-slate-600">{lead.adGroupName || "—"}</td>
                    <td className="min-w-[160px] px-4 py-3 text-slate-600">{lead.keywordText || lead.hubspotKeyword || "—"}</td>
                    <td className="min-w-[220px] px-4 py-3 text-slate-600">{lead.searchTermEvidence.join(", ")}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.meetings > 0 ? `Yes (${lead.meetings})` : "No"}</td>
                    <td className="min-w-[160px] px-4 py-3 text-slate-600">{lead.leadStatus || lead.lifecycleStage || (lead.isQualifiedLead ? "Qualified" : "Unqualified")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900">
        <p className="font-semibold">Confidence note</p>
        <p className="mt-1">
          Search terms are evidence-based: click_view can match GCLID to campaign/ad group/keyword, while search_term_view supplies possible search terms without contact-level GCLID.
        </p>
        <p className="mt-2 text-blue-800">
          Checked {data.diagnostics.paidGoogleLeadsChecked} paid leads; {data.diagnostics.gclidsMatchedToClickView} matched to click_view; {data.diagnostics.searchTermRows} search-term rows found.
          {data.diagnostics.clickViewLookbackLimited ? " Older dates may use keyword or HubSpot source fallback because click_view is limited." : ""}
        </p>
        {data.diagnostics.notes.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-blue-800">
            {data.diagnostics.notes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
