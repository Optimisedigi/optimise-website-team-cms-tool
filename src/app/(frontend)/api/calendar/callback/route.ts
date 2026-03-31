import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeCalendarCode, getCalendarUserEmail } from "@/lib/calendar-service";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/admin/globals/calendar-auth?calendar_error=${encodeURIComponent(error)}`,
        req.url
      )
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  try {
    const tokens = await exchangeCalendarCode(code);
    const email = await getCalendarUserEmail(tokens.accessToken);

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    await payload.updateGlobal({
      slug: "calendar-auth" as any,
      data: {
        refreshToken: tokens.refreshToken,
        connectedEmail: email,
        connectedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    });

    return NextResponse.redirect(
      new URL("/admin/globals/calendar-auth", req.url)
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[calendar-callback]", message);
    return NextResponse.redirect(
      new URL(
        `/admin/globals/calendar-auth?calendar_error=${encodeURIComponent(message)}`,
        req.url
      )
    );
  }
}
