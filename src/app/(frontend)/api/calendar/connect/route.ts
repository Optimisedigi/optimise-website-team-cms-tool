import { NextRequest, NextResponse } from "next/server";
import { getCalendarOAuthUrl } from "@/lib/calendar-service";

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured" },
      { status: 500 }
    );
  }

  // Build redirect URI from env or auto-detect from request
  const redirectUri =
    process.env.CALENDAR_REDIRECT_URI ||
    new URL("/api/calendar/callback", req.url).toString();

  const url = getCalendarOAuthUrl(redirectUri);
  return NextResponse.redirect(url);
}
