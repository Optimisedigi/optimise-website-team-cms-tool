import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getGmailOAuthUrl } from "@/lib/gmail-service";

/**
 * Initiates Gmail OAuth for the currently logged-in CMS user.
 * The user's id is round-tripped via the OAuth `state` parameter so the
 * callback can identify whose tokens to persist.
 */
export async function GET(req: NextRequest) {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GMAIL_REDIRECT_URI
  ) {
    return NextResponse.json(
      {
        error:
          "Gmail OAuth credentials not configured (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REDIRECT_URI).",
      },
      { status: 500 },
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to connect Gmail." },
      { status: 401 },
    );
  }

  const url = getGmailOAuthUrl(user.id);
  return NextResponse.redirect(url);
}
