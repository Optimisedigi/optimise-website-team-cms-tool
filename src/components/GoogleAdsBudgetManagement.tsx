'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDocumentInfo } from '@payloadcms/ui';

interface BudgetCampaign {
  id?: string;
  campaignId: string;
  campaignName: string;
  budgetPercentage: number;
  calculatedDailyBudget: number;
  actualDailyBudget?: number;
  lastPushedAt?: string;
  bidStrategy: string;
  bidStrategyId?: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  conversions: number;
  spend?: number;
  mtdSpend?: number;
  locationIds?: string[];
  locationNames?: string[];
  enabled: boolean; // Whether this campaign is included in budget allocation
  campaignStatus?: string;
}

type CampaignFilter = 'enabled' | 'paused' | 'all';

interface MonthlySpend {
  totalSpend: number;
  dailyBudget: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyBurnRate: number;
  remainingBudget: number;
  maxBudget: number;
}

const BID_STRATEGIES = [
  { label: 'Manual CPC', value: 'manual_cpc' },
  { label: 'Maximize Conversions', value: 'maximize_conversions' },
  { label: 'Maximize Conversion Value', value: 'maximize_conversion_value' },
  { label: 'Target CPA', value: 'target_cpa' },
  { label: 'Target ROAS', value: 'target_roas' },
  { label: 'Target Impressions', value: 'target_impressions' },
  { label: 'Maximize Clicks', value: 'maximize_clicks' },
];

const DAYS_IN_MONTH = 30.4;

// Get current month info
function getMonthInfo() {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysRemaining = Math.max(1, daysInMonth - daysElapsed); // min 1 to avoid division by zero
  return { daysInMonth, daysElapsed, daysRemaining };
}

// Get actual MTD spend from campaign data (from Google Ads THIS_MONTH query)
function getTotalMtdSpend(campaigns: BudgetCampaign[]): number {
  return campaigns.reduce((sum, c) => sum + (c.mtdSpend || 0), 0);
}

// Calculate smart daily budget for a campaign based on remaining budget and days
function calculateSmartDailyBudget(
  monthlyBudget: number,
  campaignPercentage: number,
  totalMtdSpend: number,
  daysRemaining: number,
): number {
  const remainingBudget = Math.max(0, monthlyBudget - totalMtdSpend);
  const campaignShare = remainingBudget * (campaignPercentage / 100);
  return campaignShare / daysRemaining;
}

// Calculate monthly spend metrics
function calculateMonthlySpend(campaigns: BudgetCampaign[], monthlyBudget: number): MonthlySpend {
  const { daysInMonth, daysElapsed, daysRemaining } = getMonthInfo();

  // Use actual MTD spend from Google Ads
  const totalSpend = getTotalMtdSpend(campaigns);

  const dailyBudget = monthlyBudget / daysInMonth;
  const dailyBurnRate = daysElapsed > 0 ? totalSpend / daysElapsed : 0;
  const remainingBudget = Math.max(0, monthlyBudget - totalSpend);
  
  return {
    totalSpend,
    dailyBudget,
    daysElapsed,
    daysRemaining,
    dailyBurnRate,
    remainingBudget,
    maxBudget: monthlyBudget,
  };
}

// Generate Gmail-ready HTML email
function generateEmailHtml(
  businessName: string,
  month: string,
  spend: MonthlySpend,
  campaigns: BudgetCampaign[],
  monthlyBudget: number,
  clientSlug?: string,
  clientPin?: string
): string {
  const percentUsed = spend.maxBudget > 0 ? (spend.totalSpend / spend.maxBudget) * 100 : 0;
  const onTrackPercent = (spend.daysElapsed / 30.4) * 100;
  const statusColor = percentUsed <= 90 ? '#059669' : percentUsed <= 100 ? '#d97706' : '#dc2626';
  const statusBg = percentUsed <= 90 ? '#f0fdf4' : percentUsed <= 100 ? '#fffbeb' : '#fef2f2';
  const isUnderBudget = percentUsed < onTrackPercent;
  const statusText = percentUsed > 100 ? 'Over Budget' : percentUsed > 90 ? 'On Track' : isUnderBudget ? 'Under Budget' : 'On Track';
  const enabledCampaigns = campaigns
    .filter(c => c.enabled && c.budgetPercentage > 0)
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0));

  const campaignRows = enabledCampaigns.map(c => {
    const mtd = c.mtdSpend || 0;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${c.campaignName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.budgetPercentage}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">$${c.calculatedDailyBudget.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600">$${mtd.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${(c.impressions || 0).toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${(c.clicks || 0).toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">$${(c.avgCpc || 0).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.conversions || 0}</td>
    </tr>`;
  }).join('');

  const dashboardUrl = clientSlug ? `https://cms.optimisedigital.online/google-dashboard/${clientSlug}` : '';

  return `<div style="font-family:Arial,sans-serif;max-width:700px;color:#1e293b">
  <p style="margin:0 0 20px;color:#64748b;font-size:14px">${month} (Month-to-Date)</p>

  <!-- Budget Progress + Time Tracking side by side -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr>
      <td style="width:55%;vertical-align:top;padding-right:8px">
        <div style="padding:20px;background:${statusBg};border-radius:12px;border:2px solid ${statusColor};height:100%">
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
            <tr>
              <td style="text-align:left;font-size:14px;font-weight:600;color:#374151">${statusText}</td>
              <td style="text-align:right;font-size:22px;font-weight:700;color:${statusColor}">${percentUsed.toFixed(0)}%</td>
            </tr>
          </table>
          <!-- Progress bar (Gmail-safe: table-based) -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:8px" cellpadding="0" cellspacing="0">
            <tr>${(() => {
              const pct = Math.min(percentUsed, 100);
              const marker = Math.min(onTrackPercent, 100);
              const markerTd = `<td style="width:3px;min-width:3px;max-width:3px;height:24px;background:#1e293b;font-size:1px;line-height:1px;padding:0">&#8203;</td>`;
              if (pct < marker) {
                const gap = marker - pct;
                const rest = 100 - marker;
                return `<td style="width:${pct}%;height:24px;background:${statusColor};border-radius:12px 0 0 12px;font-size:1px">&nbsp;</td><td style="width:${gap}%;height:24px;background:#e5e7eb;font-size:1px">&nbsp;</td>${markerTd}<td style="width:${rest}%;height:24px;background:#e5e7eb;border-radius:0 12px 12px 0;font-size:1px">&nbsp;</td>`;
              } else {
                const rest = 100 - pct;
                return `<td style="width:${marker}%;height:24px;background:${statusColor};border-radius:12px 0 0 12px;font-size:1px">&nbsp;</td>${markerTd}<td style="width:${pct - marker}%;height:24px;background:${statusColor};font-size:1px">&nbsp;</td><td style="width:${rest}%;height:24px;background:#e5e7eb;border-radius:0 12px 12px 0;font-size:1px">&nbsp;</td>`;
              }
            })()}
            </tr>
          </table>
          <table style="width:100%;border-collapse:collapse;margin-bottom:2px">
            <tr>
              <td style="text-align:left;font-size:11px;color:#64748b">$0</td>
              <td style="text-align:right;font-size:11px;color:#64748b">$${spend.maxBudget.toLocaleString()}</td>
            </tr>
          </table>
          <div style="font-size:10px;color:#94a3b8;text-align:center">Vertical line shows where you should be on track</div>
          <!-- Spent / Remaining -->
          <table style="width:100%;border-collapse:collapse;margin-top:12px">
            <tr>
              <td style="text-align:center;width:50%">
                <div style="font-size:18px;font-weight:700;color:${statusColor}">$${spend.totalSpend.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                <div style="font-size:11px;color:#64748b">Month-to-Date Spend</div>
              </td>
              <td style="text-align:center;width:50%">
                <div style="font-size:18px;font-weight:700;color:#64748b">$${spend.remainingBudget.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                <div style="font-size:11px;color:#64748b">Remaining Monthly Budget</div>
              </td>
            </tr>
          </table>
        </div>
      </td>
      <td style="width:45%;vertical-align:top;padding-left:8px">
        <div style="padding:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;height:100%">
          <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:14px">Time Tracking</div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
            <tr>
              <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;text-align:center">
                <div style="font-size:10px;color:#64748b;margin-bottom:2px">Days Elapsed</div>
                <div style="font-size:22px;font-weight:700;color:#1e293b">${spend.daysElapsed}</div>
              </td>
              <td style="width:6px"></td>
              <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;text-align:center">
                <div style="font-size:10px;color:#64748b;margin-bottom:2px">Days Remaining</div>
                <div style="font-size:22px;font-weight:700;color:#1e293b">${spend.daysRemaining}</div>
              </td>
            </tr>
          </table>
          <!-- Calendar grid -->
          <div style="margin-top:8px">
            <div>${(() => {
              const now = new Date().getDate();
              const totalDays = Math.ceil(30.4);
              return Array.from({ length: totalDays }, (_, i) => {
                const day = i + 1;
                const bg = day === now ? '#2563eb' : day < now ? '#059669' : '#e5e7eb';
                return `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${bg};margin:0 1px 2px 0"></span>`;
              }).join('');
            })()}</div>
            <div style="margin-top:6px;font-size:10px;color:#64748b">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#059669;margin-right:3px;vertical-align:middle"></span>Past
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#2563eb;margin:0 3px 0 10px;vertical-align:middle"></span>Today
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#e5e7eb;margin:0 3px 0 10px;vertical-align:middle"></span>Remaining
            </div>
          </div>
        </div>
      </td>
    </tr>
  </table>

  <h3 style="margin:0 0 8px;font-size:15px">Campaign Breakdown</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr style="background:#f1f5f9">
      <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Campaign</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Split</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Adjusted Daily Budget</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">MTD Spend</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Impr.</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Clicks</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Avg CPC</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Conv.</th>
    </tr>
    ${campaignRows}
  </table>

  ${dashboardUrl ? `<p style="font-size:13px;color:#64748b;margin:0"><a href="${dashboardUrl}" style="color:#2563eb;text-decoration:none;font-weight:500">View live dashboard</a>${clientPin ? ` — PIN: ${clientPin}` : ''}</p>` : ''}
</div>`;
}

interface LastMonthRecap {
  monthLabel: string;
  monthlyBudget?: number;
  customerIdUsed?: string;
  conversionActionsApplied?: string[];
  totals: {
    spend: number;
    clicks: number;
    impressions: number;
    conversions: number;
    ctr: number;
    avgCpc: number;
    cpl: number;
  };
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    ctr: number;
    avgCpc: number;
    cpl: number;
  }>;
  topByClicks: Array<SearchTermRow>;
  topByConversions: Array<SearchTermRow>;
  topBySpend: Array<SearchTermRow>;
  insights: Array<{ severity: 'good' | 'warning' | 'critical'; title: string; body: string }>;
  searchTermsAvailable: boolean;
}

interface SearchTermRow {
  searchTerm: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

function searchTermRows(
  rows: SearchTermRow[],
  metricKey: 'clicks' | 'conversions' | 'cost'
): string {
  if (rows.length === 0) {
    return `<tr><td colspan="4" style="padding:12px;font-size:12px;color:#94a3b8;text-align:center;border-bottom:1px solid #e5e7eb">No data available</td></tr>`;
  }
  return rows.map((r, i) => {
    const metricVal = metricKey === 'cost'
      ? `$${r.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : r[metricKey].toLocaleString();
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b">${i + 1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${r.searchTerm}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b">${r.campaignName || '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">${metricVal}</td>
    </tr>`;
  }).join('');
}

function generateLastMonthEmailHtml(
  businessName: string,
  recap: LastMonthRecap,
  clientSlug?: string,
  clientPin?: string
): string {
  const t = recap.totals;
  const dashboardUrl = clientSlug ? `https://cms.optimisedigital.online/google-dashboard/${clientSlug}` : '';

  const campaignRows = recap.campaigns
    .filter(c => c.cost > 0 || c.impressions > 0)
    .map(c => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${c.campaignName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600">$${c.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.impressions.toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.clicks.toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.ctr.toFixed(2)}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">$${c.avgCpc.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.conversions.toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.cpl > 0 ? `$${c.cpl.toFixed(0)}` : '—'}</td>
    </tr>`).join('');

  const insightCards = recap.insights.map(ins => {
    const colorMap = {
      good: { bg: '#f0fdf4', border: '#bbf7d0', accent: '#059669', icon: '✓' },
      warning: { bg: '#fffbeb', border: '#fed7aa', accent: '#d97706', icon: '!' },
      critical: { bg: '#fef2f2', border: '#fecaca', accent: '#dc2626', icon: '✕' },
    };
    const c = colorMap[ins.severity];
    return `<div style="padding:14px 16px;background:${c.bg};border:1px solid ${c.border};border-left:4px solid ${c.accent};border-radius:8px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:${c.accent};margin-bottom:4px">${c.icon} ${ins.title}</div>
      <div style="font-size:13px;color:#374151;line-height:1.5">${ins.body}</div>
    </div>`;
  }).join('');

  const thisMonthLabel = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  // Budget progress (only if a monthly budget was set)
  const budget = recap.monthlyBudget || 0;
  const percentUsed = budget > 0 ? (t.spend / budget) * 100 : 0;
  const remaining = Math.max(0, budget - t.spend);
  const isOver = percentUsed > 100;
  const isUnder = percentUsed < 95;
  const statusColor = isOver ? '#dc2626' : isUnder ? '#059669' : '#d97706';
  const statusBg = isOver ? '#fef2f2' : isUnder ? '#f0fdf4' : '#fffbeb';
  const statusText = isOver ? 'Over Budget' : isUnder ? 'Under Budget' : 'On Target';

  const budgetBlock = budget > 0 ? `
  <div style="padding:20px;background:${statusBg};border-radius:12px;border:2px solid ${statusColor};margin-bottom:20px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
      <tr>
        <td style="text-align:left;font-size:14px;font-weight:600;color:#374151">${statusText} — ${recap.monthLabel}</td>
        <td style="text-align:right;font-size:22px;font-weight:700;color:${statusColor}">${percentUsed.toFixed(0)}%</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px" cellpadding="0" cellspacing="0">
      <tr>${(() => {
        const pct = Math.min(percentUsed, 100);
        const rest = 100 - pct;
        return `<td style="width:${pct}%;height:24px;background:${statusColor};border-radius:12px 0 0 12px;font-size:1px">&nbsp;</td><td style="width:${rest}%;height:24px;background:#e5e7eb;border-radius:0 12px 12px 0;font-size:1px">&nbsp;</td>`;
      })()}
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:2px">
      <tr>
        <td style="text-align:left;font-size:11px;color:#64748b">$0</td>
        <td style="text-align:right;font-size:11px;color:#64748b">$${budget.toLocaleString()}</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr>
        <td style="text-align:center;width:33%">
          <div style="font-size:18px;font-weight:700;color:${statusColor}">$${t.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div style="font-size:11px;color:#64748b">Spent</div>
        </td>
        <td style="text-align:center;width:33%">
          <div style="font-size:18px;font-weight:700;color:#1e293b">$${budget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div style="font-size:11px;color:#64748b">Monthly Budget</div>
        </td>
        <td style="text-align:center;width:33%">
          <div style="font-size:18px;font-weight:700;color:#64748b">${isOver ? '−' : ''}$${(isOver ? t.spend - budget : remaining).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div style="font-size:11px;color:#64748b">${isOver ? 'Over Budget' : 'Under Budget'}</div>
        </td>
      </tr>
    </table>
  </div>` : '';

  return `<div style="font-family:Arial,sans-serif;max-width:700px;color:#1e293b">
  <p style="margin:0 0 4px;color:#64748b;font-size:14px">${recap.monthLabel} Recap</p>
  <p style="margin:0 0 20px;color:#94a3b8;font-size:12px">Performance summary for ${recap.monthLabel} with action items for ${thisMonthLabel}.</p>

  ${budgetBlock}

  <!-- Headline metrics -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr>
      <td style="width:25%;padding:14px;background:#f8fafc;border-radius:8px 0 0 8px;border:1px solid #e2e8f0;text-align:center">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">Total Spend</div>
        <div style="font-size:20px;font-weight:700;color:#1e293b">$${t.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      </td>
      <td style="width:25%;padding:14px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;text-align:center">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">Conversions</div>
        <div style="font-size:20px;font-weight:700;color:#059669">${t.conversions.toLocaleString()}</div>
      </td>
      <td style="width:25%;padding:14px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;text-align:center">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">Cost / Lead</div>
        <div style="font-size:20px;font-weight:700;color:#1e293b">${t.cpl > 0 ? `$${t.cpl.toFixed(0)}` : '—'}</div>
      </td>
      <td style="width:25%;padding:14px;background:#f8fafc;border-radius:0 8px 8px 0;border:1px solid #e2e8f0;text-align:center">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">CTR</div>
        <div style="font-size:20px;font-weight:700;color:#1e293b">${t.ctr.toFixed(2)}%</div>
      </td>
    </tr>
  </table>

  ${recap.insights.length > 0 ? `
  <h3 style="margin:0 0 10px;font-size:15px">Action Items for ${thisMonthLabel}</h3>
  <div style="margin-bottom:24px">${insightCards}</div>
  ` : ''}

  <h3 style="margin:0 0 8px;font-size:15px">Campaign Performance</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr style="background:#f1f5f9">
      <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Campaign</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Spend</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Impr.</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Clicks</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">CTR</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Avg CPC</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Conv.</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">CPL</th>
    </tr>
    ${campaignRows || `<tr><td colspan="8" style="padding:12px;font-size:12px;color:#94a3b8;text-align:center">No campaign data</td></tr>`}
  </table>

  <h3 style="margin:0 0 8px;font-size:15px">Top Search Keywords</h3>
  ${!recap.searchTermsAvailable ? `<p style="font-size:12px;color:#94a3b8;margin:0 0 16px">Search term data not available — connect or enable the search terms endpoint to populate this section.</p>` : ''}

  <div style="margin-bottom:14px">
    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">By Clicks</div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#f1f5f9">
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb;width:30px">#</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Search Term</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Campaign</th>
        <th style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Clicks</th>
      </tr>
      ${searchTermRows(recap.topByClicks, 'clicks')}
    </table>
  </div>

  <div style="margin-bottom:14px">
    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">By Conversions</div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#f1f5f9">
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb;width:30px">#</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Search Term</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Campaign</th>
        <th style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Conv.</th>
      </tr>
      ${searchTermRows(recap.topByConversions, 'conversions')}
    </table>
  </div>

  <div style="margin-bottom:24px">
    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">By Spend</div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#f1f5f9">
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb;width:30px">#</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Search Term</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Campaign</th>
        <th style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Spend</th>
      </tr>
      ${searchTermRows(recap.topBySpend, 'cost')}
    </table>
  </div>

  ${dashboardUrl ? `<p style="font-size:13px;color:#64748b;margin:0"><a href="${dashboardUrl}" style="color:#2563eb;text-decoration:none;font-weight:500">View live dashboard</a>${clientPin ? ` — PIN: ${clientPin}` : ''}</p>` : ''}
</div>`;
}

// When rendered as a Payload UI field on a Google Ads audit document, the
// audit ID comes from useDocumentInfo (no props needed). When embedded on a
// different document type (e.g. a Client), the parent passes auditId
// explicitly via props.
interface GoogleAdsBudgetManagementProps {
  auditId?: string | number;
}

const GoogleAdsBudgetManagementInner = ({ auditId }: GoogleAdsBudgetManagementProps) => {
  const docInfo = useDocumentInfo();
  const id: string | number | undefined = auditId ?? docInfo.id;
  const [campaigns, setCampaigns] = useState<BudgetCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editField, setEditField] = useState<'percentage' | 'bidStrategy'>('percentage');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [monthlyTotal, setMonthlyTotal] = useState<number>(0);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [emailViewMode, setEmailViewMode] = useState<'thisMonth' | 'lastMonth'>('thisMonth');
  const [lastMonthRecap, setLastMonthRecap] = useState<LastMonthRecap | null>(null);
  const [loadingRecap, setLoadingRecap] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('enabled');
  const [businessName, setBusinessName] = useState('Client');
  const [clientSlug, setClientSlug] = useState('');
  const [clientPin, setClientPin] = useState('');
  const auditLoaded = useRef(false);

  // Load audit data (monthly budget + business name + client slug + pin) once on mount
  useEffect(() => {
    if (!id || auditLoaded.current) return;
    auditLoaded.current = true;
    fetch(`/api/google-ads-audits/${id}?depth=1`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.monthlyBudget) setMonthlyTotal(data.monthlyBudget);
        if (data?.businessName) setBusinessName(data.businessName);
        if (data?.client?.slug) setClientSlug(data.client.slug);
        if (data?.client?.clientPin) setClientPin(data.client.clientPin);
      })
      .catch(() => {});
  }, [id]);

  // Recalculate daily budgets: (monthly - MTD spend) × campaign % / days remaining
  const recalculateBudgets = useCallback((budgetCampaigns: BudgetCampaign[], budget: number): BudgetCampaign[] => {
    const { daysRemaining } = getMonthInfo();
    const totalMtd = getTotalMtdSpend(budgetCampaigns);

    return budgetCampaigns.map(c => ({
      ...c,
      calculatedDailyBudget: budget > 0
        ? calculateSmartDailyBudget(budget, c.budgetPercentage, totalMtd, daysRemaining)
        : 0,
    }));
  }, []);

  const handleMonthlyTotalChange = useCallback((newTotal: number) => {
    setMonthlyTotal(newTotal);
    setCampaigns(prev => recalculateBudgets(prev, newTotal));

    // Persist monthly budget via budget update route (avoids triggering Payload form save)
    if (id && newTotal > 0) {
      fetch(`/api/google-ads-budgets/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ _saveMonthlyBudget: newTotal }),
      }).catch(() => {});
    }
  }, [id, recalculateBudgets]);

  // Load saved campaigns from CMS (fast, preserves allocations)
  const loadFromCMS = useCallback(async () => {
    if (!id) return;
    try {
      const savedRes = await fetch(`/api/google-ads-budgets/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ _loadSaved: true }),
      });
      if (savedRes.ok) {
        const savedData = await savedRes.json();
        // Only use CMS data if user has actually configured allocations
        const hasUserConfig = savedData?.campaigns?.some((c: any) => (c.budgetPercentage ?? 0) > 0);
        if (hasUserConfig) {
          // Use monthlyBudget from response to avoid race condition with audit useEffect
          let budget = monthlyTotal;
          if (savedData.monthlyBudget && savedData.monthlyBudget > 0) {
            budget = savedData.monthlyBudget;
            setMonthlyTotal(budget);
          }
          const loaded: BudgetCampaign[] = savedData.campaigns.map((c: any) => ({
            campaignId: c.campaignId,
            campaignName: c.campaignName || c.campaignId,
            budgetPercentage: c.budgetPercentage ?? 0,
            calculatedDailyBudget: c.calculatedDailyBudget ?? 0,
            actualDailyBudget: c.actualDailyBudget ?? 0,
            bidStrategy: c.bidStrategy || 'manual_cpc',
            impressions: c.impressions ?? 0,
            clicks: c.clicks ?? 0,
            avgCpc: c.avgCpc ?? 0,
            conversions: c.conversions ?? 0,
            mtdSpend: c.mtdSpend ?? 0,
            enabled: c.enabled !== undefined ? c.enabled : true,
          }));
          setCampaigns(recalculateBudgets(loaded, budget));
          return true;
        }
      }
    } catch { /* fall through */ }
    return false;
  }, [id, monthlyTotal, recalculateBudgets]);

  // Sync from Google Ads (slower, gets fresh metrics + MTD spend)
  const syncFromGoogleAds = useCallback(async () => {
    if (!id) return;
    setSyncing(true);
    setError(null);

    try {
      const res = await fetch(`/api/google-ads-budgets/${id}/list`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      // List endpoint now returns merged data: fresh metrics + saved CMS allocations
      const freshCampaigns: BudgetCampaign[] = (data.campaigns || []).map((c: any) => ({
        ...c,
        enabled: c.enabled !== undefined ? c.enabled : true,
        budgetPercentage: c.budgetPercentage ?? 0,
      }));

      // Use monthlyBudget from list response (from audit record) to avoid race condition
      let budget = monthlyTotal;
      if (data.monthlyBudget && data.monthlyBudget > 0) {
        budget = data.monthlyBudget;
        setMonthlyTotal(budget);
      }

      // Auto-derive monthly total from daily budgets only if no saved budget exists
      if (budget === 0 && freshCampaigns.length > 0) {
        const total = freshCampaigns.reduce(
          (sum, c) => sum + (c.actualDailyBudget || 0) * DAYS_IN_MONTH,
          0
        );
        if (total > 0) {
          budget = Math.round(total);
          setMonthlyTotal(budget);
        }
      }

      setCampaigns(recalculateBudgets(freshCampaigns, budget));
      setSuccess('Synced latest data from Google Ads');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }, [id, monthlyTotal, recalculateBudgets]);

  // On mount: always sync from Google Ads to get fresh MTD spend data
  // The list endpoint merges saved CMS allocations into its response
  const initialLoadDone = useRef(false);
  const fetchCampaigns = useCallback(async () => {
    if (!id || initialLoadDone.current) return;
    initialLoadDone.current = true;
    setLoading(true);
    setError(null);

    try {
      await syncFromGoogleAds();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSync = useCallback(async () => {
    await syncFromGoogleAds();
  }, [syncFromGoogleAds]);

  const handlePushToGoogleAds = useCallback(async () => {
    if (!id || campaigns.length === 0) return;

    // Only validate enabled campaigns
    const enabledCampaigns = campaigns.filter(c => c.enabled);
    const enabledPercentage = enabledCampaigns.reduce((sum, c) => sum + c.budgetPercentage, 0);
    if (Math.abs(enabledPercentage - 100) > 0.5) {
      setError(`Enabled campaigns sum to ${enabledPercentage.toFixed(1)}%, not 100%. Please adjust before pushing.`);
      return;
    }

    if (monthlyTotal <= 0) {
      setError('Set a monthly budget before pushing.');
      return;
    }

    setPushing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/google-ads-budgets/${id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campaigns: campaigns
            .filter(c => c.budgetPercentage > 0 && c.calculatedDailyBudget > 0)
            .map(c => ({
              campaignId: c.campaignId,
              dailyBudget: Math.round(c.calculatedDailyBudget * 100) / 100,
            })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Push failed (${res.status})`);
      }

      const data = await res.json();
      const failedCount = data.errors?.length || 0;
      if (failedCount > 0) {
        setError(`Pushed ${data.pushedCount} campaigns, but ${failedCount} failed: ${data.errors[0]}`);
      } else {
        setSuccess(`Successfully pushed budgets to ${data.pushedCount} campaigns in Google Ads`);
      }
      
      setCampaigns(prev => prev.map(c => ({
        ...c,
        actualDailyBudget: c.calculatedDailyBudget,
        lastPushedAt: new Date().toISOString(),
      })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPushing(false);
    }
  }, [id, campaigns]);

  const handleRefreshMetrics = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/google-ads-budgets/${id}/refresh-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`Refresh failed (${res.status})`);
      }

      const data = await res.json();
      if (data.budgets) {
        setCampaigns((prev) =>
          prev.map((c) => {
            const updated = data.budgets.find(
              (b: any) => b.campaignId === c.campaignId
            );
            return updated ? { ...c, ...updated } : c;
          })
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const startEditPercentage = useCallback((campaign: BudgetCampaign) => {
    setEditingCampaign(campaign.campaignId);
    setEditValue(String(campaign.budgetPercentage));
    setEditField('percentage');
  }, []);

  const startEditBidStrategy = useCallback((campaign: BudgetCampaign) => {
    setEditingCampaign(campaign.campaignId);
    setEditValue(campaign.bidStrategy);
    setEditField('bidStrategy');
  }, []);

  // Auto-save on blur — no explicit save button needed
  // Auto-save single campaign change to CMS
  const saveCampaignToCMS = useCallback((campaign: BudgetCampaign) => {
    if (!id) return;
    fetch(`/api/google-ads-budgets/${id}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        campaigns: [{
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          budgetPercentage: campaign.budgetPercentage,
          calculatedDailyBudget: campaign.calculatedDailyBudget,
          bidStrategy: campaign.bidStrategy,
          enabled: campaign.enabled,
        }],
      }),
    }).catch(() => {});
  }, [id]);

  const handleBlurSave = useCallback((campaignId: string, field: 'percentage' | 'bidStrategy', value: string) => {
    if (field === 'percentage') {
      const newPercentage = parseFloat(value);
      if (isNaN(newPercentage) || newPercentage < 0 || newPercentage > 100) {
        setError('Percentage must be between 0 and 100');
        setEditingCampaign(null);
        return;
      }
      const updated = campaigns.map((c) =>
        c.campaignId === campaignId ? { ...c, budgetPercentage: newPercentage } : c
      );
      const recalculated = recalculateBudgets(updated, monthlyTotal);
      setCampaigns(recalculated);
      const saved = recalculated.find(c => c.campaignId === campaignId);
      if (saved) saveCampaignToCMS(saved);
    } else if (field === 'bidStrategy') {
      setCampaigns((prev) => {
        const updated = prev.map((c) => c.campaignId === campaignId ? { ...c, bidStrategy: value } : c);
        const saved = updated.find(c => c.campaignId === campaignId);
        if (saved) saveCampaignToCMS(saved);
        return updated;
      });
    }
    setEditingCampaign(null);
    setEditValue('');
  }, [campaigns, monthlyTotal, recalculateBudgets, saveCampaignToCMS]);

  const handleAutoBalance = useCallback(() => {
    if (campaigns.length === 0) return;
    const equalPercentage = Math.round(10000 / campaigns.length) / 100;
    const remainder = 100 - (equalPercentage * campaigns.length);

    const balanced = campaigns.map((c, i) => ({
      ...c,
      budgetPercentage: i === 0 ? equalPercentage + remainder : equalPercentage,
    }));

    setCampaigns(recalculateBudgets(balanced, monthlyTotal));
  }, [campaigns, monthlyTotal, recalculateBudgets]);

  // Toggle campaign enabled/paused — pausing sets % to 0, auto-saves to CMS
  const handleToggleCampaign = useCallback((campaignId: string) => {
    setCampaigns(prev => {
      const updated = prev.map(c => {
        if (c.campaignId !== campaignId) return c;
        const nowEnabled = !c.enabled;
        return { ...c, enabled: nowEnabled, budgetPercentage: nowEnabled ? c.budgetPercentage : 0 };
      });
      const recalculated = recalculateBudgets(updated, monthlyTotal);
      const campaign = recalculated.find(c => c.campaignId === campaignId);
      if (campaign) saveCampaignToCMS(campaign);
      return recalculated;
    });
  }, [monthlyTotal, recalculateBudgets, saveCampaignToCMS]);

  // Save budget allocations to CMS (no push to Google Ads)
  const [saving, setSaving] = useState(false);
  const handleSaveBudget = useCallback(async () => {
    if (!id || campaigns.length === 0 || monthlyTotal === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/google-ads-budgets/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          monthlyBudget: monthlyTotal,
          campaigns: campaigns.map(c => ({
            campaignId: c.campaignId,
            campaignName: c.campaignName,
            budgetPercentage: c.budgetPercentage,
            calculatedDailyBudget: c.calculatedDailyBudget,
            bidStrategy: c.bidStrategy,
            enabled: c.enabled,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Save failed (${res.status})`);
      }

      if (data.errors?.length > 0) {
        setError(`Saved ${data.saved} campaigns, but ${data.errors.length} failed: ${data.errors[0]}`);
      } else {
        setSuccess(`Budget allocation saved (${data.saved} campaigns)`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [id, campaigns, monthlyTotal]);

  const fetchLastMonthRecap = useCallback(async () => {
    if (!id) return;
    setLoadingRecap(true);
    setRecapError(null);
    try {
      const res = await fetch(`/api/google-ads-audits/${id}/last-month-recap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      setLastMonthRecap(data);
    } catch (e: any) {
      setRecapError(e.message);
    } finally {
      setLoadingRecap(false);
    }
  }, [id]);

  const copyEmailToClipboard = useCallback(async () => {
    let html: string;
    let subject: string;

    if (emailViewMode === 'lastMonth' && lastMonthRecap) {
      html = generateLastMonthEmailHtml(businessName, lastMonthRecap, clientSlug, clientPin);
      subject = `${businessName} - Google Ads Recap - ${lastMonthRecap.monthLabel}`;
    } else {
      const spend = calculateMonthlySpend(campaigns, monthlyTotal);
      const currentMonth = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      html = generateEmailHtml(businessName, currentMonth, spend, campaigns, monthlyTotal, clientSlug, clientPin);
      subject = `${businessName} - Google Ads Budget Report - ${currentMonth}`;
    }

    // Copy as HTML so it pastes formatted into Gmail
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([subject], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      // Fallback: copy HTML as text
      await navigator.clipboard.writeText(html);
    }
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  }, [campaigns, monthlyTotal, businessName, clientSlug, clientPin, emailViewMode, lastMonthRecap]);

  // Auto-fetch recap when user switches to last-month tab
  useEffect(() => {
    if (showEmailModal && emailViewMode === 'lastMonth' && !lastMonthRecap && !loadingRecap) {
      fetchLastMonthRecap();
    }
  }, [showEmailModal, emailViewMode, lastMonthRecap, loadingRecap, fetchLastMonthRecap]);

  useEffect(() => {
    if (id) {
      fetchCampaigns();
    }
    // Only run once on mount — do not re-fetch when monthlyTotal changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totalPercentage = useMemo(() =>
    campaigns.filter(c => c.enabled).reduce((sum, c) => sum + c.budgetPercentage, 0),
    [campaigns]
  );
  
  const totalDailyBudget = useMemo(() =>
    campaigns.reduce((sum, c) => sum + c.calculatedDailyBudget, 0),
    [campaigns]
  );

  // Calculate monthly spend metrics
  const monthlySpend = useMemo(() => 
    calculateMonthlySpend(campaigns, monthlyTotal),
    [campaigns, monthlyTotal]
  );

  const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

  // Progress bar calculations
  const percentUsed = monthlySpend.maxBudget > 0 
    ? Math.min(100, (monthlySpend.totalSpend / monthlySpend.maxBudget) * 100) 
    : 0;
  const percentRemaining = 100 - percentUsed;
  const onTrackPercent = (monthlySpend.daysElapsed / DAYS_IN_MONTH) * 100;

  // Determine status
  const isOverBudget = percentUsed > 100;
  const isSlightlyOver = percentUsed > 90 && percentUsed <= 100;
  const isUnderBudget = percentUsed < onTrackPercent;
  const statusColor = isOverBudget ? '#dc2626' : isSlightlyOver ? '#d97706' : isUnderBudget ? '#059669' : '#2563eb';
  const statusBg = isOverBudget ? '#fef2f2' : isSlightlyOver ? '#fffbeb' : isUnderBudget ? '#f0fdf4' : '#eff6ff';
  const statusText = isOverBudget ? 'Over Budget' : isSlightlyOver ? 'On Track' : isUnderBudget ? 'Under Budget' : 'On Track';

  const budgetPerDay = monthlySpend.daysRemaining > 0 ? monthlySpend.remainingBudget / monthlySpend.daysRemaining : 0;
  const budgetPerWeek = budgetPerDay * 7;

  return (
    <div style={{ padding: '16px 0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
            Budget Management
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Set monthly budget, split % across campaigns. Daily budgets auto-adjust based on MTD spend and remaining days.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowEmailModal(true)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            📧 Email Report
          </button>
          <button
            onClick={handleRefreshMetrics}
            disabled={loading || syncing || pushing}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              cursor: loading || syncing || pushing ? 'not-allowed' : 'pointer',
            }}
          >
            Refresh Metrics
          </button>
          <button
            onClick={handleSync}
            disabled={loading || syncing || pushing}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? 'Syncing...' : 'Sync Campaigns'}
          </button>
        </div>
      </div>

      {/* Error/Success display */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}

      {success && (
        <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 16, color: '#166534', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}

      {/* Monthly Budget Configuration */}
      <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: '1 1 300px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Monthly Budget Total ($)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={monthlyTotal || ''}
                onChange={(e) => handleMonthlyTotalChange(parseFloat(e.target.value) || 0)}
                placeholder="Enter monthly budget"
                style={{ width: 200, padding: '10px 12px', fontSize: 16, fontWeight: 600, border: '2px solid #2563eb', borderRadius: 8, outline: 'none' }}
              />
              <span style={{ fontSize: 13, color: '#64748b' }}>
                = ${monthlyTotal > 0 ? (monthlyTotal / DAYS_IN_MONTH).toFixed(2) : '0.00'}/day
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <button onClick={handleAutoBalance} disabled={campaigns.length === 0} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, cursor: campaigns.length === 0 ? 'not-allowed' : 'pointer' }}>
              Auto-Balance ({campaigns.length > 0 ? (100 / campaigns.length).toFixed(1) : '0'}% each)
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSaveBudget}
                disabled={saving || campaigns.length === 0 || monthlyTotal === 0}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: saving ? '#6366f1' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: saving || campaigns.length === 0 || monthlyTotal === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save Budget'}
              </button>

              <button
                onClick={handlePushToGoogleAds}
                disabled={pushing || campaigns.length === 0 || monthlyTotal <= 0 || Math.abs(totalPercentage - 100) > 0.5}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: pushing ? '#6366f1' : Math.abs(totalPercentage - 100) <= 0.5 ? '#059669' : '#9ca3af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: pushing || campaigns.length === 0 || Math.abs(totalPercentage - 100) > 0.5 ? 'not-allowed' : 'pointer',
                }}
              >
                {pushing ? 'Pushing...' : 'Push to Google Ads'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Budget Tracker - Visual */}
      {monthlyTotal > 0 && campaigns.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
            📊 Monthly Budget Tracker - {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Budget Progress Card */}
            <div style={{ padding: 20, background: statusBg, borderRadius: 12, border: `2px solid ${statusColor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{statusText}</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: statusColor }}>{percentUsed.toFixed(0)}%</span>
              </div>
              
              {/* Progress Bar */}
              <div style={{ position: 'relative', height: 24, background: '#e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
                {/* Spend bar */}
                <div style={{ 
                  position: 'absolute', 
                  left: 0, 
                  top: 0, 
                  height: '100%', 
                  width: `${percentUsed}%`, 
                  background: statusColor,
                  borderRadius: 12,
                  transition: 'width 0.3s ease',
                }} />
                {/* On-track line */}
                <div style={{ 
                  position: 'absolute', 
                  left: `${onTrackPercent}%`, 
                  top: 0, 
                  height: '100%', 
                  width: 2, 
                  background: '#1e293b',
                  opacity: 0.5,
                }} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                <span>$0</span>
                <span>${monthlySpend.maxBudget.toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' }}>
                Vertical line shows where you should be on track
              </div>
              
              {/* Budget Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: statusColor }}>
                    ${monthlySpend.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Spent</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#64748b' }}>
                    ${monthlySpend.remainingBudget.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Remaining</div>
                </div>
              </div>
            </div>

            {/* Burn Rate Card */}
            <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>📈 Burn Rate Analysis</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Daily Budget</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#059669' }}>
                    ${monthlySpend.dailyBudget.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Actual Burn</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: monthlySpend.dailyBurnRate <= monthlySpend.dailyBudget ? '#059669' : '#dc2626' }}>
                    ${monthlySpend.dailyBurnRate.toFixed(2)}/day
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: 16, padding: 12, background: monthlySpend.dailyBurnRate <= monthlySpend.dailyBudget ? '#f0fdf4' : '#fef2f2', borderRadius: 8 }}>
                {monthlySpend.dailyBurnRate <= monthlySpend.dailyBudget ? (
                  <span style={{ fontSize: 13, color: '#166534' }}>
                    ✅ On pace! You're ${(monthlySpend.dailyBudget - monthlySpend.dailyBurnRate).toFixed(2)} under budget per day
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: '#991b1b' }}>
                    ⚠️ Spending ${(monthlySpend.dailyBurnRate - monthlySpend.dailyBudget).toFixed(2)} over budget per day
                  </span>
                )}
              </div>
            </div>

            {/* Recommended Spend Card */}
            <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>🎯 Recommended Spend</div>
              
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>
                  ${budgetPerDay.toFixed(0)}
                </span>
                <span style={{ fontSize: 14, color: '#64748b' }}>per day</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#64748b' }}>
                  ${budgetPerWeek.toFixed(0)}
                </span>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>per week</span>
              </div>
              
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                To meet your monthly budget of <strong>${monthlySpend.maxBudget.toLocaleString()}</strong>, 
                you need to spend <strong>${budgetPerDay.toFixed(2)}/day</strong> for the next {monthlySpend.daysRemaining} days.
              </div>
            </div>

            {/* Time Tracking Card */}
            <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>📅 Time Tracking</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Days Elapsed</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
                    {monthlySpend.daysElapsed}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Days Remaining</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
                    {monthlySpend.daysRemaining}
                  </div>
                </div>
              </div>
              
              {/* Calendar visualization */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {Array.from({ length: Math.ceil(DAYS_IN_MONTH) }, (_, i) => {
                    const day = i + 1;
                    const now = new Date().getDate();
                    const isPast = day < now;
                    const isToday = day === now;
                    return (
                      <div
                        key={day}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          background: isToday ? '#2563eb' : isPast ? '#059669' : '#e5e7eb',
                        }}
                        title={`Day ${day}`}
                      />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: '#64748b' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: '#059669', borderRadius: 2, display: 'inline-block' }}></span>
                    Past
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: '#2563eb', borderRadius: 2, display: 'inline-block' }}></span>
                    Today
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: '#e5e7eb', borderRadius: 2, display: 'inline-block' }}></span>
                    Remaining
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Budget Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Added Campaigns', value: campaigns.filter(c => c.enabled).length, color: '#1e293b' },
          { label: 'MTD Spend', value: `$${monthlySpend.totalSpend.toFixed(0)}`, color: '#d97706' },
          { label: 'Remaining', value: `$${monthlySpend.remainingBudget.toFixed(0)}`, color: '#059669' },
          { label: 'Smart Daily Budget', value: `$${totalDailyBudget.toFixed(2)}`, color: '#2563eb' },
          { label: 'Conversions', value: totalConversions.toLocaleString(), color: '#6366f1' },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Campaign Budget List */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
            Campaign Budget Allocation
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Allocated:</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: Math.abs(totalPercentage - 100) <= 0.5 ? '#059669' : totalPercentage > 100 ? '#dc2626' : '#d97706' }}>
              {totalPercentage.toFixed(1)}%
            </span>
            {Math.abs(totalPercentage - 100) > 0.5 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: totalPercentage > 100 ? '#dc2626' : '#d97706', background: totalPercentage > 100 ? '#fef2f2' : '#fffbeb', padding: '2px 8px', borderRadius: 10 }}>
                {totalPercentage > 100 ? `${(totalPercentage - 100).toFixed(1)}% over` : `${(100 - totalPercentage).toFixed(1)}% remaining`}
              </span>
            )}
            {Math.abs(totalPercentage - 100) <= 0.5 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: '#059669', background: '#f0fdf4', padding: '2px 8px', borderRadius: 10 }}>Ready to push</span>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {([
            { key: 'enabled' as CampaignFilter, label: 'Enabled', count: campaigns.filter(c => c.enabled).length },
            { key: 'paused' as CampaignFilter, label: 'Paused', count: campaigns.filter(c => !c.enabled).length },
            { key: 'all' as CampaignFilter, label: 'All', count: campaigns.length },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setCampaignFilter(tab.key)}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: campaignFilter === tab.key ? 600 : 400,
                background: campaignFilter === tab.key ? '#1e293b' : '#f1f5f9',
                color: campaignFilter === tab.key ? '#fff' : '#64748b',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Percentage bar */}
        <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(totalPercentage, 100)}%`,
            background: Math.abs(totalPercentage - 100) <= 0.5 ? '#059669' : totalPercentage > 100 ? '#dc2626' : '#2563eb',
            borderRadius: 3,
            transition: 'width 0.2s ease, background 0.2s ease',
          }} />
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {/* Table Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px 2.5fr 0.8fr 0.8fr 0.8fr 0.7fr 0.7fr', gap: 8, padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            <div></div>
            <div>Campaign</div>
            <div style={{ textAlign: 'right' }}>% Split</div>
            <div style={{ textAlign: 'right' }}>MTD Spend</div>
            <div style={{ textAlign: 'right' }}>New Daily</div>
            <div style={{ textAlign: 'right' }}>Avg CPC</div>
            <div style={{ textAlign: 'right' }}>Conv.</div>
          </div>

          {(() => {
            // Sort campaigns by conversions (highest first), tiebreaker by spend
            // (highest first). Campaigns with the same conversions and spend
            // fall back to alphabetical order so the list stays stable.
            const filtered = campaigns
              .filter(c =>
                campaignFilter === 'all' ? true :
                campaignFilter === 'enabled' ? c.enabled :
                !c.enabled
              )
              .slice()
              .sort((a, b) => {
                const convDiff = (b.conversions || 0) - (a.conversions || 0);
                if (convDiff !== 0) return convDiff;
                const spendA = a.mtdSpend ?? a.spend ?? 0;
                const spendB = b.mtdSpend ?? b.spend ?? 0;
                const spendDiff = spendB - spendA;
                if (spendDiff !== 0) return spendDiff;
                return a.campaignName.localeCompare(b.campaignName);
              });
            if (filtered.length === 0) {
              return (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b' }}>
                  {loading ? 'Loading...' :
                    campaigns.length === 0 ? <>No campaigns found. <button onClick={handleSync} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>Click here to sync from Google Ads.</button></> :
                    campaignFilter === 'enabled' ? 'No enabled campaigns. Switch to "All" or "Paused" to enable campaigns.' :
                    'No paused campaigns.'}
                </div>
              );
            }
            return filtered.map((campaign, index) => {
              const isEditing = editingCampaign === campaign.campaignId && editField === 'percentage';
              const isEditingStrategy = editingCampaign === campaign.campaignId && editField === 'bidStrategy';
              const isExpanded = expandedCampaign === campaign.campaignId;
              const budgetDiff = campaign.actualDailyBudget ? campaign.calculatedDailyBudget - campaign.actualDailyBudget : null;

              return (
                <div key={campaign.campaignId} style={{ borderBottom: index < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '36px 2.5fr 0.8fr 0.8fr 0.8fr 0.7fr 0.7fr', gap: 8, padding: '12px 16px', alignItems: 'center', cursor: 'pointer', background: isExpanded ? '#f8fafc' : !campaign.enabled ? '#fafafa' : 'transparent', opacity: campaign.enabled ? 1 : 0.5 }}
                    onClick={() => setExpandedCampaign(isExpanded ? null : campaign.campaignId)}
                  >
                    {/* Toggle */}
                    <div onClick={(e) => { e.stopPropagation(); handleToggleCampaign(campaign.campaignId); }} style={{ cursor: 'pointer' }}>
                      <div style={{
                        width: 32, height: 18, borderRadius: 9, position: 'relative',
                        background: campaign.enabled ? '#059669' : '#d1d5db',
                        transition: 'background 0.2s',
                      }}>
                        <div style={{
                          width: 14, height: 14, borderRadius: 7, background: '#fff',
                          position: 'absolute', top: 2,
                          left: campaign.enabled ? 16 : 2,
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }} />
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div title={campaign.campaignName} style={{ fontWeight: 500, color: campaign.enabled ? '#1e293b' : '#94a3b8', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.3 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', marginTop: 3, flexShrink: 0 }}>▶</span>
                        <span style={{ wordBreak: 'break-word' }}>{campaign.campaignName}</span>
                      </div>
                      {budgetDiff !== null && Math.abs(budgetDiff) > 0.01 && (
                        <div style={{ fontSize: 10, color: '#d97706', marginLeft: 16 }}>
                          {budgetDiff > 0 ? '↑' : '↓'} ${Math.abs(budgetDiff).toFixed(2)}/day vs current
                        </div>
                      )}
                    </div>

                    {/* % Split */}
                    <div style={{ textAlign: 'right' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={() => handleBlurSave(campaign.campaignId, 'percentage', editValue)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ width: 60, padding: '4px 8px', fontSize: 13, border: '1px solid #2563eb', borderRadius: 4, textAlign: 'right' }} autoFocus min={0} max={100} step={0.5} />
                          <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                        </div>
                      ) : (
                        <div onClick={(e) => { e.stopPropagation(); startEditPercentage(campaign); }} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }} onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ fontWeight: 600, color: '#2563eb' }}>{campaign.budgetPercentage.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>

                    {/* MTD Spend */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#d97706', fontWeight: 500 }}>${(campaign.mtdSpend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>

                    {/* New Daily Budget */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>${campaign.calculatedDailyBudget.toFixed(2)}</span>
                    </div>

                    {/* Avg CPC */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>${(campaign.avgCpc || 0).toFixed(2)}</span>
                    </div>

                    {/* Conversions */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#6366f1' }}>{(campaign.conversions || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '12px 16px 16px 38px', background: '#fafafa', borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Monthly Share</div>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>${(monthlyTotal * campaign.budgetPercentage / 100).toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>MTD Spend</div>
                          <div style={{ fontWeight: 600, color: '#d97706' }}>${(campaign.mtdSpend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Adj. Daily Budget</div>
                          <div style={{ fontWeight: 600, color: '#2563eb' }}>${campaign.calculatedDailyBudget.toFixed(2)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Impressions</div>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{(campaign.impressions || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Clicks</div>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{(campaign.clicks || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Bid Strategy</div>
                          <div onClick={(e) => { e.stopPropagation(); startEditBidStrategy(campaign); }} style={{ fontWeight: 600, color: '#1e293b', fontSize: 12, cursor: 'pointer' }}>
                            {isEditingStrategy ? (
                              <select value={editValue} onChange={(e) => { setEditValue(e.target.value); handleBlurSave(campaign.campaignId, 'bidStrategy', e.target.value); }} onClick={(e) => e.stopPropagation()} onBlur={() => handleBlurSave(campaign.campaignId, 'bidStrategy', editValue)} style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #2563eb', borderRadius: 4 }} autoFocus>
                                {BID_STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            ) : (
                              BID_STRATEGIES.find((s) => s.value === campaign.bidStrategy)?.label || campaign.bidStrategy
                            )}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Last Pushed</div>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 12 }}>{campaign.lastPushedAt ? new Date(campaign.lastPushedAt).toLocaleDateString() : 'Never'}</div>
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowEmailModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 760, maxHeight: '85vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>Email Report Preview</h2>
              <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', padding: 4 }}>x</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
              <button
                onClick={() => setEmailViewMode('thisMonth')}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  borderBottom: emailViewMode === 'thisMonth' ? '2px solid #2563eb' : '2px solid transparent',
                  color: emailViewMode === 'thisMonth' ? '#2563eb' : '#64748b',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                This Month (MTD)
              </button>
              <button
                onClick={() => setEmailViewMode('lastMonth')}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  borderBottom: emailViewMode === 'lastMonth' ? '2px solid #2563eb' : '2px solid transparent',
                  color: emailViewMode === 'lastMonth' ? '#2563eb' : '#64748b',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                Last Month Recap
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              Click "Copy for Gmail" then paste directly into a Gmail compose window. The formatting will be preserved.
            </p>

            {emailViewMode === 'thisMonth' && (
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16, maxHeight: 480, overflow: 'auto' }}
                dangerouslySetInnerHTML={{ __html: generateEmailHtml(businessName, new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), monthlySpend, campaigns, monthlyTotal, clientSlug, clientPin) }}
              />
            )}

            {emailViewMode === 'lastMonth' && (
              <>
                {loadingRecap && (
                  <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                    Loading last month's data from Google Ads...
                  </div>
                )}
                {recapError && (
                  <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Failed to load recap</div>
                    <div>{recapError}</div>
                    <button onClick={fetchLastMonthRecap} style={{ marginTop: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer' }}>Retry</button>
                  </div>
                )}
                {lastMonthRecap && !loadingRecap && (
                  <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16, maxHeight: 480, overflow: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: generateLastMonthEmailHtml(businessName, lastMonthRecap, clientSlug, clientPin) }}
                  />
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEmailModal(false)} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 500, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>Close</button>
              <button
                onClick={copyEmailToClipboard}
                disabled={emailViewMode === 'lastMonth' && (!lastMonthRecap || loadingRecap)}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: emailViewMode === 'lastMonth' && (!lastMonthRecap || loadingRecap) ? '#9ca3af' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: emailViewMode === 'lastMonth' && (!lastMonthRecap || loadingRecap) ? 'not-allowed' : 'pointer' }}
              >
                {emailCopied ? 'Copied!' : 'Copy for Gmail'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GoogleAdsBudgetManagement = ({ auditId }: GoogleAdsBudgetManagementProps = {}) => {
  const [renderError, setRenderError] = useState<string | null>(null);

  if (renderError) {
    return <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>Budget Management error: {renderError}</div>;
  }

  try {
    return <GoogleAdsBudgetManagementInner auditId={auditId} />;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!renderError) setRenderError(msg);
    return <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>Budget Management error: {msg}</div>;
  }
};

export default GoogleAdsBudgetManagement;
export { GoogleAdsBudgetManagement };
export type { GoogleAdsBudgetManagementProps };
