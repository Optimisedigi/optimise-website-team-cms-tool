import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { fetchAvailableSlots } from "@/lib/calendar-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const scheduler = await payload.findByID({
      collection: "meeting-schedulers" as any,
      id,
    });

    if (!scheduler) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get calendar auth
    const calendarAuth = await payload.findGlobal({
      slug: "calendar-auth" as any,
      overrideAccess: true,
    });

    const refreshToken = (calendarAuth as any).refreshToken;
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Calendar not connected. Go to Settings > Google Calendar Auth to connect." },
        { status: 400 }
      );
    }

    const slots = await fetchAvailableSlots(refreshToken, {
      dateRangeStart: (scheduler as any).dateRangeStart,
      dateRangeEnd: (scheduler as any).dateRangeEnd,
      businessHoursStart: (scheduler as any).businessHoursStart || "09:00",
      businessHoursEnd: (scheduler as any).businessHoursEnd || "17:00",
      timezone: (scheduler as any).timezone || "Australia/Sydney",
      durationMinutes: parseInt((scheduler as any).durationMinutes || "30", 10),
      slotIntervalMinutes: (scheduler as any).slotIntervalMinutes || 30,
    });

    await payload.update({
      collection: "meeting-schedulers" as any,
      id,
      data: {
        generatedSlots: slots,
        slotsGeneratedAt: new Date().toISOString(),
        status: "slots_generated",
      } as any,
    });

    return NextResponse.json({ ok: true, slotCount: slots.length });
  } catch (err) {
    console.error("[generate-slots]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate slots" },
      { status: 500 }
    );
  }
}
