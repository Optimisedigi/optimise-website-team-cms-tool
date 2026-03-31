import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { createCalendarEvent } from "@/lib/calendar-service";
import {
  generateScheduleConfirmedEmail,
  generateNoMatchEmail,
} from "@/lib/schedule-email";
import { logActivity } from "@/lib/activity-log";

async function findSchedulerByToken(payload: any, token: string) {
  const result = await payload.find({
    collection: "meeting-schedulers",
    where: {
      "attendees.token": { equals: token },
    },
    limit: 1,
    overrideAccess: true,
  });
  return result.docs[0] || null;
}

function findAttendeeByToken(doc: any, token: string) {
  return doc.attendees?.find((a: any) => a.token === token) || null;
}

/**
 * Find the earliest slot that ALL attendees selected.
 */
function findIntersection(
  attendees: any[],
  generatedSlots: string[]
): string | null {
  const generatedSet = new Set(generatedSlots);
  const now = new Date();

  // Collect all selected slots from each attendee
  const attendeeSlots = attendees.map((a: any) => {
    const selected = a.selectedSlots || [];
    return new Set(selected.map((s: any) => (typeof s === "string" ? s : s)));
  });

  if (attendeeSlots.length === 0) return null;

  // Find slots in generatedSlots that every attendee selected
  for (const slot of generatedSlots) {
    if (new Date(slot) <= now) continue; // skip past slots
    if (!generatedSet.has(slot)) continue;
    const allSelected = attendeeSlots.every((set) => set.has(slot));
    if (allSelected) return slot;
  }

  return null;
}

function formatSlotForEmail(
  isoString: string,
  timezone: string
): { date: string; time: string } {
  const d = new Date(isoString);
  return {
    date: d.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone,
    }),
    time: d.toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    }),
  };
}

// GET: Fetch meeting data for an attendee's booking page
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const doc = await findSchedulerByToken(payload, token);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attendee = findAttendeeByToken(doc, token);
  if (!attendee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    title: doc.title,
    meetingTopic: doc.meetingTopic,
    durationMinutes: doc.durationMinutes || "30",
    timezone: doc.timezone || "Australia/Sydney",
    generatedSlots: doc.generatedSlots || [],
    attendeeName: attendee.name,
    responded: attendee.responded || false,
    selectedSlots: attendee.selectedSlots || [],
    status: doc.status,
  });
}

// POST: Submit attendee's slot selections
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  let body: { selectedSlots: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.selectedSlots) || body.selectedSlots.length === 0) {
    return NextResponse.json(
      { error: "Select at least one time slot" },
      { status: 400 }
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const doc = await findSchedulerByToken(payload, token);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (doc.status === "confirmed") {
    return NextResponse.json(
      { error: "This meeting has already been confirmed" },
      { status: 400 }
    );
  }

  if (doc.status === "expired") {
    return NextResponse.json(
      { error: "This scheduling request has expired" },
      { status: 400 }
    );
  }

  // Validate slots are from the generated set
  const validSlots = new Set(doc.generatedSlots || []);
  const filteredSlots = body.selectedSlots.filter((s) => validSlots.has(s));
  if (filteredSlots.length === 0) {
    return NextResponse.json(
      { error: "No valid time slots selected" },
      { status: 400 }
    );
  }

  // Update this attendee's response
  const now = new Date().toISOString();
  const updatedAttendees = doc.attendees.map((a: any) => {
    if (a.token === token) {
      return {
        ...a,
        responded: true,
        respondedAt: now,
        selectedSlots: filteredSlots,
      };
    }
    return a;
  });

  // Check if all attendees have now responded
  const allResponded = updatedAttendees.every((a: any) => a.responded);

  let newStatus = "awaiting_responses";
  let matchedSlot: string | null = null;

  if (allResponded) {
    matchedSlot = findIntersection(updatedAttendees, doc.generatedSlots || []);
    newStatus = matchedSlot ? "confirmed" : "no_match";
  }

  const updateData: any = {
    attendees: updatedAttendees,
    status: newStatus,
  };

  if (matchedSlot) {
    updateData.matchedSlot = matchedSlot;
  }

  // If confirmed, create Google Calendar event
  if (matchedSlot) {
    try {
      const calendarAuth = await payload.findGlobal({
        slug: "calendar-auth" as any,
        overrideAccess: true,
      });

      const refreshToken = (calendarAuth as any).refreshToken;
      if (refreshToken) {
        const attendeeEmails = updatedAttendees.map((a: any) => a.email);
        const result = await createCalendarEvent(refreshToken, {
          title: doc.title,
          description: doc.meetingTopic || "",
          startTime: matchedSlot,
          durationMinutes: parseInt(doc.durationMinutes || "30", 10),
          attendeeEmails,
          timezone: doc.timezone || "Australia/Sydney",
        });

        updateData.googleEventId = result.eventId;
        updateData.googleEventLink = result.eventLink;
      }
    } catch (err) {
      console.error("[meeting-scheduler] Failed to create calendar event:", err);
    }
  }

  await payload.update({
    collection: "meeting-schedulers" as any,
    id: doc.id,
    data: updateData,
    overrideAccess: true,
  });

  // Send confirmation or no-match emails
  if (allResponded && process.env.BREVO_API_KEY) {
    const fromEmail =
      process.env.SCHEDULE_FROM_EMAIL || "meetings@optimisedigital.online";
    const timezone = doc.timezone || "Australia/Sydney";

    if (matchedSlot) {
      const { date, time } = formatSlotForEmail(matchedSlot, timezone);

      // Send confirmation to all attendees
      for (const attendee of updatedAttendees) {
        try {
          await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "api-key": process.env.BREVO_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sender: { name: "Optimise Digital", email: fromEmail },
              to: [{ email: attendee.email, name: attendee.name || "there" }],
              subject: `Meeting confirmed: ${doc.title}`,
              htmlContent: generateScheduleConfirmedEmail({
                recipientName: attendee.name || "there",
                meetingTitle: doc.title,
                meetingDate: date,
                meetingTime: time,
                durationMinutes: doc.durationMinutes || "30",
                timezone,
              }),
            }),
          });
        } catch (err) {
          console.error(`[brevo] Confirmation email failed for ${attendee.email}:`, err);
        }
      }

      logActivity(payload, {
        type: "meeting_confirmed",
        title: `Meeting confirmed: ${doc.title}`,
        description: `${date} at ${time}`,
        client: doc.client,
      }).catch(() => {});
    } else {
      // No match - notify agency
      const agencyEmail =
        process.env.AGENCY_NOTIFICATION_EMAIL || "peter@optimisedigital.online";
      const summary = updatedAttendees
        .map((a: any) => `${a.name}: ${(a.selectedSlots || []).length} slot(s) selected`)
        .join("\n");

      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": process.env.BREVO_API_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Optimise Digital", email: fromEmail },
            to: [{ email: agencyEmail, name: "Optimise Digital" }],
            subject: `No matching times: ${doc.title}`,
            htmlContent: generateNoMatchEmail({
              meetingTitle: doc.title,
              attendeeSummary: summary,
            }),
          }),
        });
      } catch (err) {
        console.error("[brevo] No-match notification failed:", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    allResponded,
    confirmed: !!matchedSlot,
    matchedSlot,
  });
}
