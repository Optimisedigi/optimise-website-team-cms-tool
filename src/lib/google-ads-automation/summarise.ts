/**
 * Pure classification + wording for Google Ads change_event rows.
 *
 * Kept free of network and Payload so it can be unit-tested directly.
 */

/**
 * `change_event.client_type` values that mean "Google changed this, nobody on
 * our team did". Everything else (notably GOOGLE_ADS_API — our own mutations —
 * and GOOGLE_ADS_WEB_CLIENT — a human in the Ads UI) is still stored, just not
 * shown by default.
 */
export const GOOGLE_AUTOMATION_CLIENT_TYPES = new Set([
  "GOOGLE_ADS_RECOMMENDATIONS",
  "GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION",
  "GOOGLE_ADS_AUTOMATED_RULE",
  "GOOGLE_ADS_SCRIPTS",
  "INTERNAL_TOOL",
  "OTHER",
]);

export function isGoogleAutomated(clientType: string | undefined | null): boolean {
  return GOOGLE_AUTOMATION_CLIENT_TYPES.has((clientType || "").toUpperCase());
}

/** Human label for a client_type, for the "who did it" column. */
export function sourceLabel(clientType: string | undefined | null): string {
  switch ((clientType || "").toUpperCase()) {
    case "GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION":
      return "Google auto-applied recommendation";
    case "GOOGLE_ADS_RECOMMENDATIONS":
      return "Google recommendation";
    case "GOOGLE_ADS_AUTOMATED_RULE":
      return "Google automated rule";
    case "GOOGLE_ADS_SCRIPTS":
      return "Google Ads script";
    case "GOOGLE_ADS_API":
      return "Our tooling (API)";
    case "GOOGLE_ADS_WEB_CLIENT":
      return "A person in the Ads UI";
    case "INTERNAL_TOOL":
      return "Google internal tool";
    case "":
      return "Unknown source";
    default:
      return "Uncategorised source";
  }
}

const RESOURCE_LABELS: Record<string, string> = {
  CAMPAIGN: "campaign",
  CAMPAIGN_BUDGET: "campaign budget",
  CAMPAIGN_CRITERION: "campaign targeting",
  CAMPAIGN_BID_MODIFIER: "campaign bid modifier",
  AD_GROUP: "ad group",
  AD_GROUP_CRITERION: "keyword",
  AD_GROUP_BID_MODIFIER: "ad group bid modifier",
  AD_GROUP_AD: "ad",
  AD: "ad",
  ASSET: "asset",
  FEED: "feed",
  FEED_ITEM: "feed item",
  BIDDING_STRATEGY: "bid strategy",
  CUSTOMER_ASSET: "account asset",
};

function resourceLabel(changeResourceType: string | undefined | null): string {
  const key = (changeResourceType || "").toUpperCase();
  return RESOURCE_LABELS[key] || (key ? key.toLowerCase().replace(/_/g, " ") : "resource");
}

/** "an asset" on create, "the asset" on update/remove. */
function nounPhrase(changeResourceType: string | undefined | null, op: string | undefined | null): string {
  const noun = resourceLabel(changeResourceType);
  if (noun === "campaign targeting") return noun;
  if ((op || "").toUpperCase() === "CREATE") {
    return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
  }
  return `the ${noun}`;
}

function operationVerb(op: string | undefined | null): string {
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

function descend(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    // The API returns snake_case in some transports and camelCase in others.
    const camel = segment.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    if (segment in record) current = record[segment];
    else if (camel in record) current = record[camel];
    else return undefined;
  }
  return current;
}

/**
 * Resolve a `changedFields` mask entry against an old/new resource snapshot.
 * Google sends both fully-qualified masks ("campaign.name") and bare field
 * names ("status") relative to the resource, while the snapshot itself is
 * wrapped in a single resource key ({ adGroup: { status } }) — so try the
 * path as given, then under that wrapper.
 */
function readPath(source: unknown, path: string): unknown {
  const direct = descend(source, path);
  if (direct !== undefined) return direct;
  if (source === null || typeof source !== "object") return undefined;
  const keys = Object.keys(source as Record<string, unknown>);
  if (keys.length !== 1) return undefined;
  const inner = descend((source as Record<string, unknown>)[keys[0]], path);
  if (inner !== undefined) return inner;
  // "campaign.name" against { campaign: { name } } — strip the leading segment.
  const stripped = path.includes(".") ? path.slice(path.indexOf(".") + 1) : "";
  return stripped ? descend((source as Record<string, unknown>)[keys[0]], stripped) : undefined;
}

const OPAQUE_LEAVES = new Set([
  "id",
  "resourceName",
  "resource_name",
  "resourceId",
  "resource_id",
]);

function leaf(field: string): string {
  return field.split(".").pop() || field;
}

function isOpaqueField(field: string): boolean {
  return OPAQUE_LEAVES.has(leaf(field));
}

function isMicrosField(field: string): boolean {
  return /micros$/i.test(leaf(field).replace(/_/g, ""));
}

function moneyFromMicros(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const dollars = n / 1_000_000;
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: dollars % 1 === 0 ? 0 : 2 })}`;
}

function formatHumanValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "unset";
  if (isMicrosField(field)) {
    const money = moneyFromMicros(value);
    if (money) return money;
  }
  if (typeof value === "string") {
    if (/^customers\/\d+\//.test(value)) return "";
    if (/^[A-Z][A-Z0-9_]+$/.test(value)) return value.toLowerCase().replace(/_/g, " ");
    return value;
  }
  if (typeof value === "number") {
    if (value > 1e10) return "";
    return String(value);
  }
  return "";
}

interface FieldChange {
  field: string;
  before?: string;
  after?: string;
  namedOnly?: boolean;
}

function describeFields(input: SummariseInput): FieldChange[] {
  const fields = (input.changedFields || []).filter((f) => typeof f === "string" && f.length > 0 && !isOpaqueField(f));
  const out: FieldChange[] = [];
  for (const field of fields) {
    const before = readPath(input.oldValues, field);
    const after = readPath(input.newValues, field);
    if (before === undefined && after === undefined) {
      out.push({ field, namedOnly: true });
      continue;
    }
    const beforeText = formatHumanValue(field, before);
    const afterText = formatHumanValue(field, after);
    if (!beforeText && !afterText) continue;
    out.push({ field, before: beforeText || "unset", after: afterText || "unset" });
  }
  return out;
}

export interface SummariseInput {
  changeResourceType?: string | null;
  resourceChangeOperation?: string | null;
  clientType?: string | null;
  campaignName?: string | null;
  changedFields?: string[] | null;
  oldValues?: unknown;
  newValues?: unknown;
}

/**
 * One sentence describing a change, e.g.
 * "Google auto-applied recommendation updated the campaign budget on Search — Brand from $50 to $80."
 */
export function summariseChangeEvent(input: SummariseInput): string {
  const who = sourceLabel(input.clientType);
  const noun = nounPhrase(input.changeResourceType, input.resourceChangeOperation);
  const verb = operationVerb(input.resourceChangeOperation);
  const where = input.campaignName ? ` on ${input.campaignName}` : "";
  const changes = describeFields(input);

  if (verb === "created") {
    const named = changes.find((c) => leaf(c.field) === "name" && c.after && c.after !== "unset");
    if (named) return `${who} created ${noun}${where} called ${named.after}.`;
    return `${who} created ${noun}${where}.`;
  }

  const valued = changes.filter((c) => !c.namedOnly);
  if (valued.length === 1) {
    const only = valued[0];
    const name = leaf(only.field).toLowerCase();
    if (name === "name") return `${who} renamed ${noun}${where} from ${only.before} to ${only.after}.`;
    return `${who} ${verb} ${noun}${where} from ${only.before} to ${only.after}.`;
  }

  if (changes.length === 0) return `${who} ${verb} ${noun}${where}.`;

  const shown = changes.slice(0, 3).map((c) => {
    if (c.namedOnly) return leaf(c.field);
    return `${leaf(c.field)} from ${c.before} to ${c.after}`;
  });
  const extra = changes.length > 3 ? `, +${changes.length - 3} more` : "";
  return `${who} ${verb} ${noun}${where} (${shown.join(", ")}${extra}).`;
}
