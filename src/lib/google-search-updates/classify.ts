export type SearchUpdateKind = "core" | "spam" | "discover" | "serving" | "other";

/** Ranking algorithm updates the Watchtower highlights by default. */
export const RANKING_KINDS: SearchUpdateKind[] = ["core", "spam", "discover"];

export function classifySearchIncident(title: string, serviceName?: string): SearchUpdateKind {
  const haystack = `${title} ${serviceName || ""}`.toLowerCase();
  if (/\bdiscover\b/.test(haystack)) return "discover";
  if (/\bspam\b/.test(haystack)) return "spam";
  if (/\bcore update\b|\bcore ranking\b/.test(haystack)) return "core";
  if (/\bserving\b/.test(haystack) || /\bexperiencing an issue\b/.test(haystack)) return "serving";
  return "other";
}

/** Strip the handful of tags Google puts in incident update text. */
export function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function isRankingKind(kind: SearchUpdateKind): boolean {
  return RANKING_KINDS.includes(kind);
}
