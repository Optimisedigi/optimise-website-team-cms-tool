/**
 * Collapse one bulk operation (a script run, an auto-applied recommendation
 * touching every keyword) into one feed row.
 *
 * Google writes a separate change_event per resource, so a script that cuts
 * 114 keyword bids produces 114 identical-looking rows. Events are grouped
 * when they share the account, source, resource type, operation, changed
 * fields and exact change timestamp — i.e. they came from the same batch.
 *
 * Pure: no network or Payload, so it is unit-tested directly.
 */

import { sourceLabel, summariseChangeEvent } from "./summarise";

export interface GroupableEvent {
  id: number;
  client?: unknown;
  customerId?: string | null;
  changeDateTime?: string | null;
  changeResourceType?: string | null;
  resourceChangeOperation?: string | null;
  clientType?: string | null;
  userEmail?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  changedFields?: unknown;
  oldValues?: unknown;
  newValues?: unknown;
  isGoogleAutomated?: boolean | null;
  reviewStatus?: string | null;
  impact?: {
    spendBefore?: number | null;
    spendAfter?: number | null;
    convBefore?: number | null;
    convAfter?: number | null;
    computedAt?: string | null;
  } | null;
}

export interface GroupedEvent {
  /** Representative (first) event id; flagging uses it as the primary. */
  id: number;
  eventIds: number[];
  count: number;
  client: unknown;
  customerId: string | null;
  changeDateTime: string | null;
  changeResourceType: string | null;
  clientType: string | null;
  campaignName: string | null;
  summary: string;
  isGoogleAutomated: boolean;
  reviewStatus: string;
  impact: GroupableEvent["impact"];
}

const PLURAL_LABELS: Record<string, string> = {
  CAMPAIGN: "campaigns",
  CAMPAIGN_BUDGET: "campaign budgets",
  CAMPAIGN_CRITERION: "campaign targeting settings",
  CAMPAIGN_BID_MODIFIER: "campaign bid modifiers",
  AD_GROUP: "ad groups",
  AD_GROUP_CRITERION: "keywords",
  AD_GROUP_BID_MODIFIER: "ad group bid modifiers",
  AD_GROUP_AD: "ads",
  AD: "ads",
  ASSET: "assets",
  FEED: "feeds",
  FEED_ITEM: "feed items",
  BIDDING_STRATEGY: "bid strategies",
  CUSTOMER_ASSET: "account assets",
};

const FIELD_LABELS: Record<string, string> = {
  cpcbidmicros: "max CPC bid",
  cpmbidmicros: "max CPM bid",
  cpvbidmicros: "max CPV bid",
  targetcpamicros: "target CPA",
  amountmicros: "budget",
};

function fieldsOf(event: GroupableEvent): string[] {
  return Array.isArray(event.changedFields)
    ? event.changedFields.filter((f): f is string => typeof f === "string").sort()
    : [];
}

function clientKey(client: unknown): string {
  if (client && typeof client === "object" && "id" in client) return String((client as { id: unknown }).id);
  return client === null || client === undefined ? "" : String(client);
}

function groupKey(event: GroupableEvent): string {
  return JSON.stringify([
    clientKey(event.client),
    event.customerId || "",
    event.changeDateTime || "",
    (event.clientType || "").toUpperCase(),
    (event.changeResourceType || "").toUpperCase(),
    (event.resourceChangeOperation || "").toUpperCase(),
    event.userEmail || "",
    fieldsOf(event),
  ]);
}

function leaf(field: string): string {
  return field.split(".").pop() || field;
}

/** Same wrapper-tolerant lookup as summarise.ts, for a single leaf field. */
function readLeaf(source: unknown, field: string): unknown {
  if (source === null || typeof source !== "object") return undefined;
  const name = leaf(field);
  const record = source as Record<string, unknown>;
  if (name in record) return record[name];
  const keys = Object.keys(record);
  if (keys.length !== 1) return undefined;
  const inner = record[keys[0] as string];
  if (inner === null || typeof inner !== "object") return undefined;
  return (inner as Record<string, unknown>)[name];
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function fieldLabel(field: string): string {
  const key = leaf(field).replace(/_/g, "").toLowerCase();
  return FIELD_LABELS[key] || leaf(field).replace(/_?micros$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** "max CPC bid lowered by 25%" / "max CPC bid lowered on 80, raised on 34". */
function describeNumericBatch(events: GroupableEvent[], field: string): string | null {
  let lowered = 0;
  let raised = 0;
  let unchanged = 0;
  const pcts = new Set<number>();
  for (const event of events) {
    const before = toNumber(readLeaf(event.oldValues, field));
    const after = toNumber(readLeaf(event.newValues, field));
    if (before === null || after === null) return null;
    if (after < before) lowered++;
    else if (after > before) raised++;
    else unchanged++;
    if (before > 0) pcts.add(Math.round(((after - before) / before) * 100));
    else pcts.add(Number.NaN);
  }
  const label = fieldLabel(field);
  const onlyPct = pcts.size === 1 ? [...pcts][0] : undefined;
  if (onlyPct !== undefined && Number.isFinite(onlyPct) && onlyPct !== 0) {
    return `${label} ${onlyPct < 0 ? "lowered" : "raised"} by ${Math.abs(onlyPct)}%`;
  }
  const parts: string[] = [];
  if (lowered) parts.push(`lowered on ${lowered}`);
  if (raised) parts.push(`raised on ${raised}`);
  if (unchanged) parts.push(`unchanged on ${unchanged}`);
  return parts.length ? `${label} ${parts.join(", ")}` : null;
}

function operationVerb(op: string | null | undefined): string {
  switch ((op || "").toUpperCase()) {
    case "CREATE":
      return "created";
    case "REMOVE":
      return "removed";
    case "UPDATE":
      return "updated";
    default:
      return "changed";
  }
}

export function summariseBatch(events: GroupableEvent[]): string {
  const first = events[0];
  if (!first) return "";
  if (events.length === 1) {
    return summariseChangeEvent({
      changeResourceType: first.changeResourceType,
      resourceChangeOperation: first.resourceChangeOperation,
      clientType: first.clientType,
      campaignName: first.campaignName,
      changedFields: fieldsOf(first),
      oldValues: first.oldValues,
      newValues: first.newValues,
    });
  }

  const type = (first.changeResourceType || "").toUpperCase();
  const noun = PLURAL_LABELS[type] || (type ? `${type.toLowerCase().replace(/_/g, " ")} items` : "items");
  const campaigns = new Set(events.map((e) => e.campaignName || ""));
  const onlyCampaign = campaigns.size === 1 ? [...campaigns][0] : "";
  const where = onlyCampaign ? ` on ${onlyCampaign}` : "";

  const fields = fieldsOf(first);
  let detail = "";
  if (fields.length === 1 && fields[0] !== undefined && /micros$/i.test(leaf(fields[0]).replace(/_/g, ""))) {
    detail = describeNumericBatch(events, fields[0]) || "";
  } else if (fields.length > 0) {
    detail = fields.map(leaf).join(", ");
  }

  const base = `${sourceLabel(first.clientType)} ${operationVerb(first.resourceChangeOperation)} ${events.length} ${noun}${where}`;
  return detail ? `${base} (${detail}).` : `${base}.`;
}

/**
 * Batch impact: impact is per campaign, so take one figure per distinct
 * campaign and sum. Pending unless every campaign's figure is computed.
 */
function batchImpact(events: GroupableEvent[]): GroupableEvent["impact"] {
  const first = events[0];
  if (!first) return null;
  if (events.length === 1) return first.impact ?? null;
  const perCampaign = new Map<string, GroupableEvent>();
  for (const event of events) {
    const key = event.campaignId || "";
    if (!perCampaign.has(key)) perCampaign.set(key, event);
  }
  const reps = [...perCampaign.values()];
  if (reps.some((e) => !e.impact?.computedAt)) return null;
  const sum = (pick: (i: NonNullable<GroupableEvent["impact"]>) => number | null | undefined) =>
    reps.reduce((total, e) => total + (e.impact ? pick(e.impact) ?? 0 : 0), 0);
  return {
    spendBefore: sum((i) => i.spendBefore),
    spendAfter: sum((i) => i.spendAfter),
    convBefore: sum((i) => i.convBefore),
    convAfter: sum((i) => i.convAfter),
    computedAt: reps.map((e) => e.impact?.computedAt || "").sort().pop() || null,
  };
}

/** Group events, preserving the input order of each group's first event. */
export function groupAutomationEvents(events: GroupableEvent[]): GroupedEvent[] {
  const groups = new Map<string, GroupableEvent[]>();
  for (const event of events) {
    const key = groupKey(event);
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  const out: GroupedEvent[] = [];
  for (const members of groups.values()) {
    const first = members[0];
    if (!first) continue;
    out.push({
      id: first.id,
      eventIds: members.map((e) => e.id),
      count: members.length,
      client: first.client ?? null,
      customerId: first.customerId ?? null,
      changeDateTime: first.changeDateTime ?? null,
      changeResourceType: first.changeResourceType ?? null,
      clientType: first.clientType ?? null,
      campaignName: new Set(members.map((e) => e.campaignName || "")).size === 1 ? first.campaignName ?? null : null,
      summary: summariseBatch(members),
      isGoogleAutomated: Boolean(first.isGoogleAutomated),
      reviewStatus: members.every((e) => e.reviewStatus === "flagged")
        ? "flagged"
        : members.find((e) => e.reviewStatus !== "flagged")?.reviewStatus || "unreviewed",
      impact: batchImpact(members),
    });
  }
  return out;
}
