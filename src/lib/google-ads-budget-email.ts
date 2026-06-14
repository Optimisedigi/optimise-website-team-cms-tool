/**
 * Pure email-HTML generators for Google Ads budget management.
 *
 * Extracted verbatim from src/components/GoogleAdsBudgetManagement.tsx so that
 * both the admin UI's "Copy for Gmail" button and the OptiMate
 * `get_budget_management_email` tool produce byte-identical output.
 *
 * NO React, NO Payload, NO browser-only globals — pure TS.
 */

export interface BudgetCampaign {
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
  standalone?: boolean;
  standaloneBudget?: number;
  standaloneStartDate?: string | null;
  standaloneEndDate?: string | null;
  /**
   * Search Impression Share (0–1). Share of impressions actually served vs.
   * eligible. Sourced from Google Ads `metrics.search_impression_share`.
   * Optional — only populated when Growth Tools returns it (Search/Shopping
   * campaigns; Performance Max / video campaigns won't have it).
   */
  searchImpressionShare?: number;
  /**
   * Search Budget Lost IS (0–1). Share of impressions lost specifically due
   * to insufficient budget. The Budget Management UI surfaces a
   * "Limited by budget" badge whenever this value is meaningful (≥0.10).
   * Sourced from `metrics.search_budget_lost_impression_share`.
   */
  searchBudgetLostIS?: number;
  /** Last-60-days allocation recommendation for the budget table. */
  recommendationAction?: 'increase' | 'decrease' | 'hold';
  /** Positive means under-allocated vs performance, negative means over-allocated. */
  recommendationScore?: number;
  /** Human-readable reason for the recommendation action. */
  recommendationReason?: string;
  recommendationCpaLast60?: number | null;
  recommendationConversionsLast60?: number;
  /**
   * Advisory recommended daily budget from the monthly recommendation engine
   * (last month's conversions / CPA / spend). Read-only — never auto-applied
   * or auto-pushed. Populated by /api/google-ads-budgets/monthly-recommendations.
   */
  recommendedDailyBudget?: number;
  /** ISO timestamp the recommendation was generated. */
  recommendationGeneratedAt?: string | null;
}

export interface MonthlySpend {
  totalSpend: number;
  dailyBudget: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyBurnRate: number;
  remainingBudget: number;
  maxBudget: number;
}

function formatWholeCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export interface SearchTermRow {
  searchTerm: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionsByAction?: Record<string, number>;
  conversionsByCategory?: Record<string, number>;
}

export interface LastMonthRecap {
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
  conversionCategories?: Array<{ label: string; color: string }>;
}

// Get current month info
export function getMonthInfo(): { daysInMonth: number; daysElapsed: number; daysRemaining: number } {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysRemaining = Math.max(1, daysInMonth - daysElapsed); // min 1 to avoid division by zero
  return { daysInMonth, daysElapsed, daysRemaining };
}

// Get actual MTD spend from campaign data (from Google Ads THIS_MONTH query)
// Standalone campaigns have their own budget pool and are excluded by default.
export function getTotalMtdSpend(campaigns: BudgetCampaign[]): number {
  return campaigns.reduce((sum, c) => (c.standalone ? sum : sum + (c.mtdSpend || 0)), 0);
}

// Daily budget for a standalone campaign:
// (standaloneTotalBudget - mtdSpend) / daysRemainingInRange
export function calculateStandaloneDailyBudget(c: BudgetCampaign): number {
  if (!c.standalone || !c.standaloneBudget || !c.standaloneStartDate || !c.standaloneEndDate) return 0;
  const today = new Date();
  const start = new Date(c.standaloneStartDate);
  const end = new Date(c.standaloneEndDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const effStart = today > start ? today : start;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.max(1, Math.ceil((end.getTime() - effStart.getTime()) / msPerDay) + 1);
  const remaining = Math.max(0, c.standaloneBudget - (c.mtdSpend || 0));
  return remaining / daysRemaining;
}

// Format Cost / Conversion: $X.XX (<100) or $X (>=100); em dash when no conversions.
export function formatCostPerConv(mtdSpend: number, conversions: number): string {
  if (!conversions || conversions <= 0) return '\u2014';
  const cpc = mtdSpend / conversions;
  if (!Number.isFinite(cpc) || cpc <= 0) return '\u2014';
  return cpc < 100 ? `$${cpc.toFixed(2)}` : `$${Math.round(cpc)}`;
}

// Calculate smart daily budget for a campaign based on remaining budget and days
export function calculateSmartDailyBudget(
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
export function calculateMonthlySpend(campaigns: BudgetCampaign[], monthlyBudget: number): MonthlySpend {
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
export function generateBudgetEmailHtml(
  businessName: string,
  month: string,
  spend: MonthlySpend,
  campaigns: BudgetCampaign[],
  monthlyBudget: number,
  clientSlug?: string,
  clientPin?: string
): string {
  const percentUsed = spend.maxBudget > 0 ? (spend.totalSpend / spend.maxBudget) * 100 : 0;
  const { daysInMonth } = getMonthInfo();
  const onTrackPercent = (spend.daysElapsed / daysInMonth) * 100;
  const expectedSpendToDate = spend.maxBudget * (spend.daysElapsed / daysInMonth);
  const spendPacingDelta = spend.totalSpend - expectedSpendToDate;
  const pacingPercentDelta = spend.maxBudget > 0 ? (spendPacingDelta / spend.maxBudget) * 100 : 0;
  const absPacingDelta = Math.abs(spendPacingDelta);
  const isBehindPace = spendPacingDelta < -1;
  const isAheadOfPace = spendPacingDelta > 1;
  const isOverBudget = percentUsed > 100;
  const isSlightlyOver = percentUsed > 90 && percentUsed <= 100;
  const statusColor = isOverBudget ? '#dc2626' : isSlightlyOver || isAheadOfPace ? '#d97706' : isBehindPace ? '#059669' : '#2563eb';
  const statusBg = isOverBudget ? '#fef2f2' : isSlightlyOver || isAheadOfPace ? '#fffbeb' : isBehindPace ? '#f0fdf4' : '#eff6ff';
  const statusText = isOverBudget ? 'Over Budget' : isAheadOfPace ? 'Ahead of Pace' : isBehindPace ? 'Under Budget' : 'On Track';
  const pacingContext = isBehindPace
    ? `Behind expected pace by ${formatWholeCurrency(absPacingDelta)}`
    : isAheadOfPace
      ? `Ahead of expected pace by ${formatWholeCurrency(absPacingDelta)}`
      : 'Within $1 of expected spend-to-date';
  // Show enabled campaigns that either have a non-zero % split OR are standalone
  // (standalone always have % = 0 but still need to appear in the report).
  const enabledCampaigns = campaigns
    .filter(c => c.enabled && (c.standalone || c.budgetPercentage > 0))
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0));

  const campaignRows = enabledCampaigns.map(c => {
    const mtd = c.mtdSpend || 0;
    const splitCell = c.standalone ? 'Standalone' : `${c.budgetPercentage}%`;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${c.campaignName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${splitCell}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">$${c.calculatedDailyBudget.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600">$${mtd.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${(c.impressions || 0).toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${(c.clicks || 0).toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">$${(c.avgCpc || 0).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.conversions || 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${formatCostPerConv(mtd, c.conversions || 0)}</td>
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
              <td style="text-align:left;font-size:14px;font-weight:600;color:#374151">${statusText}<div style="margin-top:2px;font-size:12px;color:${statusColor};font-weight:600">${pacingContext}</div></td>
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
          <div style="font-size:10px;color:#94a3b8;text-align:center">Vertical line shows target spend to date: ${formatWholeCurrency(expectedSpendToDate)} (${onTrackPercent.toFixed(0)}% of month). Actual is ${Math.abs(pacingPercentDelta).toFixed(0)}% ${spendPacingDelta < 0 ? 'behind' : spendPacingDelta > 0 ? 'ahead of' : 'on'} pace.</div>
          <!-- Budget-to-date stats -->
          <table style="width:100%;border-collapse:collapse;margin-top:12px">
            <tr>
              <td style="text-align:center;width:50%;padding-bottom:8px">
                <div style="font-size:18px;font-weight:700;color:${statusColor}">${formatWholeCurrency(spend.totalSpend)}</div>
                <div style="font-size:11px;color:#64748b">Actual spend</div>
              </td>
              <td style="text-align:center;width:50%;padding-bottom:8px">
                <div style="font-size:18px;font-weight:700;color:#1e293b">${formatWholeCurrency(expectedSpendToDate)}</div>
                <div style="font-size:11px;color:#64748b">Target spend to date</div>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;width:50%">
                <div style="font-size:16px;font-weight:700;color:${statusColor}">${spendPacingDelta < 0 ? '-' : '+'}${formatWholeCurrency(absPacingDelta)}</div>
                <div style="font-size:11px;color:#64748b">Pacing difference</div>
              </td>
              <td style="text-align:center;width:50%">
                <div style="font-size:16px;font-weight:700;color:#64748b">${formatWholeCurrency(spend.remainingBudget)}</div>
                <div style="font-size:11px;color:#64748b">Remaining</div>
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
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb">Cost / Conv</th>
    </tr>
    ${campaignRows}
  </table>

  ${dashboardUrl ? `<p style="font-size:13px;color:#64748b;margin:0"><a href="${dashboardUrl}" style="color:#2563eb;text-decoration:none;font-weight:500">View live dashboard</a>${clientPin ? ` — PIN: ${clientPin}` : ''}</p>` : ''}
</div>`;
}

function searchTermRows(
  rows: SearchTermRow[],
  metricKey: 'clicks' | 'conversions' | 'cost',
  categories?: Array<{ label: string; color: string }>,
): string {
  // For the "By Conversions" table, show one extra column per configured
  // category so each row breaks the conversion total down by Phone Calls /
  // Form Submits / etc. Only render those columns when at least one row
  // actually has per-category data — otherwise the columns would just be
  // a row of em dashes.
  const showCategoryCols =
    metricKey === 'conversions' &&
    Array.isArray(categories) &&
    categories.length > 0 &&
    rows.some((r) => r.conversionsByCategory && Object.keys(r.conversionsByCategory).length > 0);
  const totalCols = 4 + (showCategoryCols ? categories!.length : 0);

  if (rows.length === 0) {
    return `<tr><td colspan="${totalCols}" style="padding:12px;font-size:12px;color:#94a3b8;text-align:center;border-bottom:1px solid #e5e7eb">No data available</td></tr>`;
  }
  return rows.map((r, i) => {
    const metricVal = metricKey === 'cost'
      ? `$${r.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : r[metricKey].toLocaleString();
    const categoryCells = showCategoryCols
      ? (categories || []).map((c) => {
          const n = r.conversionsByCategory?.[c.label] ?? 0;
          const display = n > 0 ? Math.round(n).toLocaleString() : '—';
          return `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;color:#94a3b8">${display}</td>`;
        }).join('')
      : '';
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b">${i + 1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${r.searchTerm}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b">${r.campaignName || '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">${metricVal}</td>
      ${categoryCells}
    </tr>`;
  }).join('');
}

export function generateLastMonthRecapEmailHtml(
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
        ${(recap.conversionCategories || []).map((c) => `<th style=\"padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;border-bottom:2px solid #e5e7eb\">${c.label}</th>`).join('')}
      </tr>
      ${searchTermRows(recap.topByConversions, 'conversions', recap.conversionCategories)}
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
