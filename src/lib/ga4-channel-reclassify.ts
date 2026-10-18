/**
 * Moves sessions out of GA4's "Unassigned" channel bucket into the channel
 * they belong in, using the session's source / medium / campaign. Pure, so
 * the GA4 route and tests share the same rules.
 *
 * Rules, first match wins:
 * - source contains "openai" (ChatGPT ads, e.g. openai / gpt_ads) → Paid AI
 * - source contains "perplexity" → AI Search
 * - no source, medium or campaign set → Direct
 * Anything else stays Unassigned.
 */

/** GA4's bucket for sessions that match no channel rule. */
export const GA4_UNASSIGNED_CHANNEL = "Unassigned";
export const GA4_PAID_AI_CHANNEL = "Paid AI";
export const GA4_AI_SEARCH_CHANNEL = "AI Search";
export const GA4_DIRECT_CHANNEL = "Direct";

export interface Ga4ChannelMonthPoint {
  /** Calendar month as "YYYY-MM". */
  month: string;
  channel: string;
  sessions: number;
}

export interface Ga4UnassignedMonthPoint {
  /** Calendar month as "YYYY-MM". */
  month: string;
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
}

const UNSET_VALUES = new Set(["", "(not set)", "(none)", "(direct)", "not set"]);

function isUnset(value: string): boolean {
  return UNSET_VALUES.has(value.trim().toLowerCase());
}

/** The channel an Unassigned session should be counted in, or null to leave it Unassigned. */
export function channelForUnassigned(source: string, medium: string, campaign: string): string | null {
  const src = source.trim().toLowerCase();
  if (src.includes("openai")) return GA4_PAID_AI_CHANNEL;
  if (src.includes("perplexity")) return GA4_AI_SEARCH_CHANNEL;
  if (isUnset(source) && isUnset(medium) && isUnset(campaign)) return GA4_DIRECT_CHANNEL;
  return null;
}

/**
 * Apply `channelForUnassigned` to the month × channel rows. Sessions moved
 * are taken off that month's Unassigned row (never below zero) and added to
 * the target channel; Unassigned rows left at zero are dropped. Output is
 * sorted by month then channel.
 */
export function reclassifyUnassignedSessions(
  rows: readonly Ga4ChannelMonthPoint[],
  unassigned: readonly Ga4UnassignedMonthPoint[],
): Ga4ChannelMonthPoint[] {
  const totals = new Map<string, number>();
  const key = (month: string, channel: string) => `${month}\u0000${channel}`;
  const add = (month: string, channel: string, sessions: number) =>
    totals.set(key(month, channel), (totals.get(key(month, channel)) ?? 0) + sessions);

  for (const row of rows) add(row.month, row.channel, row.sessions);

  for (const detail of unassigned) {
    const target = channelForUnassigned(detail.source, detail.medium, detail.campaign);
    if (!target || detail.sessions <= 0) continue;
    const available = totals.get(key(detail.month, GA4_UNASSIGNED_CHANNEL)) ?? 0;
    const moved = Math.min(available, detail.sessions);
    if (moved <= 0) continue;
    add(detail.month, GA4_UNASSIGNED_CHANNEL, -moved);
    add(detail.month, target, moved);
  }

  return [...totals.entries()]
    .map(([k, sessions]) => {
      const [month = "", channel = ""] = k.split("\u0000");
      return { month, channel, sessions };
    })
    .filter((r) => r.sessions > 0 || r.channel !== GA4_UNASSIGNED_CHANNEL)
    .sort((a, b) => a.month.localeCompare(b.month) || a.channel.localeCompare(b.channel));
}
