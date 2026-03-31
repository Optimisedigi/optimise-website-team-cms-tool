import { NextResponse } from "next/server";
import { getCalendarOAuthUrl } from "@/lib/calendar-service";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured" },
      { status: 500 }
    );
  }

  const url = getCalendarOAuthUrl();
  return NextResponse.redirect(url);
}
