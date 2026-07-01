'use client';

import { useState, useCallback, useEffect, useMemo, useRef, type ClipboardEvent } from 'react';
import { useDocumentInfo } from '@payloadcms/ui';
import {
  generateBudgetEmailHtml,
  generateLastMonthRecapEmailHtml,
  calculateMonthlySpend,
  calculateSmartDailyBudget,
  calculateStandaloneDailyBudget,
  getMonthInfo,
  getTotalMtdSpend,
  formatCostPerConv,
  shouldShowBudgetCampaign,
  isBudgetAllocationCampaign,
  isBudgetPushEligible,
  type BudgetCampaign,
  type MonthlySpend,
  type LastMonthRecap,
} from '@/lib/google-ads-budget-email';
import { canPushGoogleAdsBudget } from '@/lib/google-ads-budget-push';

type CampaignFilter = 'enabled' | 'paused' | 'all';
type BudgetMetricsRange = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_60_DAYS' | 'LAST_180_DAYS';

type AnnualBudgetMonthKey = 'jul' | 'aug' | 'sep' | 'oct' | 'nov' | 'dec' | 'jan' | 'feb' | 'mar' | 'apr' | 'may' | 'jun';

interface AnnualBudgetPlaceholderRow {
  id: string;
  label: string;
  values: Record<AnnualBudgetMonthKey, number | ''>;
}

interface AnnualBudgetPlaceholderData {
  rows: AnnualBudgetPlaceholderRow[];
  actualTotals: Record<AnnualBudgetMonthKey, number | ''>;
}

const ANNUAL_BUDGET_MONTHS: Array<{ key: AnnualBudgetMonthKey; label: string }> = [
  { key: 'jul', label: 'Jul' },
  { key: 'aug', label: 'Aug' },
  { key: 'sep', label: 'Sep' },
  { key: 'oct', label: 'Oct' },
  { key: 'nov', label: 'Nov' },
  { key: 'dec', label: 'Dec' },
  { key: 'jan', label: 'Jan' },
  { key: 'feb', label: 'Feb' },
  { key: 'mar', label: 'Mar' },
  { key: 'apr', label: 'Apr' },
  { key: 'may', label: 'May' },
  { key: 'jun', label: 'Jun' },
];

const emptyAnnualBudgetValues = (): Record<AnnualBudgetMonthKey, number | ''> =>
  ANNUAL_BUDGET_MONTHS.reduce((acc, month) => {
    acc[month.key] = '';
    return acc;
  }, {} as Record<AnnualBudgetMonthKey, number | ''>);

function currentAnnualBudgetMonthKey(): AnnualBudgetMonthKey {
  const monthIndex = new Date().getMonth();
  return ANNUAL_BUDGET_MONTHS[monthIndex >= 6 ? monthIndex - 6 : monthIndex + 6].key;
}

const createAnnualBudgetRow = (label = 'Budget'): AnnualBudgetPlaceholderRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  label,
  values: emptyAnnualBudgetValues(),
});

function parseBudgetCell(value: string): number | '' {
  const cleaned = value.replace(/[$,\s]/g, '');
  if (cleaned === '') return '';
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : '';
}

function formatBudgetCell(value: number | ''): string {
  return typeof value === 'number' ? value.toLocaleString() : '';
}

function annualBudgetRowTotal(row: AnnualBudgetPlaceholderRow): number {
  return ANNUAL_BUDGET_MONTHS.reduce((sum, month) => sum + (Number(row.values[month.key]) || 0), 0);
}

function formatBudgetDiscrepancyPercent(actual: number | '', planned: number): string {
  if (!planned || actual === '') return '—';
  const percent = ((Number(actual) - planned) / planned) * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function normalizeAnnualBudgetRows(value: unknown): AnnualBudgetPlaceholderRow[] {
  const rawRows = Array.isArray(value) ? value : Array.isArray((value as any)?.rows) ? (value as any).rows : [];
  if (rawRows.length === 0) return [createAnnualBudgetRow()];
  return rawRows.map((row: any, index: number) => ({
    id: typeof row?.id === 'string' ? row.id : `saved-${index}`,
    label: typeof row?.label === 'string' && row.label.trim() ? row.label : `Budget ${index + 1}`,
    values: ANNUAL_BUDGET_MONTHS.reduce((acc, month) => {
      const cell = row?.values?.[month.key];
      acc[month.key] = typeof cell === 'number' ? cell : parseBudgetCell(String(cell ?? ''));
      return acc;
    }, {} as Record<AnnualBudgetMonthKey, number | ''>),
  }));
}

function normalizeAnnualBudgetActualTotals(value: unknown): Record<AnnualBudgetMonthKey, number | ''> {
  const rawActuals = (value as any)?.actualTotals;
  return ANNUAL_BUDGET_MONTHS.reduce((acc, month) => {
    const cell = rawActuals?.[month.key];
    acc[month.key] = typeof cell === 'number' ? cell : parseBudgetCell(String(cell ?? ''));
    return acc;
  }, emptyAnnualBudgetValues());
}

/** Shape returned by /api/google-ads-budgets/[id]/ad-groups. Kept in sync
 *  with the AdGroupRow type in that route handler. */
interface AdGroupRow {
  adGroupId: string;
  adGroupName: string;
  status?: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  conversions: number;
  cost: number;
  searchImpressionShare?: number;
  searchBudgetLostIS?: number;
}

/** Minimum Search Budget Lost IS at which we surface the
 *  "Limited by budget" badge. 10% is the threshold the Google Ads UI itself
 *  uses for its column highlighting — below that, daily noise dominates. */
const LIMITED_BY_BUDGET_THRESHOLD = 0.1;
const BUDGET_TABLE_MIN_WIDTH = 1280;

function getCampaignColumnWidth(campaigns: BudgetCampaign[]): string {
  const longest = campaigns.reduce((max, c) => Math.max(max, c.campaignName.length), 0);
  // Approximate width: ~7.5px per character at 13px font, plus padding/gap
  const width = Math.max(300, Math.min(800, longest * 7.5 + 40));
  return `${width}px`;
}

function formatPercentMetric(value: number | undefined): string {
  return typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : '—';
}

function selectedRangeSpend(campaign: BudgetCampaign, range: BudgetMetricsRange): number {
  return range === 'THIS_MONTH' ? campaign.mtdSpend || 0 : campaign.displayMtdSpend ?? campaign.mtdSpend ?? 0;
}

function isBudgetIncludedCampaign(campaign: BudgetCampaign): boolean {
  return shouldShowBudgetCampaign(campaign);
}

function budgetRestrictionLabel(searchBudgetLostIS: number | undefined): { label: string; color: string; background: string; border: string } {
  if (typeof searchBudgetLostIS !== 'number') {
    return { label: 'Unknown', color: '#64748b', background: '#f8fafc', border: '#e2e8f0' };
  }
  if (searchBudgetLostIS >= LIMITED_BY_BUDGET_THRESHOLD) {
    return { label: 'Restricted', color: '#b45309', background: '#fef3c7', border: '#fde68a' };
  }
  return { label: 'Not restricted', color: '#166534', background: '#f0fdf4', border: '#bbf7d0' };
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
  const [actionItems, setActionItems] = useState<Array<{
    id: string;
    severity: 'good' | 'warning' | 'critical';
    title: string;
    body: string;
  }>>([]);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('enabled');
  const [metricsRange, setMetricsRange] = useState<BudgetMetricsRange>('THIS_MONTH');
  // "Show ad groups" toggle. Per spec, toggling on does NOT auto-expand any
  // campaign; it just enables the ad-group sub-table inside each campaign's
  // expanded panel. Ad groups are fetched lazily on first expand and cached.
  const [showAdGroups, setShowAdGroups] = useState(false);
  const [adGroupsByCampaign, setAdGroupsByCampaign] = useState<
    Record<string, AdGroupRow[]>
  >({});
  const [adGroupsLoading, setAdGroupsLoading] = useState<Record<string, boolean>>({});
  const [adGroupsError, setAdGroupsError] = useState<Record<string, string | null>>({});
  const [adGroupsWarning, setAdGroupsWarning] = useState<Record<string, string | null>>({});
  const [businessName, setBusinessName] = useState('Client');
  const [clientSlug, setClientSlug] = useState('');
  const [clientPin, setClientPin] = useState('');
  const [annualBudgetRows, setAnnualBudgetRows] = useState<AnnualBudgetPlaceholderRow[]>(() => [createAnnualBudgetRow()]);
  const [annualBudgetActualTotals, setAnnualBudgetActualTotals] = useState<Record<AnnualBudgetMonthKey, number | ''>>(() => emptyAnnualBudgetValues());
  const [annualBudgetSaving, setAnnualBudgetSaving] = useState(false);
  const [annualBudgetSaved, setAnnualBudgetSaved] = useState(false);
  const [annualBudgetPlaceholdersLoaded, setAnnualBudgetPlaceholdersLoaded] = useState(false);
  const [annualBudgetFocusedCell, setAnnualBudgetFocusedCell] = useState<{ rowIndex: number; columnIndex: number }>({ rowIndex: 0, columnIndex: 0 });
  const [annualBudgetDeleteConfirmRow, setAnnualBudgetDeleteConfirmRow] = useState<number | null>(null);
  const [recommendationTooltip, setRecommendationTooltip] = useState<{
    campaignId: string;
    x: number;
    y: number;
    lines: string[];
  } | null>(null);
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
        setAnnualBudgetRows(normalizeAnnualBudgetRows(data?.annualBudgetPlaceholders));
        setAnnualBudgetActualTotals(normalizeAnnualBudgetActualTotals(data?.annualBudgetPlaceholders));
        setAnnualBudgetPlaceholdersLoaded(true);
      })
      .catch(() => {});
  }, [id]);

  // Recalculate daily budgets: (monthly - MTD spend) × campaign % / days remaining.
  // Standalone campaigns are computed independently from their own budget pool.
  const recalculateBudgets = useCallback((budgetCampaigns: BudgetCampaign[], budget: number): BudgetCampaign[] => {
    const { daysRemaining } = getMonthInfo();
    const totalMtd = getTotalMtdSpend(budgetCampaigns);

    return budgetCampaigns.map(c => {
      if (c.standalone) {
        return { ...c, calculatedDailyBudget: calculateStandaloneDailyBudget(c) };
      }
      return {
        ...c,
        calculatedDailyBudget: budget > 0
          ? calculateSmartDailyBudget(budget, c.budgetPercentage, totalMtd, daysRemaining)
          : 0,
      };
    });
  }, []);

  // Lazy-fetch ad groups for a single campaign. Cached per campaignId so
  // re-expanding doesn't re-hit Growth Tools. Called only when the user
  // expands a campaign AND the "Show ad groups" toggle is on.
  const fetchAdGroups = useCallback(async (campaignId: string) => {
    if (!id) return;
    if (adGroupsByCampaign[campaignId] || adGroupsLoading[campaignId]) return;
    setAdGroupsLoading(prev => ({ ...prev, [campaignId]: true }));
    setAdGroupsError(prev => ({ ...prev, [campaignId]: null }));
    setAdGroupsWarning(prev => ({ ...prev, [campaignId]: null }));
    try {
      const res = await fetch(
        `/api/google-ads-budgets/${id}/ad-groups?campaignId=${encodeURIComponent(campaignId)}`,
        { credentials: 'include' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load ad groups (${res.status})`);
      }
      setAdGroupsByCampaign(prev => ({
        ...prev,
        [campaignId]: Array.isArray(data?.adGroups) ? data.adGroups : [],
      }));
      if (data?.warning) {
        setAdGroupsWarning(prev => ({ ...prev, [campaignId]: data.warning }));
      }
    } catch (err: any) {
      setAdGroupsError(prev => ({
        ...prev,
        [campaignId]: err?.message || 'Failed to load ad groups',
      }));
    } finally {
      setAdGroupsLoading(prev => ({ ...prev, [campaignId]: false }));
    }
  }, [id, adGroupsByCampaign, adGroupsLoading]);

  // Fetch metrics for display only (LAST_MONTH / LAST_60_DAYS / LAST_180_DAYS). Does NOT
  // update monthlyTotal, daily budgets, or the budget tracker — only refreshes
  // campaign metrics (cost, impressions, clicks, conversions, etc.) for the table.
  const fetchMetricsForDisplay = useCallback(async (range: BudgetMetricsRange) => {
    if (!id || range === 'THIS_MONTH') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/google-ads-budgets/${id}/list?range=${range}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      const freshCampaigns: BudgetCampaign[] = (data.campaigns || []).map((c: any) => ({
        ...c,
        enabled: c.enabled !== undefined ? c.enabled : true,
        budgetPercentage: c.budgetPercentage ?? 0,
      }));
      // Preserve existing calculatedDailyBudget and budgetPercentage so the
      // budget tracker stays unchanged. Only overlay the new metrics.
      setCampaigns(prev =>
        prev.map(old => {
          const updated = freshCampaigns.find((f: BudgetCampaign) => f.campaignId === old.campaignId);
          if (!updated) return old;
          return {
            ...old,
            impressions: updated.impressions,
            clicks: updated.clicks,
            avgCpc: updated.avgCpc,
            conversions: updated.conversions,
            displayMtdSpend: updated.mtdSpend,
            searchImpressionShare: updated.searchImpressionShare,
            searchBudgetLostIS: updated.searchBudgetLostIS,
            recommendedDailyBudget: updated.recommendedDailyBudget,
            recommendationAction: updated.recommendationAction,
            recommendationScore: updated.recommendationScore,
            recommendationReason: updated.recommendationReason,
            recommendationCpaLast60: updated.recommendationCpaLast60,
            recommendationConversionsLast60: updated.recommendationConversionsLast60,
            recommendationGeneratedAt: updated.recommendationGeneratedAt,
          };
        })
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
            campaignStartDate: c.campaignStartDate ?? null,
            campaignEndDate: c.campaignEndDate ?? null,
            standalone: c.standalone ?? false,
            standaloneBudget: c.standaloneBudget ?? 0,
            standaloneStartDate: c.standaloneStartDate ?? null,
            standaloneEndDate: c.standaloneEndDate ?? null,
            searchImpressionShare: c.searchImpressionShare ?? undefined,
            searchBudgetLostIS: c.searchBudgetLostIS ?? undefined,
            recommendedDailyBudget: c.recommendedDailyBudget ?? undefined,
            recommendationAction: c.recommendationAction ?? 'hold',
            recommendationScore: c.recommendationScore ?? 0,
            recommendationReason: c.recommendationReason ?? null,
            recommendationCpaLast60: c.recommendationCpaLast60 ?? null,
            recommendationConversionsLast60: c.recommendationConversionsLast60 ?? 0,
            recommendationGeneratedAt: c.recommendationGeneratedAt ?? null,
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
      const res = await fetch(`/api/google-ads-budgets/${id}/list?range=${metricsRange}`, {
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
  }, [id, monthlyTotal, metricsRange, recalculateBudgets]);

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
            // Push enabled campaigns with a positive daily budget. Standalone
            // campaigns are included even though their % is 0 — they push their
            // standalone-derived daily budget.
            .filter(c => isBudgetPushEligible(c) && c.calculatedDailyBudget > 0 && (c.standalone || c.budgetPercentage > 0))
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
          standalone: campaign.standalone ?? false,
          standaloneBudget: campaign.standaloneBudget ?? 0,
          standaloneStartDate: campaign.standaloneStartDate ?? null,
          standaloneEndDate: campaign.standaloneEndDate ?? null,
        }],
      }),
    }).catch(() => {});
  }, [id]);

  // Apply a campaign's monthly recommendation into the editable % split. This
  // converts the recommended daily budget into a percentage of the monthly
  // total so it flows through the existing allocation maths. It never pushes
  // to Google Ads — the user still has to click Push afterwards.
  const applyRecommendation = useCallback((campaign: BudgetCampaign) => {
    if (typeof campaign.recommendedDailyBudget !== 'number') return;
    if (!monthlyTotal || monthlyTotal <= 0) {
      setError('Set a monthly budget total before applying a recommendation.');
      return;
    }
    const recommendedMonthly = campaign.recommendedDailyBudget * DAYS_IN_MONTH;
    const pct = Math.min(100, Math.max(0, (recommendedMonthly / monthlyTotal) * 100));
    const rounded = Math.round(pct * 2) / 2; // snap to 0.5% like the editor
    const updated = campaigns.map((c) =>
      c.campaignId === campaign.campaignId
        ? { ...c, standalone: false, budgetPercentage: rounded }
        : c,
    );
    const recalculated = recalculateBudgets(updated, monthlyTotal);
    setCampaigns(recalculated);
    const saved = recalculated.find((c) => c.campaignId === campaign.campaignId);
    if (saved) saveCampaignToCMS(saved);
    setSuccess(`Applied recommendation to ${campaign.campaignName}. Review and Push to send to Google Ads.`);
  }, [campaigns, monthlyTotal, recalculateBudgets, saveCampaignToCMS]);

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
    // Only balance enabled, non-standalone campaigns. Standalone keep % at 0.
    const targets = campaigns.filter(isBudgetAllocationCampaign);
    if (targets.length === 0) return;
    const equalPercentage = Math.round(10000 / targets.length) / 100;
    const remainder = 100 - (equalPercentage * targets.length);

    let firstAssigned = false;
    const balanced = campaigns.map(c => {
      if (!isBudgetPushEligible(c) || c.standalone) {
        return { ...c, budgetPercentage: c.standalone ? 0 : c.budgetPercentage };
      }
      const pct = !firstAssigned ? equalPercentage + remainder : equalPercentage;
      firstAssigned = true;
      return { ...c, budgetPercentage: pct };
    });

    setCampaigns(recalculateBudgets(balanced, monthlyTotal));
  }, [campaigns, monthlyTotal, recalculateBudgets]);

  // Toggle campaign enabled/paused — pausing sets % to 0, auto-saves to CMS.
  // Standalone campaigns can still be enabled/disabled; their % stays 0 either way.
  const handleToggleCampaign = useCallback((campaignId: string) => {
    setCampaigns(prev => {
      const updated = prev.map(c => {
        if (c.campaignId !== campaignId) return c;
        const nowEnabled = !c.enabled;
        const nextPct = c.standalone ? 0 : (nowEnabled ? c.budgetPercentage : 0);
        return { ...c, enabled: nowEnabled, budgetPercentage: nextPct };
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
            standalone: c.standalone ?? false,
            standaloneBudget: c.standaloneBudget ?? 0,
            standaloneStartDate: c.standaloneStartDate ?? null,
            standaloneEndDate: c.standaloneEndDate ?? null,
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
      const recapWithEdits = { ...lastMonthRecap, insights: actionItems };
      html = generateLastMonthRecapEmailHtml(businessName, recapWithEdits, clientSlug, clientPin);
      subject = `${businessName} - Google Ads Recap - ${lastMonthRecap.monthLabel}`;
    } else {
      const spend = calculateMonthlySpend(campaigns, monthlyTotal);
      const currentMonth = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      html = generateBudgetEmailHtml(businessName, currentMonth, spend, campaigns, monthlyTotal, clientSlug, clientPin);
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
  }, [campaigns, monthlyTotal, businessName, clientSlug, clientPin, emailViewMode, lastMonthRecap, actionItems]);

  // Auto-fetch recap when user switches to last-month tab
  useEffect(() => {
    if (showEmailModal && emailViewMode === 'lastMonth' && !lastMonthRecap && !loadingRecap) {
      fetchLastMonthRecap();
    }
  }, [showEmailModal, emailViewMode, lastMonthRecap, loadingRecap, fetchLastMonthRecap]);

  // Seed editable action items from the recap's auto-generated insights.
  // User edits are preserved across tab switches; refetching the recap
  // resets them.
  useEffect(() => {
    if (lastMonthRecap) {
      setActionItems(
        lastMonthRecap.insights.map((ins, i) => ({
          id: `auto-${i}-${Date.now()}`,
          severity: ins.severity,
          title: ins.title,
          body: ins.body,
        }))
      );
    }
  }, [lastMonthRecap]);

  const cycleSeverity = useCallback((id: string) => {
    setActionItems(items => items.map(it => {
      if (it.id !== id) return it;
      const next: 'good' | 'warning' | 'critical' =
        it.severity === 'good' ? 'warning' : it.severity === 'warning' ? 'critical' : 'good';
      return { ...it, severity: next };
    }));
  }, []);

  const updateActionItem = useCallback((id: string, patch: Partial<{ title: string; body: string }>) => {
    setActionItems(items => items.map(it => it.id === id ? { ...it, ...patch } : it));
  }, []);

  const deleteActionItem = useCallback((id: string) => {
    setActionItems(items => items.filter(it => it.id !== id));
  }, []);

  const moveActionItem = useCallback((id: string, direction: 'up' | 'down') => {
    setActionItems(items => {
      const idx = items.findIndex(it => it.id === id);
      if (idx === -1) return items;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= items.length) return items;
      const next = items.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const addActionItem = useCallback(() => {
    setActionItems(items => [
      ...items,
      {
        id: `custom-${Date.now()}`,
        severity: 'good',
        title: 'New action item',
        body: 'Describe the action.',
      },
    ]);
  }, []);

  useEffect(() => {
    if (id) {
      fetchCampaigns();
    }
    // Only run once on mount — do not re-fetch when monthlyTotal changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const rangeChangeLoaded = useRef(false);
  useEffect(() => {
    if (!id || !initialLoadDone.current) return;
    if (!rangeChangeLoaded.current) {
      rangeChangeLoaded.current = true;
      return;
    }
    if (metricsRange === 'THIS_MONTH') {
      setCampaigns(prev => prev.map(c => { const { displayMtdSpend, ...rest } = c; return rest as BudgetCampaign; }));
      syncFromGoogleAds();
    } else {
      fetchMetricsForDisplay(metricsRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, metricsRange]);

  const updateAnnualBudgetRowLabel = useCallback((rowIndex: number, label: string) => {
    setAnnualBudgetRows(rows => rows.map((row, index) => index === rowIndex ? { ...row, label } : row));
    setAnnualBudgetSaved(false);
  }, []);

  const updateAnnualBudgetCell = useCallback((rowIndex: number, monthKey: AnnualBudgetMonthKey, value: string) => {
    setAnnualBudgetRows(rows => rows.map((row, index) => (
      index === rowIndex
        ? { ...row, values: { ...row.values, [monthKey]: parseBudgetCell(value) } }
        : row
    )));
    setAnnualBudgetSaved(false);
  }, []);

  const addAnnualBudgetRow = useCallback(() => {
    setAnnualBudgetRows(rows => [...rows, createAnnualBudgetRow(`Budget ${rows.length + 1}`)]);
    setAnnualBudgetSaved(false);
  }, []);

  const removeAnnualBudgetRow = useCallback((rowIndex: number) => {
    setAnnualBudgetRows(rows => rows.length <= 1 ? rows : rows.filter((_, index) => index !== rowIndex));
    setAnnualBudgetDeleteConfirmRow(null);
    setAnnualBudgetSaved(false);
  }, []);

  const handleAnnualBudgetPaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();

    let pastedRows = text
      .trimEnd()
      .split(/\r?\n/)
      .map(row => row.split('\t'))
      .filter(row => row.some(cell => cell.trim() !== ''));

    if (pastedRows.length === 0) return;

    const firstRowLooksLikeMonthHeader = pastedRows[0].some(cell =>
      ANNUAL_BUDGET_MONTHS.some(month => month.label.toLowerCase() === cell.trim().toLowerCase())
    );
    if (firstRowLooksLikeMonthHeader) {
      pastedRows = pastedRows.slice(1);
    }
    if (pastedRows.length === 0) return;

    setAnnualBudgetRows(currentRows => {
      const nextRows = currentRows.map(row => ({ ...row, values: { ...row.values } }));
      const pasteHasLabels = pastedRows.some(row => row.length > 1 && parseBudgetCell(row[0]) === '' && row[0].trim() !== '');
      const startColumn = pasteHasLabels ? -1 : annualBudgetFocusedCell.columnIndex;

      pastedRows.forEach((pastedRow, pastedRowIndex) => {
        const targetRowIndex = annualBudgetFocusedCell.rowIndex + pastedRowIndex;
        while (nextRows.length <= targetRowIndex) {
          nextRows.push(createAnnualBudgetRow(`Budget ${nextRows.length + 1}`));
        }

        pastedRow.forEach((cell, pastedColumnIndex) => {
          const targetColumnIndex = startColumn + pastedColumnIndex;
          if (targetColumnIndex === -1) {
            const label = cell.trim();
            if (label) nextRows[targetRowIndex].label = label;
            return;
          }
          const month = ANNUAL_BUDGET_MONTHS[targetColumnIndex];
          if (!month) return;
          nextRows[targetRowIndex].values[month.key] = parseBudgetCell(cell);
        });
      });

      return nextRows;
    });
    setAnnualBudgetSaved(false);
  }, [annualBudgetFocusedCell]);

  const handleSaveAnnualBudgetPlaceholders = useCallback(async () => {
    if (!id) return;
    setAnnualBudgetSaving(true);
    setAnnualBudgetSaved(false);
    setError(null);
    try {
      const referenceBudgetData: AnnualBudgetPlaceholderData = {
        rows: annualBudgetRows,
        actualTotals: annualBudgetActualTotals,
      };
      const res = await fetch(`/api/google-ads-budgets/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ _saveAnnualBudgetPlaceholders: referenceBudgetData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      setAnnualBudgetSaved(true);
    } catch (e: any) {
      setError(e.message || 'Failed to save reference budget grid');
    } finally {
      setAnnualBudgetSaving(false);
    }
  }, [id, annualBudgetRows, annualBudgetActualTotals]);

  const annualBudgetColumnTotals = useMemo(() =>
    ANNUAL_BUDGET_MONTHS.reduce((acc, month) => {
      acc[month.key] = annualBudgetRows.reduce((sum, row) => sum + (Number(row.values[month.key]) || 0), 0);
      return acc;
    }, {} as Record<AnnualBudgetMonthKey, number>),
    [annualBudgetRows]
  );
  const annualBudgetGrandTotal = useMemo(
    () => ANNUAL_BUDGET_MONTHS.reduce((sum, month) => sum + annualBudgetColumnTotals[month.key], 0),
    [annualBudgetColumnTotals]
  );
  const annualBudgetActualGrandTotal = useMemo(
    () => ANNUAL_BUDGET_MONTHS.reduce((sum, month) => sum + (Number(annualBudgetActualTotals[month.key]) || 0), 0),
    [annualBudgetActualTotals]
  );

  const totalPercentage = useMemo(() =>
    campaigns.filter(isBudgetAllocationCampaign).reduce((sum, c) => sum + c.budgetPercentage, 0),
    [campaigns]
  );

  // Shared campaign column width so all rows align. Computed from the longest
  // campaign name in the current filtered set, capped between 300px and 800px.
  const campaignColumnWidth = useMemo(() => getCampaignColumnWidth(campaigns), [campaigns]);
  const gridTemplateColumns = useMemo(() => {
    const metrics = '46px 66px 76px 76px 68px 70px 58px 58px 52px 58px 72px 54px 62px';
    return `32px ${campaignColumnWidth} ${metrics}`;
  }, [campaignColumnWidth]);

  // Standalone campaigns sit in a separate budget pool. Surface a small subheading
  // under the Monthly Budget Total when any exist so the team understands the
  // monthly figure is the *non-standalone* pool.
  const standaloneCampaigns = useMemo(
    () => campaigns.filter(c => c.standalone),
    [campaigns]
  );
  const standaloneTotalBudget = useMemo(
    () => standaloneCampaigns.reduce((sum, c) => sum + (c.standaloneBudget || 0), 0),
    [standaloneCampaigns]
  );

  // Push allowed when at least one eligible campaign has a positive daily budget.
  // We intentionally allow allocations above 100% so teams can front-load spend
  // early in the month on campaigns that need more room to gain traction.
  const canPush = useMemo(
    () => canPushGoogleAdsBudget(campaigns, monthlyTotal),
    [campaigns, monthlyTotal]
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
  const currentAnnualMonthKey = useMemo(() => currentAnnualBudgetMonthKey(), []);

  useEffect(() => {
    const actualSpend = Math.round(monthlySpend.totalSpend);
    if (!id || !annualBudgetPlaceholdersLoaded || actualSpend <= 0 || annualBudgetActualTotals[currentAnnualMonthKey] !== '') return;

    const nextActualTotals = { ...annualBudgetActualTotals, [currentAnnualMonthKey]: actualSpend };
    setAnnualBudgetActualTotals(nextActualTotals);
    setAnnualBudgetSaved(false);

    const referenceBudgetData: AnnualBudgetPlaceholderData = {
      rows: annualBudgetRows,
      actualTotals: nextActualTotals,
    };
    fetch(`/api/google-ads-budgets/${id}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ _saveAnnualBudgetPlaceholders: referenceBudgetData }),
    })
      .then((res) => {
        if (res.ok) setAnnualBudgetSaved(true);
      })
      .catch(() => {});
  }, [id, annualBudgetPlaceholdersLoaded, annualBudgetRows, annualBudgetActualTotals, currentAnnualMonthKey, monthlySpend.totalSpend]);

  const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);
  const activeCampaignCount = campaigns.filter(isBudgetIncludedCampaign).length;

  // Progress bar calculations
  const percentUsed = monthlySpend.maxBudget > 0 
    ? Math.min(100, (monthlySpend.totalSpend / monthlySpend.maxBudget) * 100) 
    : 0;
  const percentRemaining = 100 - percentUsed;
  const monthInfo = getMonthInfo();
  const onTrackPercent = (monthlySpend.daysElapsed / monthInfo.daysInMonth) * 100;
  const expectedSpendToDate = monthlySpend.maxBudget * (monthlySpend.daysElapsed / monthInfo.daysInMonth);
  const spendPacingDelta = monthlySpend.totalSpend - expectedSpendToDate;
  const pacingPercentDelta = monthlySpend.maxBudget > 0 ? (spendPacingDelta / monthlySpend.maxBudget) * 100 : 0;
  const absPacingDelta = Math.abs(spendPacingDelta);
  const isBehindPace = spendPacingDelta < -1;
  const isAheadOfPace = spendPacingDelta > 1;

  // Determine status
  const isOverBudget = percentUsed > 100;
  const isSlightlyOver = percentUsed > 90 && percentUsed <= 100;
  const isUnderBudget = isBehindPace;
  const statusColor = isOverBudget ? '#dc2626' : isSlightlyOver || isAheadOfPace ? '#d97706' : isUnderBudget ? '#059669' : '#2563eb';
  const statusBg = isOverBudget ? '#fef2f2' : isSlightlyOver || isAheadOfPace ? '#fffbeb' : isUnderBudget ? '#f0fdf4' : '#eff6ff';
  const statusText = isOverBudget ? 'Over Budget' : isAheadOfPace ? 'Ahead of Pace' : isUnderBudget ? 'Under Budget' : 'On Track';
  const pacingContext = isBehindPace
    ? `Behind expected pace by $${absPacingDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : isAheadOfPace
      ? `Ahead of expected pace by $${absPacingDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : 'Within $1 of expected spend-to-date';

  const budgetPerDay = monthlySpend.daysRemaining > 0 ? monthlySpend.remainingBudget / monthlySpend.daysRemaining : 0;
  const budgetPerWeek = budgetPerDay * 7;

  return (
    <div className="od-google-ads-budget-management" style={{ padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            {standaloneCampaigns.length > 0 && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                Excludes {standaloneCampaigns.length} standalone campaign{standaloneCampaigns.length === 1 ? '' : 's'} — ${standaloneTotalBudget.toLocaleString()} total separate budget
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flex: '1 1 auto', minWidth: 0 }}>
            <button onClick={handleAutoBalance} disabled={campaigns.length === 0} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, cursor: campaigns.length === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
              Auto-Balance ({campaigns.length > 0 ? (100 / campaigns.length).toFixed(1) : '0'}% each)
            </button>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                disabled={pushing || campaigns.length === 0 || monthlyTotal <= 0 || !canPush}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: pushing ? '#6366f1' : canPush ? '#059669' : '#9ca3af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: pushing || campaigns.length === 0 || !canPush ? 'not-allowed' : 'pointer',
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
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{statusText}</span>
                  <div style={{ marginTop: 2, fontSize: 12, color: statusColor, fontWeight: 600 }}>
                    {pacingContext}
                  </div>
                </div>
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
                Vertical line shows expected spend-to-date: ${expectedSpendToDate.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({onTrackPercent.toFixed(0)}% of month). Actual is {Math.abs(pacingPercentDelta).toFixed(0)}% {spendPacingDelta < 0 ? 'behind' : spendPacingDelta > 0 ? 'ahead of' : 'on'} pace.
              </div>
              
              {/* Budget Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: statusColor }}>
                    ${monthlySpend.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Actual spend</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
                    ${expectedSpendToDate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Target spend to date</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: statusColor }}>
                    {spendPacingDelta < 0 ? '-' : '+'}${absPacingDelta.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Pacing difference</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#64748b' }}>
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
          { label: 'Added Campaigns', value: campaigns.filter(isBudgetIncludedCampaign).length, color: '#1e293b' },
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

      {/* Annual Client Budget Placeholders - CMS reference only */}
      <div style={{ marginBottom: 24, padding: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
              Annual Client Budget Placeholders
            </h3>
            <div style={{ marginTop: 3, fontSize: 12, color: '#64748b' }}>
              CMS-only reference grid. Paste from Excel; these values do not affect campaign allocation, budget maths, or Google Ads pushes.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={addAnnualBudgetRow}
              style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}
            >
              Add row
            </button>
            <button
              type="button"
              onClick={handleSaveAnnualBudgetPlaceholders}
              disabled={annualBudgetSaving}
              style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, background: annualBudgetSaving ? '#94a3b8' : annualBudgetSaved ? '#059669' : '#1e293b', color: '#fff', border: 'none', borderRadius: 6, cursor: annualBudgetSaving ? 'not-allowed' : 'pointer' }}
            >
              {annualBudgetSaving ? 'Saving...' : annualBudgetSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div onPaste={handleAnnualBudgetPaste} style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: 8 }}>
          <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: 190, padding: '8px 10px', background: '#f8fafc', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>Row</th>
                {ANNUAL_BUDGET_MONTHS.map((month) => (
                  <th key={month.key} style={{ padding: '8px 6px', background: '#f8fafc', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>
                    {month.label}
                  </th>
                ))}
                <th style={{ width: 100, padding: '8px 8px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {annualBudgetRows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <td style={{ padding: 0, borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={row.label}
                        onFocus={() => setAnnualBudgetFocusedCell({ rowIndex, columnIndex: 0 })}
                        onChange={(e) => updateAnnualBudgetRowLabel(rowIndex, e.target.value)}
                        placeholder="Budget"
                        style={{ flex: 1, minWidth: 0, padding: '8px 8px', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: '#0f172a', background: 'transparent' }}
                      />
                      {annualBudgetRows.length > 1 && (
                        annualBudgetDeleteConfirmRow === rowIndex ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
                            <button
                              type="button"
                              onClick={() => removeAnnualBudgetRow(rowIndex)}
                              title="Confirm delete row"
                              style={{ padding: '3px 6px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#991b1b', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnnualBudgetDeleteConfirmRow(null)}
                              title="Cancel delete"
                              style={{ padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 10 }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAnnualBudgetDeleteConfirmRow(rowIndex)}
                            title="Remove row"
                            style={{ width: 22, height: 22, marginRight: 4, border: 'none', borderRadius: 4, background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
                          >
                            ×
                          </button>
                        )
                      )}
                    </div>
                  </td>
                  {ANNUAL_BUDGET_MONTHS.map((month, columnIndex) => (
                    <td key={month.key} style={{ padding: 0, borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatBudgetCell(row.values[month.key])}
                        onFocus={() => setAnnualBudgetFocusedCell({ rowIndex, columnIndex })}
                        onChange={(e) => updateAnnualBudgetCell(rowIndex, month.key, e.target.value)}
                        style={{ width: '100%', padding: '8px 6px', border: 'none', outline: 'none', textAlign: 'center', fontSize: 13, color: '#0f172a', background: 'transparent' }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                    {annualBudgetRowTotal(row).toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '8px 10px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', background: '#eff6ff', fontWeight: 800, color: '#1d4ed8' }}>
                  Actual spend
                </td>
                {ANNUAL_BUDGET_MONTHS.map((month) => (
                  <td key={month.key} style={{ padding: '8px 6px', borderRight: '1px solid #dbeafe', borderBottom: '1px solid #cbd5e1', background: '#eff6ff', textAlign: 'center', fontWeight: 800, color: '#1d4ed8' }}>
                    {formatBudgetCell(annualBudgetActualTotals[month.key])}
                  </td>
                ))}
                <td style={{ padding: '8px 8px', borderBottom: '1px solid #cbd5e1', background: '#eff6ff', textAlign: 'center', fontWeight: 800, color: '#1d4ed8' }}>
                  {annualBudgetActualGrandTotal.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', background: '#f8fbff', fontWeight: 700, color: '#475569', fontSize: 12 }}>
                  Discrepancy %
                </td>
                {ANNUAL_BUDGET_MONTHS.map((month) => {
                  const planned = annualBudgetColumnTotals[month.key];
                  const actual = annualBudgetActualTotals[month.key];
                  const percentText = formatBudgetDiscrepancyPercent(actual, planned);
                  const percentValue = planned && actual !== '' ? ((Number(actual) - planned) / planned) * 100 : 0;
                  return (
                    <td key={month.key} style={{ padding: '6px 6px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1', background: '#f8fbff', textAlign: 'center', fontWeight: 700, color: percentText === '—' ? '#94a3b8' : percentValue > 0 ? '#dc2626' : '#059669', fontSize: 12 }}>
                      {percentText}
                    </td>
                  );
                })}
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #cbd5e1', background: '#f8fbff', textAlign: 'center', fontWeight: 700, color: annualBudgetGrandTotal && annualBudgetActualGrandTotal > annualBudgetGrandTotal ? '#dc2626' : '#059669', fontSize: 12 }}>
                  {formatBudgetDiscrepancyPercent(annualBudgetActualGrandTotal || '', annualBudgetGrandTotal)}
                </td>
              </tr>
              {annualBudgetRows.length > 1 && (
                <tr>
                  <td style={{ padding: '8px 10px', borderRight: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 800, color: '#0f172a' }}>Total</td>
                  {ANNUAL_BUDGET_MONTHS.map((month) => (
                    <td key={month.key} style={{ padding: '8px 6px', borderRight: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                      {annualBudgetColumnTotals[month.key].toLocaleString()}
                    </td>
                  ))}
                  <td style={{ padding: '8px 8px', background: '#f8fafc', textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                    {annualBudgetGrandTotal.toLocaleString()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Budget List */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
              Campaign Budget Allocation
            </h3>
            <div style={{ marginTop: 3, fontSize: 12, color: '#64748b' }}>
              {activeCampaignCount} campaign{activeCampaignCount === 1 ? '' : 's'} active now in Google Ads
            </div>
          </div>
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

        {/* Filter tabs + ad-groups toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'enabled' as CampaignFilter, label: 'Active', count: campaigns.filter(isBudgetIncludedCampaign).length, title: 'Campaigns active now: not paused/removed and not before start date or past end date.' },
              { key: 'paused' as CampaignFilter, label: 'Hidden', count: campaigns.filter(c => !isBudgetIncludedCampaign(c)).length, title: 'Excluded from active budget allocation, including paused, removed, future, and ended experiment campaigns.' },
              { key: 'all' as CampaignFilter, label: 'All', count: campaigns.length, title: 'All campaigns returned by the latest Google Ads sync, including ended experiments.' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setCampaignFilter(tab.key)}
                title={tab.title}
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
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'THIS_MONTH' as BudgetMetricsRange, label: 'MTD' },
              { key: 'LAST_60_DAYS' as BudgetMetricsRange, label: 'Last 60 days' },
              { key: 'LAST_180_DAYS' as BudgetMetricsRange, label: 'Last 180 days' },
            ]).map(range => (
              <button
                key={range.key}
                onClick={() => setMetricsRange(range.key)}
                disabled={syncing || loading}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: metricsRange === range.key ? 600 : 400,
                  background: metricsRange === range.key ? '#2563eb' : '#f1f5f9',
                  color: metricsRange === range.key ? '#fff' : '#64748b',
                  border: 'none',
                  borderRadius: 6,
                  cursor: syncing || loading ? 'not-allowed' : 'pointer',
                }}
              >
                {range.label}
              </button>
            ))}
          </div>
          {/* Show ad groups toggle. When ON, expanding a campaign also
              fetches and renders its ad groups inline. Toggling on does NOT
              auto-expand anything — the user still clicks each campaign to
              drill in (matches spec 5.1b). */}
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', cursor: 'pointer', marginLeft: 'auto' }}
            title="When enabled, expanding a campaign also shows its ad groups inline"
          >
            <span>Show ad groups</span>
            <div
              onClick={() => {
                const next = !showAdGroups;
                setShowAdGroups(next);
                // If a campaign is currently expanded and the toggle just
                // flipped ON, eagerly load its ad groups so the panel
                // populates without a second click.
                if (next && expandedCampaign) {
                  fetchAdGroups(expandedCampaign);
                }
              }}
              style={{
                width: 32, height: 18, borderRadius: 9, position: 'relative',
                background: showAdGroups ? '#2563eb' : '#d1d5db',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 7, background: '#fff',
                position: 'absolute', top: 2,
                left: showAdGroups ? 16 : 2,
                transition: 'left 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }} />
            </div>
          </label>
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

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflowX: 'auto', overflowY: 'hidden', paddingRight: 10 }}>
          {/* Table Header */}
          <div style={{ display: 'grid', minWidth: BUDGET_TABLE_MIN_WIDTH, gridTemplateColumns: gridTemplateColumns, gap: 4, padding: '10px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 600, color: '#64748b' }}>
            <div></div>
            <div>Campaign</div>
            <div style={{ textAlign: 'right' }}>%</div>
            <div style={{ textAlign: 'right' }}>{metricsRange === 'THIS_MONTH' ? 'MTD' : 'Cost'}</div>
            <div style={{ textAlign: 'right' }} title="Current live daily budget from Google Ads.">Current</div>
            <div style={{ textAlign: 'right' }} title="New calculated daily budget to push.">New Daily</div>
            <div style={{ textAlign: 'right' }} title="Recommended daily budget from last month's conversions, CPA, ROAS, spend and impression share signals. Advisory only — click to apply, then push.">Rec.</div>
            <div style={{ textAlign: 'right' }}>Impr.</div>
            <div style={{ textAlign: 'right' }}>Clicks</div>
            <div style={{ textAlign: 'right' }}>CPC</div>
            <div style={{ textAlign: 'right' }}>Conv.</div>
            <div style={{ textAlign: 'right' }}>CPA</div>
            <div style={{ textAlign: 'right' }} title="Budget status based on Search Budget Lost Impression Share.">Budget</div>
            <div style={{ textAlign: 'right' }} title="Search Impression Share">Search IS</div>
            <div style={{ textAlign: 'right' }} title="Search Impression Share lost due to budget">Lost IS</div>
          </div>

          {(() => {
            // Sort campaigns by conversions (highest first), tiebreaker by spend
            // (highest first). Campaigns with the same conversions and spend
            // fall back to alphabetical order so the list stays stable.
            const filtered = campaigns
              .filter(c =>
                campaignFilter === 'all' ? true :
                campaignFilter === 'enabled' ? isBudgetIncludedCampaign(c) :
                !isBudgetIncludedCampaign(c)
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
                    campaignFilter === 'enabled' ? 'No active campaigns. Switch to "All" to review ended experiments and historical campaigns.' :
                    'No hidden campaigns.'}
                </div>
              );
            }
            return filtered.map((campaign, index) => {
              const isEditing = editingCampaign === campaign.campaignId && editField === 'percentage';
              const isEditingStrategy = editingCampaign === campaign.campaignId && editField === 'bidStrategy';
              const isExpanded = expandedCampaign === campaign.campaignId;
              const budgetDiff = campaign.actualDailyBudget ? campaign.calculatedDailyBudget - campaign.actualDailyBudget : null;
              const restriction = budgetRestrictionLabel(campaign.searchBudgetLostIS);
              const spendForSelectedRange = selectedRangeSpend(campaign, metricsRange);
              const recommendationLines = [
                campaign.recommendationReason || 'Last 60 days recommendation signal.',
                typeof campaign.recommendationCpaLast60 === 'number' ? `Last 60d CPA: $${campaign.recommendationCpaLast60.toFixed(0)}` : 'Last 60d CPA: unavailable',
                `Last 60d conversions: ${(campaign.recommendationConversionsLast60 ?? 0).toFixed(0)}`,
                typeof campaign.searchBudgetLostIS === 'number'
                  ? `Budget-lost pressure: ${(campaign.searchBudgetLostIS * 100).toFixed(0)}%`
                  : 'Budget-lost pressure: unavailable from Google Ads/Growth Tools',
                typeof campaign.searchImpressionShare === 'number'
                  ? `Search impression share: ${(campaign.searchImpressionShare * 100).toFixed(0)}%`
                  : 'Search impression share: unavailable from Google Ads/Growth Tools',
              ];

              return (
                <div key={campaign.campaignId} style={{ borderBottom: index < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div
                    style={{ display: 'grid', minWidth: BUDGET_TABLE_MIN_WIDTH, gridTemplateColumns: gridTemplateColumns, gap: 4, padding: '10px 10px', alignItems: 'center', cursor: 'pointer', background: isExpanded ? '#f8fafc' : !campaign.enabled ? '#fafafa' : 'transparent', opacity: campaign.enabled ? 1 : 0.5 }}
                    onClick={() => {
                      const next = isExpanded ? null : campaign.campaignId;
                      setExpandedCampaign(next);
                      // Lazy-load ad groups for this campaign the first time
                      // it's expanded with the toggle on. Cached per id.
                      if (next && showAdGroups) {
                        fetchAdGroups(next);
                      }
                    }}
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
                      <div title={campaign.campaignName} style={{ fontWeight: 500, color: campaign.enabled ? '#1e293b' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', flexShrink: 0 }}>▶</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{campaign.campaignName}</span>
                      </div>
                      {budgetDiff !== null && Math.abs(budgetDiff) > 0.01 && (
                        <div style={{ fontSize: 10, color: '#d97706', marginLeft: 16 }}>
                          {budgetDiff > 0 ? '↑' : '↓'} ${Math.abs(budgetDiff).toFixed(2)}/day vs current
                        </div>
                      )}
                    </div>

                    {/* % Split */}
                    <div style={{ textAlign: 'right' }}>
                      {campaign.standalone ? (
                        <span
                          style={{ display: 'inline-block', padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#f3e8ff', borderRadius: 10, border: '1px solid #e9d5ff' }}
                          title="This campaign uses a standalone budget. Click the row to edit."
                        >
                          Standalone
                        </span>
                      ) : isEditing ? (
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

                    {/* Selected range spend */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#d97706', fontWeight: 500 }}>${spendForSelectedRange.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>

                    {/* Current Daily Budget */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: '#475569', fontSize: 14 }}>${(campaign.actualDailyBudget || 0).toFixed(2)}</span>
                    </div>

                    {/* New Daily Budget */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>${campaign.calculatedDailyBudget.toFixed(2)}</span>
                    </div>

                    {/* Recommendation score: last 60 days CPA/conversions vs current allocation */}
                    <div style={{ textAlign: 'right' }}>
                      <span
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setRecommendationTooltip({
                            campaignId: campaign.campaignId,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                            lines: recommendationLines,
                          });
                        }}
                        onMouseLeave={() => setRecommendationTooltip(null)}
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          fontSize: 10,
                          fontWeight: 700,
                          color: campaign.recommendationAction === 'increase' ? '#166534' : campaign.recommendationAction === 'decrease' ? '#991b1b' : '#64748b',
                          background: campaign.recommendationAction === 'increase' ? '#f0fdf4' : campaign.recommendationAction === 'decrease' ? '#fef2f2' : '#f8fafc',
                          border: `1px solid ${campaign.recommendationAction === 'increase' ? '#bbf7d0' : campaign.recommendationAction === 'decrease' ? '#fecaca' : '#e2e8f0'}`,
                          borderRadius: 9,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {campaign.recommendationAction === 'increase' ? '↑' : campaign.recommendationAction === 'decrease' ? '↓' : '→'} {Math.abs(campaign.recommendationScore ?? 0).toFixed(1)} <span style={{ opacity: 0.75 }}>ⓘ</span>
                      </span>
                    </div>

                    {/* Impressions */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{(campaign.impressions || 0).toLocaleString()}</span>
                    </div>

                    {/* Clicks */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{(campaign.clicks || 0).toLocaleString()}</span>
                    </div>

                    {/* Avg CPC */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>${(campaign.avgCpc || 0).toFixed(2)}</span>
                    </div>

                    {/* Conversions */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#6366f1' }}>{(campaign.conversions || 0).toLocaleString()}</span>
                    </div>

                    {/* Cost / Conversion */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{formatCostPerConv(spendForSelectedRange, campaign.conversions || 0)}</span>
                    </div>

                    {/* Budget restriction */}
                    <div style={{ textAlign: 'right' }}>
                      <span
                        title="Based on Search Budget Lost Impression Share"
                        style={{ display: 'inline-block', padding: '2px 6px', fontSize: 10, fontWeight: 600, color: restriction.color, background: restriction.background, border: `1px solid ${restriction.border}`, borderRadius: 9, whiteSpace: 'nowrap' }}
                      >
                        {restriction.label}
                      </span>
                    </div>

                    {/* Impression share */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{formatPercentMetric(campaign.searchImpressionShare)}</span>
                    </div>

                    {/* Impression share lost due to budget */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, color: typeof campaign.searchBudgetLostIS === 'number' && campaign.searchBudgetLostIS >= LIMITED_BY_BUDGET_THRESHOLD ? '#b45309' : '#64748b', fontWeight: typeof campaign.searchBudgetLostIS === 'number' && campaign.searchBudgetLostIS >= LIMITED_BY_BUDGET_THRESHOLD ? 600 : 400 }}>
                        {formatPercentMetric(campaign.searchBudgetLostIS)}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '10px 0 14px', background: '#fafafa', borderTop: '1px solid #e2e8f0', overflowX: 'auto', overflowY: 'hidden' }}>
                      {/* Ad-groups sub-table. Only rendered when the user
                          has flipped the "Show ad groups" toggle on. */}
                      {showAdGroups && (() => {
                        const rows = adGroupsByCampaign[campaign.campaignId];
                        const loadingAg = adGroupsLoading[campaign.campaignId];
                        const errorAg = adGroupsError[campaign.campaignId];
                        const warningAg = adGroupsWarning[campaign.campaignId];
                        return (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ display: 'grid', minWidth: BUDGET_TABLE_MIN_WIDTH, gridTemplateColumns: gridTemplateColumns, gap: 4, padding: '0 10px 8px', alignItems: 'center' }}>
                              <div />
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>Ad Groups</div>
                              <div style={{ gridColumn: '14 / 16', textAlign: 'right' }}>
                                {!loadingAg && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAdGroupsByCampaign(prev => {
                                        const next = { ...prev };
                                        delete next[campaign.campaignId];
                                        return next;
                                      });
                                      fetchAdGroups(campaign.campaignId);
                                    }}
                                    style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                                  >
                                    Refresh
                                  </button>
                                )}
                              </div>
                            </div>
                            {loadingAg && (
                              <div style={{ padding: 16, fontSize: 12, color: '#64748b', textAlign: 'center' }}>Loading ad groups…</div>
                            )}
                            {!loadingAg && errorAg && (
                              <div style={{ margin: '0 10px', padding: 12, fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                                {errorAg}
                              </div>
                            )}
                            {!loadingAg && !errorAg && warningAg && (
                              <div style={{ margin: '0 10px', padding: 12, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
                                {warningAg}
                              </div>
                            )}
                            {!loadingAg && !errorAg && !warningAg && rows && rows.length === 0 && (
                              <div style={{ padding: 12, fontSize: 12, color: '#64748b', textAlign: 'center' }}>No ad groups returned for this campaign.</div>
                            )}
                            {!loadingAg && !errorAg && rows && rows.length > 0 && (
                              <div style={{ borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'grid', minWidth: BUDGET_TABLE_MIN_WIDTH, gridTemplateColumns: gridTemplateColumns, gap: 4, padding: '8px 10px', background: '#fff', borderBottom: '1px solid #f1f5f9', fontSize: 10, fontWeight: 600, color: '#64748b' }}>
                                  <div />
                                  <div>Ad Group</div>
                                  <div />
                                  <div style={{ textAlign: 'right' }}>{metricsRange === 'THIS_MONTH' ? 'MTD' : 'Cost'}</div>
                                  <div />
                                  <div />
                                  <div />
                                  <div style={{ textAlign: 'right' }}>Impr.</div>
                                  <div style={{ textAlign: 'right' }}>Clicks</div>
                                  <div style={{ textAlign: 'right' }}>CPC</div>
                                  <div style={{ textAlign: 'right' }}>Conv.</div>
                                  <div style={{ textAlign: 'right' }}>CPA</div>
                                  <div />
                                  <div style={{ textAlign: 'right' }} title="Search Impression Share">Search IS</div>
                                  <div style={{ textAlign: 'right' }} title="Search impressions lost due to budget">Lost IS</div>
                                </div>
                                {rows.map((ag, agIdx) => (
                                  <div
                                    key={ag.adGroupId}
                                    style={{ display: 'grid', minWidth: BUDGET_TABLE_MIN_WIDTH, gridTemplateColumns: gridTemplateColumns, gap: 4, padding: '8px 10px', alignItems: 'center', borderBottom: agIdx < rows.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 12 }}
                                  >
                                    <div />
                                    <div style={{ minWidth: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', paddingLeft: 18 }}>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={ag.adGroupName}>{ag.adGroupName}</span>
                                      {typeof ag.searchBudgetLostIS === 'number' && ag.searchBudgetLostIS >= LIMITED_BY_BUDGET_THRESHOLD && (
                                        <span title={`Search Budget Lost IS: ${(ag.searchBudgetLostIS * 100).toFixed(0)}%`} style={{ display: 'inline-flex', padding: '1px 6px', fontSize: 10, fontWeight: 600, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, whiteSpace: 'nowrap' }}>
                                          Limited — {(ag.searchBudgetLostIS * 100).toFixed(0)}%
                                        </span>
                                      )}
                                    </div>
                                    <div />
                                    <div style={{ textAlign: 'right', color: '#d97706', fontWeight: 500 }}>${(ag.cost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    <div />
                                    <div />
                                    <div />
                                    <div style={{ textAlign: 'right', color: '#64748b' }}>{(ag.impressions || 0).toLocaleString()}</div>
                                    <div style={{ textAlign: 'right', color: '#64748b' }}>{(ag.clicks || 0).toLocaleString()}</div>
                                    <div style={{ textAlign: 'right', color: '#64748b' }}>${(ag.avgCpc || 0).toFixed(2)}</div>
                                    <div style={{ textAlign: 'right', color: '#6366f1', fontWeight: 500 }}>{(ag.conversions || 0).toLocaleString()}</div>
                                    <div style={{ textAlign: 'right', color: '#64748b' }}>{formatCostPerConv(ag.cost || 0, ag.conversions || 0)}</div>
                                    <div />
                                    <div style={{ textAlign: 'right', color: '#64748b' }}>{formatPercentMetric(ag.searchImpressionShare)}</div>
                                    <div style={{ textAlign: 'right', color: typeof ag.searchBudgetLostIS === 'number' && ag.searchBudgetLostIS >= LIMITED_BY_BUDGET_THRESHOLD ? '#b45309' : '#64748b', fontWeight: typeof ag.searchBudgetLostIS === 'number' && ag.searchBudgetLostIS >= LIMITED_BY_BUDGET_THRESHOLD ? 600 : 400 }}>
                                      {formatPercentMetric(ag.searchBudgetLostIS)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div style={{ display: 'grid', minWidth: BUDGET_TABLE_MIN_WIDTH, gridTemplateColumns: gridTemplateColumns, gap: 4, padding: '8px 10px 0', alignItems: 'center', fontSize: 12 }}>
                        <div />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input
                            type="checkbox"
                            checked={!!campaign.standalone}
                            onChange={(e) => {
                              const nextStandalone = e.target.checked;
                              setCampaigns(prev => {
                                const updated = prev.map(c => c.campaignId === campaign.campaignId ? { ...c, standalone: nextStandalone, budgetPercentage: nextStandalone ? 0 : c.budgetPercentage } : c);
                                const recalculated = recalculateBudgets(updated, monthlyTotal);
                                const saved = recalculated.find(c => c.campaignId === campaign.campaignId);
                                if (saved) saveCampaignToCMS(saved);
                                return recalculated;
                              });
                            }}
                          />
                          <span style={{ fontWeight: 600 }}>Standalone budget</span>
                        </label>
                        <div style={{ textAlign: 'right' }} title="Monthly Share"><span style={{ fontSize: 10, color: '#64748b' }}>Share</span><br />{campaign.standalone ? '—' : `$${(monthlyTotal * campaign.budgetPercentage / 100).toFixed(0)}`}</div>
                        <div style={{ textAlign: 'right' }} title={metricsRange === 'THIS_MONTH' ? 'MTD Spend' : 'Selected range cost'}><span style={{ fontSize: 10, color: '#64748b' }}>{metricsRange === 'THIS_MONTH' ? 'MTD' : 'Cost'}</span><br />${spendForSelectedRange.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div style={{ textAlign: 'right' }} title="Current daily budget"><span style={{ fontSize: 10, color: '#64748b' }}>Current</span><br />${(campaign.actualDailyBudget || 0).toFixed(2)}</div>
                        <div style={{ textAlign: 'right' }} title="Adjusted daily budget"><span style={{ fontSize: 10, color: '#64748b' }}>New</span><br />${campaign.calculatedDailyBudget.toFixed(2)}</div>
                        <div />
                        <div style={{ textAlign: 'right' }} title="Impressions"><span style={{ fontSize: 10, color: '#64748b' }}>Impr.</span><br />{(campaign.impressions || 0).toLocaleString()}</div>
                        <div style={{ textAlign: 'right' }} title="Clicks"><span style={{ fontSize: 10, color: '#64748b' }}>Clicks</span><br />{(campaign.clicks || 0).toLocaleString()}</div>
                        <div />
                        <div />
                        <div style={{ gridColumn: '12 / 14' }} title="Bid Strategy"><span style={{ fontSize: 10, color: '#64748b' }}>Bid Strategy</span><br />
                          <span onClick={(e) => { e.stopPropagation(); startEditBidStrategy(campaign); }} style={{ fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                            {isEditingStrategy ? (
                              <select value={editValue} onChange={(e) => { setEditValue(e.target.value); handleBlurSave(campaign.campaignId, 'bidStrategy', e.target.value); }} onClick={(e) => e.stopPropagation()} onBlur={() => handleBlurSave(campaign.campaignId, 'bidStrategy', editValue)} style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #2563eb', borderRadius: 4 }} autoFocus>
                                {BID_STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            ) : (
                              BID_STRATEGIES.find((s) => s.value === campaign.bidStrategy)?.label || campaign.bidStrategy
                            )}
                          </span>
                        </div>
                        <div style={{ gridColumn: '14 / 16', textAlign: 'right' }} title="Last pushed"><span style={{ fontSize: 10, color: '#64748b' }}>Last Pushed</span><br />{campaign.lastPushedAt ? new Date(campaign.lastPushedAt).toLocaleDateString() : 'Never'}</div>
                      </div>

                      {campaign.standalone && (
                        <div style={{ padding: 12, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, marginTop: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b21a8', marginBottom: 8 }}>Standalone Budget</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Total Budget ($)</div>
                              <input
                                type="number"
                                defaultValue={campaign.standaloneBudget || ''}
                                placeholder="0"
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  if (value === (campaign.standaloneBudget || 0)) return;
                                  setCampaigns(prev => {
                                    const updated = prev.map(c => c.campaignId === campaign.campaignId ? { ...c, standaloneBudget: value } : c);
                                    const recalculated = recalculateBudgets(updated, monthlyTotal);
                                    const saved = recalculated.find(c => c.campaignId === campaign.campaignId);
                                    if (saved) saveCampaignToCMS(saved);
                                    return recalculated;
                                  });
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d8b4fe', borderRadius: 4 }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Start Date</div>
                              <input
                                type="date"
                                defaultValue={campaign.standaloneStartDate ? campaign.standaloneStartDate.slice(0, 10) : ''}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const value = e.target.value || null;
                                  if (value === (campaign.standaloneStartDate || null)) return;
                                  setCampaigns(prev => {
                                    const updated = prev.map(c => c.campaignId === campaign.campaignId ? { ...c, standaloneStartDate: value } : c);
                                    const recalculated = recalculateBudgets(updated, monthlyTotal);
                                    const saved = recalculated.find(c => c.campaignId === campaign.campaignId);
                                    if (saved) saveCampaignToCMS(saved);
                                    return recalculated;
                                  });
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d8b4fe', borderRadius: 4 }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>End Date</div>
                              <input
                                type="date"
                                defaultValue={campaign.standaloneEndDate ? campaign.standaloneEndDate.slice(0, 10) : ''}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const value = e.target.value || null;
                                  if (value === (campaign.standaloneEndDate || null)) return;
                                  setCampaigns(prev => {
                                    const updated = prev.map(c => c.campaignId === campaign.campaignId ? { ...c, standaloneEndDate: value } : c);
                                    const recalculated = recalculateBudgets(updated, monthlyTotal);
                                    const saved = recalculated.find(c => c.campaignId === campaign.campaignId);
                                    if (saved) saveCampaignToCMS(saved);
                                    return recalculated;
                                  });
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d8b4fe', borderRadius: 4 }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Daily Budget</div>
                              <div style={{ padding: '6px 8px', fontSize: 14, fontWeight: 700, color: '#059669' }}>${campaign.calculatedDailyBudget.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {recommendationTooltip && (
        <div
          style={{
            position: 'fixed',
            left: recommendationTooltip.x,
            top: recommendationTooltip.y - 10,
            transform: 'translate(-50%, -100%)',
            zIndex: 10000,
            width: 320,
            maxWidth: 'calc(100vw - 24px)',
            padding: 12,
            background: '#0f172a',
            color: '#fff',
            borderRadius: 8,
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.35)',
            fontSize: 12,
            lineHeight: 1.45,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Why this recommendation?</div>
          {recommendationTooltip.lines.map((line, i) => (
            <div key={`${recommendationTooltip.campaignId}-${i}`} style={{ marginTop: i === 0 ? 0 : 4 }}>
              {line}
            </div>
          ))}
        </div>
      )}

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
                dangerouslySetInnerHTML={{ __html: generateBudgetEmailHtml(businessName, new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), monthlySpend, campaigns, monthlyTotal, clientSlug, clientPin) }}
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
                {lastMonthRecap && !loadingRecap && (() => {
                  const recapWithEdits = { ...lastMonthRecap, insights: actionItems };
                  const sevColors = {
                    good: { bg: '#f0fdf4', border: '#bbf7d0', accent: '#059669', label: 'Good', icon: '✓' },
                    warning: { bg: '#fffbeb', border: '#fed7aa', accent: '#d97706', label: 'Warning', icon: '!' },
                    critical: { bg: '#fef2f2', border: '#fecaca', accent: '#dc2626', label: 'Critical', icon: '✕' },
                  } as const;
                  return (
                    <>
                      {/* Action items editor */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                            Action Items ({actionItems.length})
                          </div>
                          <button
                            onClick={addActionItem}
                            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                          >
                            + Add Action Item
                          </button>
                        </div>
                        {actionItems.length === 0 && (
                          <div style={{ padding: 16, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                            No action items. Click "Add Action Item" to include one in the email.
                          </div>
                        )}
                        {actionItems.map((item, idx) => {
                          const c = sevColors[item.severity];
                          const isFirst = idx === 0;
                          const isLast = idx === actionItems.length - 1;
                          return (
                            <div
                              key={item.id}
                              style={{ padding: 12, background: c.bg, border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.accent}`, borderRadius: 8, marginBottom: 8 }}
                            >
                              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <button
                                    onClick={() => moveActionItem(item.id, 'up')}
                                    disabled={isFirst}
                                    title="Move up"
                                    style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1, background: isFirst ? 'transparent' : '#fff', color: isFirst ? '#cbd5e1' : '#475569', border: `1px solid ${isFirst ? 'transparent' : '#e2e8f0'}`, borderRadius: 3, cursor: isFirst ? 'not-allowed' : 'pointer' }}
                                  >
                                    ▲
                                  </button>
                                  <button
                                    onClick={() => moveActionItem(item.id, 'down')}
                                    disabled={isLast}
                                    title="Move down"
                                    style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1, background: isLast ? 'transparent' : '#fff', color: isLast ? '#cbd5e1' : '#475569', border: `1px solid ${isLast ? 'transparent' : '#e2e8f0'}`, borderRadius: 3, cursor: isLast ? 'not-allowed' : 'pointer' }}
                                  >
                                    ▼
                                  </button>
                                </div>
                                <button
                                  onClick={() => cycleSeverity(item.id)}
                                  title="Click to cycle severity"
                                  style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, background: c.accent, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}
                                >
                                  {c.icon} {c.label}
                                </button>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <input
                                    type="text"
                                    value={item.title}
                                    onChange={e => updateActionItem(item.id, { title: e.target.value })}
                                    style={{ width: '100%', padding: '4px 6px', fontSize: 13, fontWeight: 600, color: c.accent, background: 'transparent', border: '1px solid transparent', borderRadius: 4, outline: 'none', marginBottom: 4 }}
                                    onFocus={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = '#fff'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                                  />
                                  <textarea
                                    value={item.body}
                                    onChange={e => updateActionItem(item.id, { body: e.target.value })}
                                    rows={2}
                                    style={{ width: '100%', padding: '4px 6px', fontSize: 13, color: '#374151', background: 'transparent', border: '1px solid transparent', borderRadius: 4, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                    onFocus={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = '#fff'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                                  />
                                </div>
                                <button
                                  onClick={() => deleteActionItem(item.id)}
                                  title="Delete action item"
                                  style={{ padding: '4px 8px', fontSize: 14, background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Live email preview */}
                      <div
                        style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16, maxHeight: 480, overflow: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: generateLastMonthRecapEmailHtml(businessName, recapWithEdits, clientSlug, clientPin) }}
                      />
                    </>
                  );
                })()}
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
