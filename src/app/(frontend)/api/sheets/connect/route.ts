import { NextRequest, NextResponse } from "next/server";
import { getSheetsOAuthUrl } from "@/lib/sheets-service";

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured" },
      { status: 500 }
    );
  }

  const url = getSheetsOAuthUrl();
  return NextResponse.redirect(url);
}
