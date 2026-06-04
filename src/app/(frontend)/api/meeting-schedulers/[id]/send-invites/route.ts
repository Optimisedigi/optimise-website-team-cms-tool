import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { generateScheduleInviteEmail } from "@/lib/schedule-email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  if (!doc.generatedSlots || doc.generatedSlots.length === 0) {
    return NextResponse.json(
      { error: "Generate available slots first before sending invites." },
      { status: 400 }
    );
  }

  if (!doc.attendees || doc.attendees.length === 0) {
    return NextResponse.json(
      { error: "Add at least one attendee before sending invites." },
      { status: 400 }
    );
  }

  if (!process.env.BREVO_API_KEY) {
    return NextResponse.json(
      { error: "BREVO_API_KEY not configured" },
      { status: 500 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3004");

  const fromEmail =
    process.env.SCHEDULE_FROM_EMAIL || "meetings@optimisedigital.online";

  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const attendee of doc.attendees) {
    if (!attendee.email || !attendee.token || attendee.internalConfirmed) continue;

    const scheduleUrl = `${baseUrl}/schedule/${attendee.token}`;

    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Optimise Digital", email: fromEmail },
          to: [{ email: attendee.email, name: attendee.name || "there" }],
          subject: `Meeting scheduling: ${doc.title}`,
          htmlContent: generateScheduleInviteEmail({
            recipientName: attendee.name || "there",
            meetingTitle: doc.title,
            meetingTopic: doc.meetingTopic,
            durationMinutes: doc.durationMinutes || "30",
            attendeeEmails: doc.attendees.map((a: any) => a.email).filter(Boolean),
            scheduleUrl,
          }),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[brevo] Schedule invite error for ${attendee.email}:`, text);
        results.push({ email: attendee.email, ok: false, error: `Brevo ${res.status}` });
      } else {
        results.push({ email: attendee.email, ok: true });
      }
    } catch (err: any) {
      results.push({ email: attendee.email, ok: false, error: err.message });
    }
  }

  // Update attendees with emailSentAt and set status
  const now = new Date().toISOString();
  const updatedAttendees = doc.attendees.map((a: any) => {
    const sent = results.find((r) => r.email === a.email && r.ok);
    return {
      ...a,
      emailSentAt: sent ? now : a.emailSentAt,
    };
  });

  await payload.update({
    collection: "meeting-schedulers" as any,
    id,
    data: {
      attendees: updatedAttendees,
      status: "invites_sent",
    } as any,
  });

  const sentCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, sentCount, results });
}
