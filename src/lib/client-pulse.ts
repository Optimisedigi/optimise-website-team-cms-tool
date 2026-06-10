export type ClientPulseScoreStatus = "good" | "watch" | "risk" | "missing" | "not_in_scope";
export type ClientPulseTargetStatus = "on_track" | "watch" | "at_risk" | "missing_data" | "not_configured";
export type ClientPulseTargetDirection = "increase" | "decrease" | "maintain";

export interface ScoreSummary {
  score: number | null;
  status: ClientPulseScoreStatus;
  label: string;
  reasons: string[];
}

export interface SignalItem {
  id: string;
  label: string;
  status: ClientPulseScoreStatus;
  detail?: string;
  at?: string | null;
}

export interface ClientPulseSummary {
  client: {
    id: number | string;
    name: string;
    slug: string;
    logoThumbUrl?: string | null;
    services: string[];
    accountManagers: Array<{ id: number | string; name?: string | null; email?: string | null }>;
    priority: string;
    hasGoogleAds: boolean;
  };
  target: {
    label: string;
    metric: string;
    value: number | null;
    currentValue: number | null;
    progressPercent: number | null;
    direction: ClientPulseTargetDirection;
    status: ClientPulseTargetStatus;
    comparisonWindow: string;
  };
  analyticsMetrics: Array<{ metric: string; label: string; value: number | null; displayValue: string }>;
  organicTrend: OrganicTrend;
  adsTrend: AdsTrend;
  scores: {
    organic: ScoreSummary;
    paidSearch: ScoreSummary;
    serviceCoverage: ScoreSummary;
    neglect: ScoreSummary;
    overall: ScoreSummary;
  };
  signals: {
    automations: SignalItem[];
    scheduledTasks: SignalItem[];
    goalAgents: SignalItem[];
    negativeKeywords: SignalItem[];
    reports: SignalItem[];
    qbrs: SignalItem[];
    manualWork: SignalItem[];
    recentActivity: SignalItem[];
  };
  counts: {
    activeAutomations: number;
    activeScheduledTasks: number;
    activeGoalRuns: number;
    manualWorkLast30Days: number;
    activityLast30Days: number;
    overdueItems: number;
  };
  lastMeaningfulActivityAt: string | null;
  reasons: string[];
}

export interface OrganicTrend {
  /** Latest full calendar month with GSC data, e.g. "2026-05". */
  month: string | null;
  clicks: number | null;
  impressions: number | null;
  /** % change vs the previous calendar month. */
  momPercent: number | null;
  /** % change vs the same calendar month last year. */
  yoyPercent: number | null;
}

export interface AdsTrend {
  /** Latest full calendar month with Google Ads data, e.g. "2026-05". */
  month: string | null;
  clicks: number | null;
  conversions: number | null;
  cpa: number | null;
  clicksMomPercent: number | null;
  conversionsMomPercent: number | null;
  cpaMomPercent: number | null;
  /** Current month-to-date Google Ads comparison against the same dates last year. */
  mtdMonth: string | null;
  mtdClicks: number | null;
  mtdConversions: number | null;
  mtdClicksYoyPercent: number | null;
  mtdConversionsYoyPercent: number | null;
}

export interface ClientPulseOptions {
  now?: Date;
  recentDays?: number;
  limit?: number;
}

export interface ClientPulseSources {
  clients: PlainRecord[];
  scheduledTasks: PlainRecord[];
  goalRuns: PlainRecord[];
  activityLog: PlainRecord[];
  ledgerItems: PlainRecord[];
  clientProcesses: PlainRecord[];
  organicSnapshots: PlainRecord[];
  gscMonthlySnapshots: PlainRecord[];
  googleAdsSnapshots: PlainRecord[];
  siteHealthReports: PlainRecord[];
  aiVisibilitySnapshots: PlainRecord[];
}

export interface GroupedClientPulseSources {
  scheduledTasks: Map<string, PlainRecord[]>;
  goalRuns: Map<string, PlainRecord[]>;
  activityLog: Map<string, PlainRecord[]>;
  ledgerItems: Map<string, PlainRecord[]>;
  clientProcesses: Map<string, PlainRecord[]>;
  organicSnapshots: Map<string, PlainRecord[]>;
  gscMonthlySnapshots: Map<string, PlainRecord[]>;
  googleAdsSnapshots: Map<string, PlainRecord[]>;
  siteHealthReports: Map<string, PlainRecord[]>;
  aiVisibilitySnapshots: Map<string, PlainRecord[]>;
}

type PlainRecord = Record<string, unknown>;
type PayloadFindResult = { docs?: unknown[]; hasNextPage?: boolean; nextPage?: number | null };
type PayloadLike = {
  find(args: PlainRecord): Promise<PayloadFindResult>;
};

const DAY_MS = 86_400_000;
const TERMINAL_GOAL_STATUSES = new Set(["complete", "failed", "blocked"]);
const ANALYTICS_METRIC_OPTIONS = new Set(["traffic", "conversions", "cpa", "revenue", "roas", "organic_clicks", "paid_conversions"]);
const DEFAULT_ANALYTICS_METRICS = ["traffic", "conversions", "cpa"];
const NEGATIVE_KEYWORD_ACTIVITY_TYPES = new Set([
  "negative_sweep_completed",
  "negative_sweep_synced",
  "monthly_negative_needs_review",
  "match_type_violation_detected",
  "match_type_violation_resolved",
]);

export async function getClientPulseSummaries(
  payload: PayloadLike,
  options: ClientPulseOptions = {},
): Promise<ClientPulseSummary[]> {
  const sources = await fetchClientPulseSources(payload, options);
  const clientIds = sources.clients.map((client) => normalizeId(client.id)).filter(Boolean);
  const grouped = groupClientPulseSources(sources, clientIds);
  const now = options.now ?? new Date();
  return sources.clients
    .map((client) => buildClientPulseSummary({ client, grouped, now }))
    .sort((a, b) => sortSummary(a, b));
}

export async function fetchClientPulseSources(
  payload: PayloadLike,
  options: ClientPulseOptions = {},
): Promise<ClientPulseSources> {
  const now = options.now ?? new Date();
  const recentDays = options.recentDays ?? 90;
  const limit = options.limit ?? 1000;
  const recentSince = new Date(now.getTime() - recentDays * DAY_MS).toISOString();

  const clientQuery = {
    collection: "clients",
    depth: 0,
    limit,
    sort: "name",
    // Pulse only tracks live engagements: the client must be active AND have
    // Client Pulse toggled on. Inactive or opted-out clients never appear.
    where: {
      and: [{ isActive: { not_equals: false } }, { "clientPulse.enabled": { equals: true } }],
    },
    select: clientPulseClientSelect(true),
  };
  const clients = await fetchAllPagesWithFallback(payload, clientQuery, {
    ...clientQuery,
    select: clientPulseClientSelect(false),
  });
  const clientIds = clients.map((client) => normalizeId(client.id)).filter(Boolean);

  if (clientIds.length === 0) {
    return emptySources(clients);
  }

  const [scheduledTasks, goalRuns, activityLog, ledgerItems, clientProcesses, organicSnapshots, gscMonthlySnapshots, googleAdsSnapshots, siteHealthReports, aiVisibilitySnapshots] =
    await Promise.all([
      fetchAllPages(payload, {
        collection: "scheduled-agent-tasks",
        where: { or: [{ client: { in: clientIds } }, { isActive: { equals: true } }, { updatedAt: { greater_than_equal: recentSince } }] },
        depth: 1,
        limit,
        sort: "-updatedAt",
      }),
      fetchAllPages(payload, {
        collection: "goal-runs",
        where: { and: [{ client: { in: clientIds } }, { or: [{ updatedAt: { greater_than_equal: recentSince } }, { status: { not_in: Array.from(TERMINAL_GOAL_STATUSES) } }] }] },
        depth: 1,
        limit,
        sort: "-updatedAt",
      }),
      fetchAllPages(payload, {
        collection: "activity-log",
        where: { and: [{ client: { in: clientIds } }, { createdAt: { greater_than_equal: recentSince } }] },
        depth: 1,
        limit,
        sort: "-createdAt",
      }),
      fetchAllPages(payload, {
        collection: "client-value-ledger-items",
        where: { and: [{ client: { in: clientIds } }, { occurredAt: { greater_than_equal: recentSince } }] },
        depth: 1,
        limit,
        sort: "-occurredAt",
      }),
      fetchAllPages(payload, {
        collection: "client-processes",
        where: { and: [{ client: { in: clientIds } }, { updatedAt: { greater_than_equal: recentSince } }] },
        depth: 1,
        limit,
        sort: "-updatedAt",
      }),
      fetchAllPages(payload, {
        collection: "quarterly-organic-growth-snapshots",
        where: { client: { in: clientIds } },
        depth: 1,
        limit,
        sort: "-snapshotDate",
      }),
      // Calendar-month GSC snapshots (periodStart = "YYYY-MM-01"), maintained
      // and backfilled ~16 months by the GSC monitor cron. These drive the
      // MoM/YoY organic trend. Select keeps the heavy JSON fields out.
      fetchAllPages(payload, {
        collection: "gsc-snapshots",
        where: { and: [{ client: { in: clientIds } }, { periodStart: { like: "%-01" } }] },
        depth: 0,
        limit,
        sort: "-periodEnd",
        select: { id: true, client: true, periodStart: true, periodEnd: true, totalClicks: true, totalImpressions: true },
      }),
      // Campaign level only — keyword/search-term snapshot rows are huge and
      // ad-group rows would double-count the same clicks/spend.
      fetchAllPages(payload, {
        collection: "google-ads-snapshots",
        where: { and: [{ client: { in: clientIds } }, { level: { equals: "campaign" } }] },
        depth: 1,
        limit,
        sort: "-capturedAt",
      }),
      fetchAllPages(payload, {
        collection: "site-health-reports",
        where: { client: { in: clientIds } },
        depth: 1,
        limit,
        sort: "-reportDate",
      }),
      fetchAllPages(payload, {
        collection: "ai-visibility-snapshots",
        where: { client: { in: clientIds } },
        depth: 1,
        limit,
        sort: "-periodEnd",
      }),
    ]);

  return {
    clients,
    scheduledTasks: filterRecordsByClient(scheduledTasks, clientIds),
    goalRuns: filterRecordsByClient(goalRuns, clientIds),
    activityLog: filterRecordsByClient(activityLog, clientIds),
    ledgerItems: filterRecordsByClient(ledgerItems, clientIds),
    clientProcesses: filterRecordsByClient(clientProcesses, clientIds),
    organicSnapshots: filterRecordsByClient(organicSnapshots, clientIds),
    gscMonthlySnapshots: filterRecordsByClient(gscMonthlySnapshots, clientIds),
    googleAdsSnapshots: filterRecordsByClient(googleAdsSnapshots, clientIds),
    siteHealthReports: filterRecordsByClient(siteHealthReports, clientIds),
    aiVisibilitySnapshots: filterRecordsByClient(aiVisibilitySnapshots, clientIds),
  };
}

export function groupClientPulseSources(sources: ClientPulseSources, clientIds: string[]): GroupedClientPulseSources {
  const allowed = new Set(clientIds);
  return {
    scheduledTasks: groupByClient(sources.scheduledTasks, allowed, "updatedAt", true),
    goalRuns: groupByClient(sources.goalRuns, allowed, "updatedAt"),
    activityLog: groupByClient(sources.activityLog, allowed, "createdAt"),
    ledgerItems: groupByClient(sources.ledgerItems, allowed, "occurredAt"),
    clientProcesses: groupByClient(sources.clientProcesses, allowed, "updatedAt"),
    organicSnapshots: groupByClient(sources.organicSnapshots, allowed, "snapshotDate"),
    gscMonthlySnapshots: groupByClient(sources.gscMonthlySnapshots, allowed, "periodEnd"),
    googleAdsSnapshots: groupByClient(sources.googleAdsSnapshots, allowed, "capturedAt"),
    siteHealthReports: groupByClient(sources.siteHealthReports, allowed, "reportDate"),
    aiVisibilitySnapshots: groupByClient(sources.aiVisibilitySnapshots, allowed, "periodEnd"),
  };
}

export function buildClientPulseSummary(input: {
  client: PlainRecord;
  grouped: GroupedClientPulseSources;
  now?: Date;
}): ClientPulseSummary {
  const now = input.now ?? new Date();
  const id = normalizeId(input.client.id) || "unknown";
  const pulse = recordValue(input.client.clientPulse);
  const servicesTracked = stringArray(pulse.servicesTracked);
  const services = stringArray(input.client.services);
  const allServices = servicesTracked.length > 0 ? servicesTracked : mapClientServices(services);
  const latestOrganic = firstForClient(input.grouped.organicSnapshots, id, 0);
  const previousOrganic = firstForClient(input.grouped.organicSnapshots, id, 1);
  const organicTrend = calculateOrganicTrend(input.grouped.gscMonthlySnapshots.get(id) ?? [], now);
  const allAdsSnapshots = input.grouped.googleAdsSnapshots.get(id) ?? [];
  const adsTrend = calculateAdsTrend(allAdsSnapshots, now);
  // Rolling-window snapshots feed the live paid score; MONTH_* history feeds
  // the MoM trend. Mixing them would double-count clicks and spend.
  const adsSnapshots = allAdsSnapshots.filter((snapshot) => {
    const label = stringValue(snapshot.dateRangeLabel);
    return !label.startsWith("MONTH_") && !label.startsWith("MTD_");
  });
  const analyticsSnapshots = stableRecords(input.grouped.aiVisibilitySnapshots.get(id) ?? [], "periodEnd");
  const activity = stableRecords(input.grouped.activityLog.get(id) ?? [], "createdAt");
  const ledger = stableRecords(input.grouped.ledgerItems.get(id) ?? [], "occurredAt");
  const tasks = stableRecords(input.grouped.scheduledTasks.get(id) ?? [], "nextRunAt");
  const goalRuns = stableRecords(input.grouped.goalRuns.get(id) ?? [], "updatedAt");
  const processes = stableRecords(input.grouped.clientProcesses.get(id) ?? [], "updatedAt");
  const siteReports = stableRecords(input.grouped.siteHealthReports.get(id) ?? [], "reportDate");
  const last30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const lastMeaningfulActivityAt = latestDate([
    ...activity.map((item) => stringValue(item.createdAt)),
    ...ledger.map((item) => stringValue(item.occurredAt)),
    ...processes.map((item) => stringValue(item.updatedAt)),
    ...goalRuns.map((item) => stringValue(item.updatedAt)),
  ]);

  const metrics = deriveMetrics(latestOrganic, adsSnapshots, analyticsSnapshots[0], organicTrend);
  const analyticsMetrics = selectedAnalyticsMetrics(pulse).map((metric) => ({
    metric,
    label: labelForTarget(metric),
    value: metrics[metric] ?? null,
    displayValue: formatMetricValue(metric, metrics[metric] ?? null),
  }));
  const target = calculateTargetProgress(
    {
      metric: stringValue(pulse.primaryTarget) || "traffic",
      label: stringValue(pulse.targetLabel),
      value: numberValue(pulse.targetValue),
      direction: targetDirection(pulse.targetDirection),
      unit: stringValue(pulse.targetUnit) || "custom",
      comparisonWindow: stringValue(pulse.comparisonWindow) || "last_90_days",
    },
    metrics,
  );
  const automationSignals = automationSignalItems(input.client, allServices);
  const scheduledSignals = tasks.map((task) => signalFromRecord(task, "scheduled-task", stringValue(task.title) || stringValue(task.name) || "Scheduled task", taskStatus(task), stringValue(task.lastRunStatus), stringValue(task.nextRunAt)));
  const goalSignals = goalRuns.map((run) => signalFromRecord(run, "goal-run", stringValue(run.goal) || "Goal agent", goalStatus(run), stringValue(run.status), stringValue(run.nextCheckAt)));
  const manualSignals = ledger.slice(0, 6).map((item) => signalFromRecord(item, "ledger", stringValue(item.title) || "Manual work", "good", stringValue(item.category), stringValue(item.occurredAt)));
  const activitySignals = activity.slice(0, 6).map((item) => signalFromRecord(item, "activity", stringValue(item.title) || stringValue(item.type) || "Activity", "good", stringValue(item.type), stringValue(item.createdAt)));
  const reportSignals = reportSignalItems(siteReports, input.grouped.organicSnapshots.get(id) ?? [], input.client);
  const qbrSignals = qbrSignalItems(ledger, activity);
  const negativeSignals = negativeKeywordSignalItems(activity, input.client);
  const activeAutomations = automationSignals.filter((item) => item.status === "good").length;
  const activeScheduledTasks = tasks.filter((task) => task.isActive !== false).length;
  const activeGoalRuns = goalRuns.filter((run) => !TERMINAL_GOAL_STATUSES.has(stringValue(run.status))).length;
  const overdueItems = scheduledSignals.filter((item) => item.status === "risk").length + goalSignals.filter((item) => item.status === "risk").length;
  const counts = {
    activeAutomations,
    activeScheduledTasks,
    activeGoalRuns,
    manualWorkLast30Days: ledger.filter((item) => (stringValue(item.occurredAt) || "") >= last30).length,
    activityLast30Days: activity.filter((item) => (stringValue(item.createdAt) || "") >= last30).length,
    overdueItems,
  };
  const serviceCoverage = calculateServiceCoverage({
    activeAutomations,
    activeScheduledTasks,
    activeGoalRuns,
    manualWorkLast30Days: counts.manualWorkLast30Days,
    reportCount: reportSignals.filter((item) => item.status === "good").length,
    servicesTracked: allServices,
  });
  const neglect = calculateNeglectRisk(
    { lastMeaningfulActivityAt, overdueItems, missingReport: reportSignals.some((item) => item.status === "missing" || item.status === "risk") },
    {
      warningDays: numberValue(pulse.neglectWarningDays) ?? 14,
      criticalDays: numberValue(pulse.neglectCriticalDays) ?? 30,
    },
    now,
  );
  const organic = calculateOrganicScore(latestOrganic, previousOrganic, allServices, organicTrend);
  const paidSearch = calculatePaidSearchScore(adsSnapshots, input.client, allServices);
  const overall = calculateOverallScore([organic, paidSearch, serviceCoverage, neglect]);
  const reasons = [...targetReasons(target), ...organic.reasons, ...paidSearch.reasons, ...serviceCoverage.reasons, ...neglect.reasons]
    .filter(Boolean)
    .slice(0, 8);

  return {
    client: {
      id: input.client.id as string | number,
      name: stringValue(input.client.name) || "Untitled client",
      slug: stringValue(input.client.slug) || String(id),
      logoThumbUrl: stringValue(input.client.logoThumbUrl) || null,
      services,
      accountManagers: relationshipArray(input.client.accountManagers),
      priority: stringValue(pulse.priority) || "normal",
      hasGoogleAds: clientHasGoogleAds(input.client),
    },
    target,
    analyticsMetrics,
    organicTrend,
    adsTrend,
    scores: { organic, paidSearch, serviceCoverage, neglect, overall },
    signals: {
      automations: automationSignals,
      scheduledTasks: scheduledSignals,
      goalAgents: goalSignals,
      negativeKeywords: negativeSignals,
      reports: reportSignals,
      qbrs: qbrSignals,
      manualWork: manualSignals,
      recentActivity: activitySignals,
    },
    counts,
    lastMeaningfulActivityAt,
    reasons,
  };
}

export function calculateTargetProgress(
  targetConfig: { metric?: string; label?: string; value?: number | null; direction?: ClientPulseTargetDirection; unit?: string; comparisonWindow?: string },
  metrics: Record<string, number | null | undefined>,
): ClientPulseSummary["target"] {
  const metric = targetConfig.metric || "custom";
  const direction = targetConfig.direction ?? "increase";
  const targetValue = targetConfig.value ?? null;
  const currentValue = metrics[metric] ?? null;
  const label = targetConfig.label || labelForTarget(metric);
  if (targetValue === null || targetValue === 0) {
    return { label, metric, value: targetValue, currentValue, progressPercent: null, direction, status: "not_configured", comparisonWindow: targetConfig.comparisonWindow || "last_90_days" };
  }
  if (currentValue === null) {
    return { label, metric, value: targetValue, currentValue, progressPercent: null, direction, status: "missing_data", comparisonWindow: targetConfig.comparisonWindow || "last_90_days" };
  }
  let progressPercent: number;
  if (direction === "decrease") {
    progressPercent = targetValue >= currentValue ? 100 : (targetValue / currentValue) * 100;
  } else if (direction === "maintain") {
    const variance = Math.abs(currentValue - targetValue) / targetValue;
    progressPercent = Math.max(0, 100 - variance * 100);
  } else {
    progressPercent = (currentValue / targetValue) * 100;
  }
  const rounded = Math.max(0, Math.min(200, Math.round(progressPercent)));
  const status: ClientPulseTargetStatus = rounded >= 95 ? "on_track" : rounded >= 75 ? "watch" : "at_risk";
  return { label, metric, value: targetValue, currentValue, progressPercent: rounded, direction, status, comparisonWindow: targetConfig.comparisonWindow || "last_90_days" };
}

export function calculateServiceCoverage(signals: {
  activeAutomations: number;
  activeScheduledTasks: number;
  activeGoalRuns: number;
  manualWorkLast30Days: number;
  reportCount: number;
  servicesTracked: string[];
}): ScoreSummary {
  const expected = Math.max(2, signals.servicesTracked.length + 1);
  const covered = Math.min(expected, signals.activeAutomations + signals.activeScheduledTasks + signals.activeGoalRuns + signals.manualWorkLast30Days + signals.reportCount);
  const score = Math.round((covered / expected) * 100);
  const status: ClientPulseScoreStatus = score >= 80 ? "good" : score >= 50 ? "watch" : "risk";
  return { score, status, label: "Service coverage", reasons: [`${covered}/${expected} servicing signals active`] };
}

export function calculateNeglectRisk(
  signals: { lastMeaningfulActivityAt: string | null; overdueItems?: number; missingReport?: boolean },
  thresholds: { warningDays: number; criticalDays: number },
  now: Date,
): ScoreSummary {
  if (!signals.lastMeaningfulActivityAt) {
    return { score: 0, status: "risk", label: "No meaningful activity", reasons: ["No recent activity, ledger, process or goal signal found"] };
  }
  const ageDays = Math.floor((now.getTime() - new Date(signals.lastMeaningfulActivityAt).getTime()) / DAY_MS);
  const penalties = (signals.overdueItems ?? 0) * 10 + (signals.missingReport ? 10 : 0);
  const freshnessScore = Math.max(0, 100 - Math.max(0, ageDays - thresholds.warningDays) * 4 - penalties);
  const status: ClientPulseScoreStatus = ageDays >= thresholds.criticalDays || freshnessScore < 45 ? "risk" : ageDays >= thresholds.warningDays || freshnessScore < 75 ? "watch" : "good";
  return { score: Math.round(freshnessScore), status, label: `${ageDays}d since activity`, reasons: [`Last meaningful activity ${ageDays} days ago`] };
}

/**
 * MoM/YoY organic trend from calendar-month GSC snapshots. Uses the latest
 * COMPLETE month (current in-progress month is excluded), compared against the
 * previous month and the same month one year earlier.
 */
export function calculateOrganicTrend(monthlySnapshots: PlainRecord[], now: Date): OrganicTrend {
  const currentMonthKey = monthKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const byMonth = new Map<string, PlainRecord>();
  for (const snapshot of monthlySnapshots) {
    const start = stringValue(snapshot.periodStart);
    const key = start.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key) || key >= currentMonthKey) continue;
    if (!byMonth.has(key)) byMonth.set(key, snapshot);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
  const latestMonth = months[0];
  if (!latestMonth) return { month: null, clicks: null, impressions: null, momPercent: null, yoyPercent: null };
  const latest = byMonth.get(latestMonth);
  const clicks = latest ? numberValue(latest.totalClicks) : null;
  const impressions = latest ? numberValue(latest.totalImpressions) : null;
  const prev = byMonth.get(shiftMonth(latestMonth, -1));
  const lastYear = byMonth.get(shiftMonth(latestMonth, -12));
  return {
    month: latestMonth,
    clicks,
    impressions,
    momPercent: percentChange(clicks, prev ? numberValue(prev.totalClicks) : null),
    yoyPercent: percentChange(clicks, lastYear ? numberValue(lastYear.totalClicks) : null),
  };
}

/**
 * MoM Google Ads trend from calendar-month campaign snapshots (dateRangeLabel
 * "MONTH_YYYY-MM", written by the ads snapshot cron). Sums campaign rows per
 * month for clicks, conversions and spend; CPA = spend / conversions.
 */
export function calculateAdsTrend(adsSnapshots: PlainRecord[], now: Date): AdsTrend {
  const empty: AdsTrend = { month: null, clicks: null, conversions: null, cpa: null, clicksMomPercent: null, conversionsMomPercent: null, cpaMomPercent: null, mtdMonth: null, mtdClicks: null, mtdConversions: null, mtdClicksYoyPercent: null, mtdConversionsYoyPercent: null };
  const currentMonthKey = monthKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const byMonth = new Map<string, PlainRecord>();
  const byMtd = new Map<string, PlainRecord>();
  const byMtdLastYear = new Map<string, PlainRecord>();
  for (const snapshot of adsSnapshots) {
    const label = stringValue(snapshot.dateRangeLabel);
    if (label.startsWith("MTD_LY_")) {
      const key = label.slice(7);
      if (/^\d{4}-\d{2}$/.test(key) && !stringValue(snapshot.error) && !byMtdLastYear.has(key)) byMtdLastYear.set(key, snapshot);
      continue;
    }
    if (label.startsWith("MTD_")) {
      const key = label.slice(4);
      if (/^\d{4}-\d{2}$/.test(key) && !stringValue(snapshot.error) && !byMtd.has(key)) byMtd.set(key, snapshot);
      continue;
    }
    if (!label.startsWith("MONTH_")) continue;
    const key = label.slice(6);
    if (!/^\d{4}-\d{2}$/.test(key) || key >= currentMonthKey || stringValue(snapshot.error)) continue;
    if (!byMonth.has(key)) byMonth.set(key, snapshot);
  }
  const totalsForSnapshot = (snapshot: PlainRecord): { clicks: number; conversions: number; cpa: number | null } => {
    const rows = arrayRecords(snapshot.rows);
    const clicks = sumRows(rows, "clicks");
    const conversions = sumRows(rows, "conversions");
    const spend = sumRows(rows, "spend") + sumRows(rows, "costMicros") / 1_000_000;
    return { clicks, conversions, cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : null };
  };
  const totals = (key: string): { clicks: number; conversions: number; cpa: number | null } | null => {
    const snapshot = byMonth.get(key);
    return snapshot ? totalsForSnapshot(snapshot) : null;
  };
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
  const latestMonth = months[0] ?? null;
  const latest = latestMonth ? totals(latestMonth) : null;
  const previous = latestMonth ? totals(shiftMonth(latestMonth, -1)) : null;
  const currentMtdKey = monthKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const mtd = byMtd.get(currentMtdKey);
  const mtdLy = byMtdLastYear.get(currentMtdKey);
  const mtdTotals = mtd ? totalsForSnapshot(mtd) : null;
  const mtdLyTotals = mtdLy ? totalsForSnapshot(mtdLy) : null;
  return {
    month: latestMonth,
    clicks: latest?.clicks ?? null,
    conversions: latest?.conversions ?? null,
    cpa: latest?.cpa ?? null,
    clicksMomPercent: percentChange(latest?.clicks ?? null, previous?.clicks ?? null),
    conversionsMomPercent: percentChange(latest?.conversions ?? null, previous?.conversions ?? null),
    cpaMomPercent: percentChange(latest?.cpa ?? null, previous?.cpa ?? null),
    mtdMonth: mtdTotals ? currentMtdKey : null,
    mtdClicks: mtdTotals?.clicks ?? null,
    mtdConversions: mtdTotals?.conversions ?? null,
    mtdClicksYoyPercent: percentChange(mtdTotals?.clicks ?? null, mtdLyTotals?.clicks ?? null),
    mtdConversionsYoyPercent: percentChange(mtdTotals?.conversions ?? null, mtdLyTotals?.conversions ?? null),
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number): string {
  const [year = 0, month = 0] = key.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  return monthKey(Math.floor(total / 12), (total % 12 + 12) % 12 + 1);
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function calculateOrganicScore(latest: PlainRecord | undefined, previous?: PlainRecord, servicesTracked: string[] = [], trend?: OrganicTrend): ScoreSummary {
  if (!servicesTracked.some((service) => ["organic", "seo", "content"].includes(service))) {
    return { score: null, status: "not_in_scope", label: "Organic not tracked", reasons: ["Organic/SEO not selected for Client Pulse"] };
  }
  // Preferred path: monthly GSC trend — MoM drives the score, YoY adds context.
  if (trend?.month && trend.clicks !== null && trend.momPercent !== null) {
    const change = trend.momPercent;
    const score = Math.max(0, Math.min(100, Math.round(70 + change)));
    const status: ClientPulseScoreStatus = change >= 5 ? "good" : change >= -10 ? "watch" : "risk";
    const reasons = [`Organic clicks ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% MoM (${trend.month})`];
    if (trend.yoyPercent !== null) reasons.push(`${trend.yoyPercent >= 0 ? "+" : ""}${trend.yoyPercent}% YoY`);
    return { score, status, label: `${change >= 0 ? "+" : ""}${Math.round(change)}% MoM`, reasons };
  }
  if (!latest) return { score: null, status: "missing", label: "Organic missing", reasons: ["No organic growth snapshot found"] };
  const latestClicks = metricFromSnapshot(latest, "clicks");
  const previousClicks = previous ? metricFromSnapshot(previous, "clicks") : null;
  if (latestClicks === null) return { score: null, status: "missing", label: "Organic missing", reasons: ["Latest organic snapshot has no clicks"] };
  if (previousClicks === null || previousClicks === 0) return { score: 70, status: "watch", label: "Organic baseline", reasons: ["No previous organic snapshot for comparison"] };
  const change = ((latestClicks - previousClicks) / previousClicks) * 100;
  const score = Math.max(0, Math.min(100, Math.round(70 + change)));
  const status: ClientPulseScoreStatus = change >= 5 ? "good" : change >= -10 ? "watch" : "risk";
  return { score, status, label: `${Math.round(change)}% organic clicks`, reasons: [`Organic clicks ${change >= 0 ? "up" : "down"} ${Math.abs(Math.round(change))}% vs previous snapshot`] };
}

export function calculatePaidSearchScore(snapshots: PlainRecord[] | PlainRecord | undefined, client?: PlainRecord, servicesTracked: string[] = []): ScoreSummary {
  if (!servicesTracked.some((service) => ["paid_search", "google_ads"].includes(service)) && !clientHasGoogleAds(client)) {
    return { score: null, status: "not_in_scope", label: "Paid search not tracked", reasons: ["Paid search not selected for Client Pulse"] };
  }
  const list = Array.isArray(snapshots) ? snapshots : snapshots ? [snapshots] : [];
  if (list.length === 0) return { score: null, status: "missing", label: "Paid data missing", reasons: ["No Google Ads snapshot found"] };
  if (list.some((snapshot) => stringValue(snapshot.error))) return { score: 35, status: "risk", label: "Paid sync error", reasons: ["Latest Google Ads snapshot has an error"] };
  const rows = list.flatMap((snapshot) => arrayRecords(snapshot.rows));
  if (rows.length === 0) return { score: 50, status: "watch", label: "Paid data empty", reasons: ["Google Ads snapshots contain no rows"] };
  const conversions = sumRows(rows, "conversions");
  const costMicros = sumRows(rows, "costMicros");
  const cpa = conversions > 0 ? costMicros / 1_000_000 / conversions : null;
  const score = conversions > 0 ? 80 : 55;
  return { score, status: conversions > 0 ? "good" : "watch", label: cpa ? `$${Math.round(cpa)} CPA` : "Paid active", reasons: [`${Math.round(conversions)} conversions in latest paid snapshot`] };
}

async function fetchAllPages(payload: PayloadLike, args: PlainRecord): Promise<PlainRecord[]> {
  const docs: PlainRecord[] = [];
  let page = 1;
  for (;;) {
    const result = await payload.find({ overrideAccess: true, ...args, page });
    docs.push(...(result.docs ?? []).map(recordValue));
    if (!result.hasNextPage || !result.nextPage) break;
    page = result.nextPage;
  }
  return docs;
}

async function fetchAllPagesWithFallback(payload: PayloadLike, args: PlainRecord, fallbackArgs: PlainRecord): Promise<PlainRecord[]> {
  try {
    return await fetchAllPages(payload, args);
  } catch (error) {
    if (!isMissingClientPulseAnalyticsTableError(error)) throw error;
    return fetchAllPages(payload, fallbackArgs);
  }
}

function clientPulseClientSelect(includeAnalyticsMetrics: boolean): PlainRecord {
  return {
    id: true,
    name: true,
    slug: true,
    logoThumbUrl: true,
    services: true,
    googleAdsCustomerId: true,
    clientPulse: {
      priority: true,
      comparisonWindow: true,
      primaryTarget: true,
      targetLabel: true,
      targetValue: true,
      targetUnit: true,
      targetDirection: true,
      servicesTracked: true,
      ...(includeAnalyticsMetrics ? { analyticsMetrics: true } : {}),
      neglectWarningDays: true,
      neglectCriticalDays: true,
      notes: true,
    },
    gadsAuto: {
      dashboardEnabled: true,
      negativeSweepEnabled: true,
      matchTypeMonitorEnabled: true,
      performanceReportEnabled: true,
      weeklyReport: {
        weeklyReportEnabled: true,
      },
    },
    seoAuto: {
      monthlyHealthEnabled: true,
    },
    serpMonitor: {
      enabled: true,
    },
    coreUpdateReviewEnabled: true,
  };
}

function isMissingClientPulseAnalyticsTableError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("clients_client_pulse_analytics_metrics");
}

function emptySources(clients: PlainRecord[]): ClientPulseSources {
  return { clients, scheduledTasks: [], goalRuns: [], activityLog: [], ledgerItems: [], clientProcesses: [], organicSnapshots: [], gscMonthlySnapshots: [], googleAdsSnapshots: [], siteHealthReports: [], aiVisibilitySnapshots: [] };
}

function groupByClient(records: PlainRecord[], allowed: Set<string>, dateField: string, includeClientsCovered = false): Map<string, PlainRecord[]> {
  const grouped = new Map<string, PlainRecord[]>();
  for (const record of records) {
    const ids = new Set<string>();
    const primary = normalizeId(record.client);
    if (primary) ids.add(primary);
    if (includeClientsCovered) {
      for (const covered of relationshipArray(record.clientsCovered)) ids.add(String(covered.id));
    }
    for (const id of ids) {
      if (!allowed.has(id)) continue;
      const existing = grouped.get(id) ?? [];
      existing.push(record);
      grouped.set(id, existing);
    }
  }
  for (const [id, items] of grouped.entries()) grouped.set(id, stableRecords(items, dateField));
  return grouped;
}

function filterRecordsByClient(records: PlainRecord[], clientIds: string[]): PlainRecord[] {
  const allowed = new Set(clientIds);
  return records.filter((record) => {
    const id = normalizeId(record.client);
    if (id && allowed.has(id)) return true;
    return relationshipArray(record.clientsCovered).some((client) => allowed.has(String(client.id)));
  });
}

function normalizeId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const record = recordValue(value);
  if (typeof record.id === "string" || typeof record.id === "number") return String(record.id);
  return "";
}

function recordValue(value: unknown): PlainRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as PlainRecord) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function relationshipArray(value: unknown): Array<{ id: number | string; name?: string | null; email?: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" || typeof item === "number") return [{ id: item }];
    const record = recordValue(item);
    const id = record.id;
    if (typeof id !== "string" && typeof id !== "number") return [];
    return [{ id, name: stringValue(record.name) || null, email: stringValue(record.email) || null }];
  });
}

function mapClientServices(services: string[]): string[] {
  return services.map((service) => (service === "google_ads" ? "paid_search" : service === "seo" ? "organic" : service));
}

function firstForClient(grouped: Map<string, PlainRecord[]>, id: string, index: number): PlainRecord | undefined {
  return grouped.get(id)?.[index];
}

function stableRecords(records: PlainRecord[], dateField: string): PlainRecord[] {
  return [...records].sort((a, b) => (stringValue(b[dateField]) || stringValue(b.updatedAt) || stringValue(b.createdAt)).localeCompare(stringValue(a[dateField]) || stringValue(a.updatedAt) || stringValue(a.createdAt)) || normalizeId(a.id).localeCompare(normalizeId(b.id)));
}

function latestDate(values: string[]): string | null {
  const sorted = values.filter(Boolean).sort((a, b) => b.localeCompare(a));
  return sorted[0] ?? null;
}

function deriveMetrics(latestOrganic: PlainRecord | undefined, adsSnapshots: PlainRecord[], analyticsSnapshot?: PlainRecord, organicTrend?: OrganicTrend): Record<string, number | null> {
  const rows = adsSnapshots.flatMap((snapshot) => arrayRecords(snapshot.rows));
  const paidConversions = sumRows(rows, "conversions");
  const cost = sumRows(rows, "costMicros") / 1_000_000;
  const paidRevenue = sumRows(rows, "conversionValue");
  // Last full calendar month of GSC clicks beats the coarser quarterly snapshot.
  const organicClicks = organicTrend?.clicks ?? (latestOrganic ? metricFromSnapshot(latestOrganic, "clicks") : null);
  const analyticsTraffic = analyticsSnapshot ? metricFromSnapshot(analyticsSnapshot, "totalSessions") : null;
  const analyticsConversions = analyticsSnapshot ? metricFromSnapshot(analyticsSnapshot, "totalConversions") : null;
  const analyticsRevenue = analyticsSnapshot ? metricFromSnapshot(analyticsSnapshot, "conversionValue") : null;
  const conversions = analyticsConversions ?? (paidConversions || null);
  const revenue = analyticsRevenue ?? (paidRevenue || null);
  return {
    cpa: conversions && conversions > 0 ? cost / conversions : null,
    roas: cost > 0 && revenue !== null ? revenue / cost : null,
    traffic: analyticsTraffic ?? organicClicks,
    conversions,
    organic_clicks: organicClicks,
    paid_conversions: paidConversions || null,
    revenue,
    custom: null,
  };
}

function metricFromSnapshot(snapshot: PlainRecord, key: string): number | null {
  const direct = numberValue(snapshot[key]);
  if (direct !== null) return direct;
  const metrics = recordValue(snapshot.metrics);
  return numberValue(metrics[key]);
}

function arrayRecords(value: unknown): PlainRecord[] {
  return Array.isArray(value) ? value.map(recordValue).filter((record) => Object.keys(record).length > 0) : [];
}

function sumRows(rows: PlainRecord[], key: string): number {
  return rows.reduce((sum, row) => sum + (numberValue(row[key]) ?? 0), 0);
}

function automationSignalItems(client: PlainRecord, servicesTracked: string[]): SignalItem[] {
  const gads = recordValue(client.gadsAuto);
  const seo = recordValue(client.seoAuto);
  const signals: SignalItem[] = [];
  const add = (id: string, label: string, enabled: boolean, inScope = true): void => {
    signals.push({ id, label, status: inScope ? (enabled ? "good" : "missing") : "not_in_scope", detail: enabled ? "Enabled" : "Not enabled" });
  };
  const paidScope = servicesTracked.includes("paid_search") || clientHasGoogleAds(client);
  add("gads-dashboard", "Google Ads dashboard", gads.dashboardEnabled === true, paidScope);
  add("negative-sweep", "Negative keyword sweep", gads.negativeSweepEnabled === true, paidScope);
  add("match-type-monitor", "Match type monitor", gads.matchTypeMonitorEnabled === true, paidScope);
  add("gads-report", "Paid performance report", gads.performanceReportEnabled === true || recordValue(gads.weeklyReport).weeklyReportEnabled === true, paidScope);
  const organicScope = servicesTracked.some((service) => ["organic", "seo", "content"].includes(service));
  add("seo-health", "Monthly SEO health", seo.monthlyHealthEnabled === true, organicScope);
  add("serp-monitor", "SERP monitor", recordValue(client.serpMonitor).enabled === true, organicScope);
  add("core-update", "Core update review", client.coreUpdateReviewEnabled === true, organicScope);
  return signals;
}

function taskStatus(task: PlainRecord): ClientPulseScoreStatus {
  const status = stringValue(task.lastRunStatus);
  if (["failed", "error"].includes(status)) return "risk";
  if (task.isActive === false) return "watch";
  return "good";
}

function goalStatus(run: PlainRecord): ClientPulseScoreStatus {
  const status = stringValue(run.status);
  if (["failed", "blocked"].includes(status) || stringValue(run.tier) === "red") return "risk";
  if (stringValue(run.tier) === "yellow" || status === "pending_approval") return "watch";
  return "good";
}

function signalFromRecord(record: PlainRecord, prefix: string, label: string, status: ClientPulseScoreStatus, detail?: string, at?: string | null): SignalItem {
  return { id: `${prefix}-${normalizeId(record.id) || label}`, label, status, detail, at: at ?? null };
}

function reportSignalItems(siteReports: PlainRecord[], organicSnapshots: PlainRecord[], client: PlainRecord): SignalItem[] {
  const gads = recordValue(client.gadsAuto);
  const items: SignalItem[] = [];
  items.push(siteReports[0] ? signalFromRecord(siteReports[0], "site-health", "Site health report", "good", stringValue(siteReports[0].auditStatus), stringValue(siteReports[0].reportDate)) : { id: "site-health-missing", label: "Site health report", status: "missing", detail: "No report found" });
  items.push(organicSnapshots[0] ? signalFromRecord(organicSnapshots[0], "organic-report", "Organic growth snapshot", "good", undefined, stringValue(organicSnapshots[0].snapshotDate)) : { id: "organic-snapshot-missing", label: "Organic growth snapshot", status: "missing", detail: "No snapshot found" });
  items.push({ id: "paid-report-config", label: "Paid report automation", status: gads.performanceReportEnabled === true || recordValue(gads.weeklyReport).weeklyReportEnabled === true ? "good" : "missing", detail: "Google Ads report config" });
  return items;
}

function qbrSignalItems(ledger: PlainRecord[], activity: PlainRecord[]): SignalItem[] {
  const qbr = [...ledger, ...activity].find((item) => /\b(qbr|quarterly business review)\b/i.test(`${stringValue(item.title)} ${stringValue(item.summary)} ${stringValue(item.type)}`));
  return qbr ? [signalFromRecord(qbr, "qbr", "QBR signal", "good", stringValue(qbr.title), stringValue(qbr.occurredAt) || stringValue(qbr.createdAt))] : [{ id: "qbr-missing", label: "QBR signal", status: "missing", detail: "No QBR signal in recent activity" }];
}

function negativeKeywordSignalItems(activity: PlainRecord[], client: PlainRecord): SignalItem[] {
  const recent = activity.find((item) => NEGATIVE_KEYWORD_ACTIVITY_TYPES.has(stringValue(item.type)));
  const enabled = recordValue(client.gadsAuto).negativeSweepEnabled === true;
  if (recent) return [signalFromRecord(recent, "negative-keyword", "Negative keyword activity", "good", stringValue(recent.type), stringValue(recent.createdAt))];
  return [{ id: "negative-keyword-config", label: "Negative keyword activity", status: enabled ? "watch" : "missing", detail: enabled ? "Automation enabled; no recent activity" : "Negative sweep not enabled" }];
}

function calculateOverallScore(scores: ScoreSummary[]): ScoreSummary {
  const numeric = scores.filter((score) => typeof score.score === "number") as Array<ScoreSummary & { score: number }>;
  const score = numeric.length > 0 ? Math.round(numeric.reduce((sum, item) => sum + item.score, 0) / numeric.length) : null;
  const status: ClientPulseScoreStatus = scores.some((item) => item.status === "risk") ? "risk" : scores.some((item) => item.status === "watch" || item.status === "missing") ? "watch" : "good";
  return { score, status, label: "Overall pulse", reasons: scores.flatMap((item) => item.reasons).slice(0, 4) };
}

function targetReasons(target: ClientPulseSummary["target"]): string[] {
  if (target.status === "not_configured") return ["Primary target is not configured"];
  if (target.status === "missing_data") return [`${target.label} data is missing`];
  if (target.status === "at_risk") return [`${target.label} is below target`];
  return [];
}

function labelForTarget(metric: string): string {
  if (metric === "cpa") return "CPA";
  if (metric === "roas") return "ROAS";
  return metric.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function selectedAnalyticsMetrics(pulse: PlainRecord): string[] {
  const selected = stringArray(pulse.analyticsMetrics).filter((metric) => ANALYTICS_METRIC_OPTIONS.has(metric));
  return selected.length > 0 ? selected : DEFAULT_ANALYTICS_METRICS;
}

function formatMetricValue(metric: string, value: number | null): string {
  if (value === null) return "—";
  if (metric === "cpa") return `$${Math.round(value)}`;
  if (metric === "roas") return `${value.toFixed(1)}x`;
  if (metric === "revenue") return `$${Math.round(value).toLocaleString("en-AU")}`;
  return Math.round(value).toLocaleString("en-AU");
}

function targetDirection(value: unknown): ClientPulseTargetDirection {
  return value === "decrease" || value === "maintain" ? value : "increase";
}

function clientHasGoogleAds(client?: PlainRecord): boolean {
  return !!client && (stringValue(client.googleAdsCustomerId) !== "" || stringArray(client.services).includes("google_ads"));
}

function sortSummary(a: ClientPulseSummary, b: ClientPulseSummary): number {
  const riskRank: Record<ClientPulseScoreStatus, number> = { risk: 0, watch: 1, missing: 2, good: 3, not_in_scope: 4 };
  return riskRank[a.scores.overall.status] - riskRank[b.scores.overall.status] || a.client.name.localeCompare(b.client.name);
}
