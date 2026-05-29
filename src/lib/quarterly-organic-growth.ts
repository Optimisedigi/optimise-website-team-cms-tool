export interface ScheduleEntry {
  snapshotDate: string;
  snapshotType: "month_1" | "quarterly";
  periodStart: string;
  periodEnd: string;
}

export interface GscLikeSnapshot {
  id?: string | number;
  periodStart?: string | null;
  periodEnd?: string | null;
  snapshotDate?: string | null;
  totalClicks?: number | null;
  totalImpressions?: number | null;
  avgCtr?: number | null;
  avgPosition?: number | null;
  brandedData?: unknown;
  nonBrandedData?: unknown;
  topKeywords?: unknown;
  topPages?: unknown;
}

export interface OrganicMetrics {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  brandClicks: number;
  brandImpressions: number;
  brandCtr: number;
  brandPosition: number;
  nonBrandClicks: number;
  nonBrandImpressions: number;
  nonBrandCtr: number;
  nonBrandPosition: number;
}

export interface OrganicSnapshotBuildInput {
  client: { id: string | number; brandKeywords?: string | null };
  gscSnapshot: GscLikeSnapshot;
  blogPosts?: Array<Record<string, unknown>>;
  internalLinks?: Array<Record<string, unknown>>;
}

export interface ExistingSnapshotLike {
  client?: string | number | { id?: string | number } | null;
  periodEnd?: string | null;
  snapshotType?: string | null;
  sourceGscSnapshot?: string | number | { id?: string | number } | null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function endOfPreviousMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
}

export function getQuarterlySnapshotSchedule(startDate: Date, now: Date): ScheduleEntry[] {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(now.getTime())) return [];
  const start = firstOfMonth(startDate);
  const entries: ScheduleEntry[] = [];
  const monthOneDate = addMonths(start, 1);
  if (monthOneDate <= now) {
    entries.push({
      snapshotDate: isoDate(monthOneDate),
      snapshotType: "month_1",
      periodStart: isoDate(start),
      periodEnd: isoDate(endOfPreviousMonth(monthOneDate)),
    });
  }

  let nextQuarter = addMonths(start, 4);
  while (nextQuarter <= now) {
    entries.push({
      snapshotDate: isoDate(nextQuarter),
      snapshotType: "quarterly",
      periodStart: isoDate(addMonths(nextQuarter, -3)),
      periodEnd: isoDate(endOfPreviousMonth(nextQuarter)),
    });
    nextQuarter = addMonths(nextQuarter, 3);
  }

  return entries;
}

function numberFrom(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function relationId(value: unknown): string | number | null {
  if (value && typeof value === "object" && "id" in value) return (value as { id?: string | number }).id ?? null;
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
}

function parseBrandTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

export function splitBrandNonBrand(snapshot: GscLikeSnapshot, brandKeywords?: string | null): OrganicMetrics {
  const branded = objectValue(snapshot.brandedData);
  const nonBranded = objectValue(snapshot.nonBrandedData);
  const totalClicks = numberFrom(snapshot.totalClicks);
  const totalImpressions = numberFrom(snapshot.totalImpressions);

  if (Object.keys(branded).length > 0 || Object.keys(nonBranded).length > 0) {
    return {
      totalClicks,
      totalImpressions,
      avgCtr: numberFrom(snapshot.avgCtr),
      avgPosition: numberFrom(snapshot.avgPosition),
      brandClicks: numberFrom(branded.clicks),
      brandImpressions: numberFrom(branded.impressions),
      brandCtr: numberFrom(branded.ctr),
      brandPosition: numberFrom(branded.position),
      nonBrandClicks: numberFrom(nonBranded.clicks),
      nonBrandImpressions: numberFrom(nonBranded.impressions),
      nonBrandCtr: numberFrom(nonBranded.ctr),
      nonBrandPosition: numberFrom(nonBranded.position),
    };
  }

  const terms = parseBrandTerms(brandKeywords);
  let brandClicks = 0;
  let brandImpressions = 0;
  for (const row of rows(snapshot.topKeywords)) {
    const query = String(row.keyword ?? row.query ?? "").toLowerCase();
    if (!terms.some((term) => query.includes(term))) continue;
    brandClicks += numberFrom(row.clicks);
    brandImpressions += numberFrom(row.impressions);
  }

  return {
    totalClicks,
    totalImpressions,
    avgCtr: numberFrom(snapshot.avgCtr),
    avgPosition: numberFrom(snapshot.avgPosition),
    brandClicks,
    brandImpressions,
    brandCtr: brandImpressions > 0 ? brandClicks / brandImpressions : 0,
    brandPosition: 0,
    nonBrandClicks: Math.max(0, totalClicks - brandClicks),
    nonBrandImpressions: Math.max(0, totalImpressions - brandImpressions),
    nonBrandCtr: totalImpressions - brandImpressions > 0 ? (totalClicks - brandClicks) / (totalImpressions - brandImpressions) : 0,
    nonBrandPosition: 0,
  };
}

export function buildTopicAssociations(blogPosts: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  const byTopic = new Map<string, Array<Record<string, unknown>>>();
  for (const post of blogPosts) {
    const topic = String(post.topic || post.category || post.title || "General");
    const list = byTopic.get(topic) ?? [];
    list.push(post);
    byTopic.set(topic, list);
  }

  return [...byTopic.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([topic, posts]) => {
    const dates = posts.map((post) => String(post.publishedDate || post.createdAt || "")).filter(Boolean).sort();
    return {
      topic,
      cluster: topic,
      blogPosts: posts.map((post) => post.id).filter(Boolean),
      contentUrls: posts.map((post) => post.url || (post.slug ? `/digital-marketing-growth-hub/${String(post.slug)}` : null)).filter(Boolean),
      publishedCount: posts.length,
      firstPublishedAt: dates[0] ?? null,
      latestPublishedAt: dates[dates.length - 1] ?? null,
      associatedQueries: [],
    };
  });
}

export function snapshotAlreadyExists(
  existingSnapshots: ExistingSnapshotLike[],
  clientId: string | number,
  periodEnd: string,
  snapshotType: string,
  sourceGscSnapshotId?: string | number | null,
): boolean {
  return existingSnapshots.some((snapshot) => {
    const sameClient = relationId(snapshot.client) === clientId;
    const samePeriod = snapshot.periodEnd === periodEnd && snapshot.snapshotType === snapshotType;
    const sameSource = sourceGscSnapshotId != null && relationId(snapshot.sourceGscSnapshot) === sourceGscSnapshotId;
    return sameClient && (samePeriod || sameSource);
  });
}

export function selectDueSnapshot(
  startDate: Date,
  now: Date,
  existingSnapshots: ExistingSnapshotLike[],
  clientId: string | number,
): ScheduleEntry | null {
  const dueEntries = getQuarterlySnapshotSchedule(startDate, now).sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
  for (const due of dueEntries) {
    if (!snapshotAlreadyExists(existingSnapshots, clientId, due.periodEnd, due.snapshotType)) return due;
  }
  return null;
}

export function buildOrganicGrowthSnapshot(input: OrganicSnapshotBuildInput): Record<string, unknown> {
  const organic = splitBrandNonBrand(input.gscSnapshot, input.client.brandKeywords);
  return {
    client: input.client.id,
    snapshotDate: input.gscSnapshot.snapshotDate ?? new Date().toISOString(),
    periodStart: input.gscSnapshot.periodStart,
    periodEnd: input.gscSnapshot.periodEnd,
    snapshotType: "manual",
    organic,
    categories: [],
    topicAssociations: buildTopicAssociations(input.blogPosts),
    workDelivered: (input.blogPosts ?? []).map((post) => ({
      date: post.publishedDate || post.createdAt || new Date().toISOString(),
      type: "blog",
      title: String(post.title || "Published blog post"),
      url: post.slug ? `/digital-marketing-growth-hub/${String(post.slug)}` : undefined,
    })),
    sourceGscSnapshot: input.gscSnapshot.id,
  };
}

export function compareSnapshots(previous: OrganicMetrics, current: OrganicMetrics): Record<string, number> {
  return {
    totalClicks: current.totalClicks - previous.totalClicks,
    totalImpressions: current.totalImpressions - previous.totalImpressions,
    brandClicks: current.brandClicks - previous.brandClicks,
    nonBrandClicks: current.nonBrandClicks - previous.nonBrandClicks,
    nonBrandImpressions: current.nonBrandImpressions - previous.nonBrandImpressions,
  };
}
