import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { createCalendarEvent } from "@/lib/calendar-service";
import { generateScheduleConfirmedEmail } from "@/lib/schedule-email";
import { logActivity } from "@/lib/activity-log";
import { notifyAdminsOfMeetingEvent } from "@/lib/meeting-scheduler-notify";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { matchedSlot?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchedSlot = body.matchedSlot;
  if (!matchedSlot || isNaN(new Date(matchedSlot).getTime())) {
    return NextResponse.json(
      { error: "matchedSlot (ISO datetime) is required" },
      { status: 400 }
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let doc: any;
  try {
    doc = await payload.findByID({
      collection: "meeting-schedulers" as any,
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (doc.status === "confirmed") {
    return NextResponse.json(
      { error: "This meeting is already confirmed" },
      { status: 400 }
    );
  }

  const attendees = Array.isArray(doc.attendees) ? doc.attendees : [];
  if (attendees.length === 0) {
    return NextResponse.json({ error: "No attendees on this meeting" }, { status: 400 });
  }

  const timezone = doc.timezone || "Australia/Sydney";
  const updateData: any = { matchedSlot, status: "confirmed" };

  // Create the Google Calendar event
  try {
    const calendarAuth = await payload.findGlobal({
      slug: "calendar-auth" as any,
      overrideAccess: true,
    });
    const refreshToken = (calendarAuth as any).refreshToken;
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Calendar is not connected. Connect Google Calendar first." },
        { status: 400 }
      );
    }
    const result = await createCalendarEvent(refreshToken, {
      title: doc.title,
      description: doc.meetingTopic || "",
      startTime: matchedSlot,
      durationMinutes: parseInt(doc.durationMinutes || "30", 10),
      attendeeEmails: attendees.map((a: any) => a.email).filter(Boolean),
      timezone,
    });
    updateData.googleEventId = result.eventId;
    updateData.googleEventLink = result.eventLink;
  } catch (err: any) {
    console.error("[meeting-scheduler confirm] Calendar event failed:", err);
    return NextResponse.json(
      { error: `Failed to create calendar event: ${err?.message || err}` },
      { status: 500 }
    );
  }

  await payload.update({
    collection: "meeting-schedulers" as any,
    id,
    data: updateData,
    overrideAccess: true,
  });

  // Send confirmation emails
  if (process.env.BREVO_API_KEY) {
    const fromEmail =
      process.env.SCHEDULE_FROM_EMAIL || "meetings@optimisedigital.online";
    const { date, time } = formatSlotForEmail(matchedSlot, timezone);

    for (const attendee of attendees) {
      if (!attendee.email) continue;
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
      description: `${date} at ${time} (admin-confirmed)`,
      user: user.id,
      client: doc.client,
    }).catch(() => {});
  }

  // Surface the confirmed time in the admin bell.
  {
    const { date, time } = formatSlotForEmail(matchedSlot, timezone);
    await notifyAdminsOfMeetingEvent(payload, {
      kind: "meeting-confirmed",
      title: `Meeting time set: ${doc.title}`,
      body: `${date} at ${time}`,
      schedulerId: id,
      client: doc.client,
    });
  }

  return NextResponse.json({
    ok: true,
    matchedSlot,
    googleEventId: updateData.googleEventId,
    googleEventLink: updateData.googleEventLink,
  });
}
