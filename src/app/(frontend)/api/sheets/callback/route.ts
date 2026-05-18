import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeSheetsCode, getSheetsUserEmail } from "@/lib/sheets-service";

const STATE_COOKIE = "oauth_state_sheets";

/**
 * Constant-time comparison of two hex-encoded state strings.
 * Length mismatch short-circuits (timingSafeEqual throws on length diff).
 */
function safeStateEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const queryState = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get(STATE_COOKIE)?.value;

  // Always clear the single-use state cookie on any response from this route.
  const clearStateCookie = (res: NextResponse) => {
    res.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  };

  if (error) {
    return clearStateCookie(
      NextResponse.redirect(
        new URL(
          `/admin/globals/sheets-auth?sheets_error=${encodeURIComponent(error)}`,
          req.url
        )
      )
    );
  }

  // Validate state BEFORE doing any work (CSRF + OAuth hijack protection).
  if (
    !storedState ||
    !queryState ||
    !safeStateEqual(storedState, queryState)
  ) {
    return clearStateCookie(
      NextResponse.redirect(new URL("/admin?error=oauth_state_mismatch", req.url))
    );
  }

  if (!code) {
    return clearStateCookie(
      NextResponse.json({ error: "Missing authorization code" }, { status: 400 })
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Re-check admin session on callback — defence in depth.
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || user.role !== "admin") {
    return clearStateCookie(
      NextResponse.redirect(new URL("/admin?error=unauthorized", req.url))
    );
  }

  try {
    const tokens = await exchangeSheetsCode(code);
    const email = await getSheetsUserEmail(tokens.accessToken);

    await payload.updateGlobal({
      slug: "sheets-auth" as any,
      data: {
        refreshToken: tokens.refreshToken,
        connectedEmail: email,
        connectedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    });

    return clearStateCookie(
      NextResponse.redirect(new URL("/admin/globals/sheets-auth", req.url))
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[sheets-callback]", message);
    return clearStateCookie(
      NextResponse.redirect(
        new URL(
          `/admin/globals/sheets-auth?sheets_error=${encodeURIComponent(message)}`,
          req.url
        )
      )
    );
  }
}
