import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.CALENDAR_REDIRECT_URI
  );
}

/**
 * Generate the Google OAuth consent URL for Calendar access.
 */
export function getCalendarOAuthUrl(redirectUri: string): string {
  const oauth2Client = getOAuth2Client(redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: "calendar",
    redirect_uri: redirectUri,
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCalendarCode(code: string, redirectUri?: string) {
  const oauth2Client = getOAuth2Client(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
  };
}

/**
 * Get the connected user's email address.
 */
export async function getCalendarUserEmail(accessToken: string): Promise<string> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data.email || "";
}

/**
 * Get an authenticated Calendar client using the stored refresh token.
 */
export async function getAuthenticatedCalendarClient(refreshToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export type DayScheduleEntry = {
  day: string;
  enabled: boolean;
  start: string;
  end: string;
};

export type DateOverride = {
  date: string; // YYYY-MM-DD
  enabled: boolean;
  start: string;
  end: string;
};

const DAYS_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDayEntry(schedule: DayScheduleEntry[] | undefined, jsDay: number): DayScheduleEntry | null {
  if (!schedule || schedule.length !== 7) return null;
  // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat. Map to Mon-first array index.
  const monFirstIdx = (jsDay + 6) % 7;
  const key = DAYS_MON_FIRST[monFirstIdx];
  return schedule.find((d) => d.day === key) || schedule[monFirstIdx] || null;
}

/**
 * Fetch available time slots from Google Calendar using the freebusy API.
 * Returns an array of ISO datetime strings representing available slot start times.
 */
/**
 * Convert a wall-clock date+time in a specific timezone to a UTC Date instance.
 * Uses Intl.DateTimeFormat for DST-correct offset computation.
 */
function zonedToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  // Treat the wall-clock as if it were UTC, then subtract the actual offset
  // for that timezone at that instant.
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const wallInTz = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second || 0)
  );
  // Offset = how far ahead UTC is of the given timezone at that instant
  const offset = utcGuess - wallInTz;
  return new Date(utcGuess + offset);
}

function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function jsDayInTz(ymd: string, timeZone: string): number {
  const utc = zonedToUtc(ymd, "12:00", timeZone);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(utc);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

export async function fetchAvailableSlots(
  refreshToken: string,
  options: {
    dateRangeStart: string;
    dateRangeEnd: string;
    businessHoursStart: string;
    businessHoursEnd: string;
    timezone: string;
    durationMinutes: number;
    slotIntervalMinutes: number;
    daySchedule?: DayScheduleEntry[];
    dateOverrides?: DateOverride[];
  }
): Promise<string[]> {
  const calendar = await getAuthenticatedCalendarClient(refreshToken);
  const tz = options.timezone || "Australia/Sydney";

  const toYMD = (input: string | undefined | null): string => {
    if (!input) throw new Error("Date range required (set at least one available date)");
    const match = String(input).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) throw new Error(`Invalid date: ${input}`);
    return match[1];
  };

  // Build the list of date+window pairs we'll generate slots for.
  type Window = { ymd: string; start: string; end: string };
  const enabledOverrides = (options.dateOverrides || []).filter(
    (o) => o && typeof o.date === "string" && o.enabled !== false
  );
  const strictDateMode = enabledOverrides.length > 0;

  const windows: Window[] = [];
  if (strictDateMode) {
    for (const o of enabledOverrides) {
      const ymd = o.date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      if (ymd) windows.push({ ymd, start: o.start, end: o.end });
    }
  } else {
    const startYmd = toYMD(options.dateRangeStart);
    const endYmd = toYMD(options.dateRangeEnd);
    let cur = startYmd;
    while (cur <= endYmd) {
      const jsDay = jsDayInTz(cur, tz);
      const entry = getDayEntry(options.daySchedule, jsDay);
      if (entry) {
        if (entry.enabled) windows.push({ ymd: cur, start: entry.start, end: entry.end });
      } else if (jsDay !== 0 && jsDay !== 6) {
        windows.push({ ymd: cur, start: options.businessHoursStart, end: options.businessHoursEnd });
      }
      cur = nextYmd(cur);
    }
  }

  if (windows.length === 0) return [];

  // Compute freebusy bounds across all windows in the target timezone
  const utcWindows = windows.map((w) => ({
    ymd: w.ymd,
    startUtc: zonedToUtc(w.ymd, w.start, tz),
    endUtc: zonedToUtc(w.ymd, w.end, tz),
  }));
  const earliestUtc = utcWindows.reduce(
    (min, w) => (w.startUtc < min ? w.startUtc : min),
    utcWindows[0].startUtc
  );
  const latestUtc = utcWindows.reduce(
    (max, w) => (w.endUtc > max ? w.endUtc : max),
    utcWindows[0].endUtc
  );

  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: earliestUtc.toISOString(),
      timeMax: latestUtc.toISOString(),
      timeZone: tz,
      items: [{ id: "primary" }],
    },
  });
  const busyPeriods = freebusyRes.data.calendars?.primary?.busy || [];

  const seen = new Set<string>();
  const now = new Date();
  for (const w of utcWindows) {
    let cursor = new Date(w.startUtc);
    while (cursor < w.endUtc) {
      const slotEnd = new Date(cursor.getTime() + options.durationMinutes * 60000);
      if (slotEnd > w.endUtc) break;
      const isAvailable = !busyPeriods.some((busy) => {
        const bs = new Date(busy.start!);
        const be = new Date(busy.end!);
        return cursor < be && slotEnd > bs;
      });
      if (isAvailable && cursor > now) {
        seen.add(cursor.toISOString());
      }
      cursor = new Date(cursor.getTime() + options.slotIntervalMinutes * 60000);
    }
  }

  // Sort by time so output is chronological even when windows arrive out of order
  return Array.from(seen).sort();
}

/**
 * Create a Google Calendar event with attendees.
 */
export async function createCalendarEvent(
  refreshToken: string,
  options: {
    title: string;
    description?: string;
    startTime: string;
    durationMinutes: number;
    attendeeEmails: string[];
    timezone: string;
  }
): Promise<{ eventId: string; eventLink: string }> {
  const calendar = await getAuthenticatedCalendarClient(refreshToken);

  const start = new Date(options.startTime);
  const end = new Date(start.getTime() + options.durationMinutes * 60000);

  const event = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    requestBody: {
      summary: options.title,
      description: options.description,
      start: {
        dateTime: start.toISOString(),
        timeZone: options.timezone,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: options.timezone,
      },
      attendees: options.attendeeEmails.map((email) => ({ email })),
    },
  });

  return {
    eventId: event.data.id || "",
    eventLink: event.data.htmlLink || "",
  };
}
