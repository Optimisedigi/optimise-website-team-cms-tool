import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALENDAR_REDIRECT_URI
  );
}

/**
 * Generate the Google OAuth consent URL for Calendar access.
 */
export function getCalendarOAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: "calendar",
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCalendarCode(code: string) {
  const oauth2Client = getOAuth2Client();
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
  }
): Promise<string[]> {
  const calendar = await getAuthenticatedCalendarClient(refreshToken);

  const timeMin = new Date(`${options.dateRangeStart}T${options.businessHoursStart}:00`);
  const timeMax = new Date(`${options.dateRangeEnd}T${options.businessHoursEnd}:00`);

  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: options.timezone,
      items: [{ id: "primary" }],
    },
  });

  const busyPeriods =
    freebusyRes.data.calendars?.primary?.busy || [];

  const slots: string[] = [];
  const current = new Date(timeMin);

  while (current < timeMax) {
    const dayOfWeek = current.getDay();
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      current.setDate(current.getDate() + 1);
      const [h, m] = options.businessHoursStart.split(":").map(Number);
      current.setHours(h, m, 0, 0);
      continue;
    }

    const [startH, startM] = options.businessHoursStart.split(":").map(Number);
    const [endH, endM] = options.businessHoursEnd.split(":").map(Number);
    const dayStart = new Date(current);
    dayStart.setHours(startH, startM, 0, 0);
    const dayEnd = new Date(current);
    dayEnd.setHours(endH, endM, 0, 0);

    // If current is before business hours start, move to start
    if (current < dayStart) {
      current.setTime(dayStart.getTime());
    }

    // Generate slots for this day within business hours
    while (current < dayEnd && current < timeMax) {
      const slotEnd = new Date(current.getTime() + options.durationMinutes * 60000);

      // Check slot fits within business hours
      if (slotEnd > dayEnd) break;

      // Check no overlap with busy periods
      const isAvailable = !busyPeriods.some((busy) => {
        const busyStart = new Date(busy.start!);
        const busyEnd = new Date(busy.end!);
        return current < busyEnd && slotEnd > busyStart;
      });

      // Skip past slots
      if (isAvailable && current > new Date()) {
        slots.push(current.toISOString());
      }

      current.setMinutes(current.getMinutes() + options.slotIntervalMinutes);
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(startH, startM, 0, 0);
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
