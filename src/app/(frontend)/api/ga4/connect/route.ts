import { NextRequest, NextResponse } from "next/server";
import { getGa4OAuthUrl } from "@/lib/ga4-service";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query parameter is required" },
      { status: 400 }
    );
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured" },
      { status: 500 }
    );
  }

  const url = getGa4OAuthUrl(clientId);
  return NextResponse.redirect(url);
}
