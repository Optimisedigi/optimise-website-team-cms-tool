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

  // Normalise dates — Payload stores as ISO strings; we only want YYYY-MM-DD.
  const toYMD = (input: string | undefined | null): string => {
    if (!input) throw new Error("Date range required (set at least one available date)");
    const match = String(input).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) throw new Error(`Invalid date: ${input}`);
    return match[1];
  };

  // If dateOverrides are populated, derive bounds from them (new mode).
  // Otherwise use the legacy date range fields.
  const enabledOverrides = (options.dateOverrides || [])
    .filter((o) => o && typeof o.date === "string" && o.enabled !== false);

  const dateStart = enabledOverrides.length
    ? toYMD([...enabledOverrides].sort((a, b) => a.date.localeCompare(b.date))[0].date)
    : toYMD(options.dateRangeStart);
  const dateEnd = enabledOverrides.length
    ? toYMD([...enabledOverrides].sort((a, b) => b.date.localeCompare(a.date))[0].date)
    : toYMD(options.dateRangeEnd);

  // Use the widest window across schedule + overrides to fetch freebusy once.
  const allWindows = [
    ...((options.daySchedule || []).filter((d) => d.enabled)),
    ...((options.dateOverrides || []).filter((d) => d.enabled)),
  ];
  const earliestStart = allWindows.length
    ? allWindows.reduce((min, d) => (d.start < min ? d.start : min), allWindows[0].start)
    : options.businessHoursStart;
  const latestEnd = allWindows.length
    ? allWindows.reduce((max, d) => (d.end > max ? d.end : max), allWindows[0].end)
    : options.businessHoursEnd;

  const timeMin = new Date(`${dateStart}T${earliestStart}:00`);
  const timeMax = new Date(`${dateEnd}T${latestEnd}:00`);

  if (isNaN(timeMin.getTime()) || isNaN(timeMax.getTime())) {
    throw new Error(
      `Invalid time window: dateStart=${dateStart} dateEnd=${dateEnd} earliestStart=${earliestStart} latestEnd=${latestEnd}`
    );
  }

  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: options.timezone,
      items: [{ id: "primary" }],
    },
  });

  const busyPeriods = freebusyRes.data.calendars?.primary?.busy || [];

  const slots: string[] = [];
  const cursorDate = new Date(timeMin);
  cursorDate.setHours(0, 0, 0, 0);
  const endDate = new Date(timeMax);

  // Index date overrides by YYYY-MM-DD for O(1) lookup
  const overrideByDate: Record<string, DateOverride> = {};
  for (const ov of options.dateOverrides || []) {
    if (ov && typeof ov.date === "string") {
      const ymd = ov.date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      if (ymd) overrideByDate[ymd] = ov;
    }
  }
  const strictDateMode = enabledOverrides.length > 0;

  while (cursorDate <= endDate) {
    const jsDay = cursorDate.getDay();
    const ymd = `${cursorDate.getFullYear()}-${String(cursorDate.getMonth() + 1).padStart(2, "0")}-${String(cursorDate.getDate()).padStart(2, "0")}`;
    const override = overrideByDate[ymd];
    const entry = getDayEntry(options.daySchedule, jsDay);

    // Determine this day's window — date override wins over day-of-week.
    // In strict mode (dateOverrides populated), only listed dates are considered.
    let startHHMM: string;
    let endHHMM: string;
    if (override) {
      if (!override.enabled) {
        cursorDate.setDate(cursorDate.getDate() + 1);
        continue;
      }
      startHHMM = override.start;
      endHHMM = override.end;
    } else if (strictDateMode) {
      cursorDate.setDate(cursorDate.getDate() + 1);
      continue;
    } else if (entry) {
      if (!entry.enabled) {
        cursorDate.setDate(cursorDate.getDate() + 1);
        continue;
      }
      startHHMM = entry.start;
      endHHMM = entry.end;
    } else {
      // Fallback: legacy behavior (skip weekends, global business hours)
      if (jsDay === 0 || jsDay === 6) {
        cursorDate.setDate(cursorDate.getDate() + 1);
        continue;
      }
      startHHMM = options.businessHoursStart;
      endHHMM = options.businessHoursEnd;
    }

    const [startH, startM] = startHHMM.split(":").map(Number);
    const [endH, endM] = endHHMM.split(":").map(Number);

    const dayStart = new Date(cursorDate);
    dayStart.setHours(startH, startM, 0, 0);
    const dayEnd = new Date(cursorDate);
    dayEnd.setHours(endH, endM, 0, 0);

    const current = new Date(dayStart);
    while (current < dayEnd) {
      const slotEnd = new Date(current.getTime() + options.durationMinutes * 60000);
      if (slotEnd > dayEnd) break;

      const isAvailable = !busyPeriods.some((busy) => {
        const busyStart = new Date(busy.start!);
        const busyEnd = new Date(busy.end!);
        return current < busyEnd && slotEnd > busyStart;
      });

      if (isAvailable && current > new Date()) {
        slots.push(current.toISOString());
      }

      current.setMinutes(current.getMinutes() + options.slotIntervalMinutes);
    }

    cursorDate.setDate(cursorDate.getDate() + 1);
  }

  return slots;
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
