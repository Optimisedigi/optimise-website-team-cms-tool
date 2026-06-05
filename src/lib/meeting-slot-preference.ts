/**
 * Preference-ordered slot matching for the meeting scheduler.
 *
 * Generated slots are a flat, chronologically-sorted list of ISO datetimes.
 * When every attendee has responded we want to honour an optional per-date
 * "preferred" start time: within a given date, slots at or after the preferred
 * time are tried first (earliest of those), then slots before it (earliest of
 * those). Dates always remain in ascending order, and dates with no preferred
 * time keep pure chronological order.
 */

export type SlotDateOverride = {
  date?: string; // YYYY-MM-DD
  preferred?: string; // HH:MM
};

/**
 * Resolve a slot's calendar date (YYYY-MM-DD) and minutes-since-midnight in a
 * given timezone, so it can be compared against that date's preferred time.
 */
export function slotTzParts(
  iso: string,
  timeZone: string
): { ymd: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  return {
    ymd: `${map.year}-${map.month}-${map.day}`,
    minutes: hour * 60 + Number(map.minute),
  };
}

export function parsePreferredMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(minutes) ? minutes : null;
}

/**
 * Order generated slots by preference. See module docblock for the rules.
 */
export function orderSlotsByPreference(
  generatedSlots: string[],
  dateOverrides: SlotDateOverride[],
  timezone: string
): string[] {
  const preferredByDate = new Map<string, number>();
  for (const o of Array.isArray(dateOverrides) ? dateOverrides : []) {
    const ymd =
      typeof o?.date === "string" ? o.date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] : null;
    const pref = parsePreferredMinutes(o?.preferred);
    if (ymd && pref !== null) preferredByDate.set(ymd, pref);
  }

  const decorated = generatedSlots.map((iso, index) => {
    const { ymd, minutes } = slotTzParts(iso, timezone);
    const pref = preferredByDate.get(ymd);
    // bucket 0 = at/after preferred (or no preferred), bucket 1 = before preferred
    const bucket = pref !== undefined && minutes < pref ? 1 : 0;
    return { iso, ymd, minutes, bucket, index };
  });

  decorated.sort((a, b) => {
    if (a.ymd !== b.ymd) return a.ymd < b.ymd ? -1 : 1;
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    return a.index - b.index;
  });

  return decorated.map((d) => d.iso);
}
