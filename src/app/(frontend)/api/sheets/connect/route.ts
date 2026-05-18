import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getSheetsOAuthUrl } from "@/lib/sheets-service";

const STATE_COOKIE = "oauth_state_sheets";
const STATE_TTL_SECONDS = 600; // 10 minutes

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured" },
      { status: 500 }
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = crypto.randomBytes(32).toString("hex");
  const url = getSheetsOAuthUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });
  return res;
}
