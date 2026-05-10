import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { searchInbox } from "@/lib/gmail-search";

/**
 * GET /api/gmail/search?q=<gmail-search>&max=20
 *
 * Searches the logged-in user's own Gmail inbox using Gmail's search syntax.
 * Returns lightweight metadata for matching messages (no bodies). Bodies are
 * fetched on-demand via /api/gmail/message/[id].
 *
 * Auth: CMS-logged-in user only. Requires the user to have connected Gmail
 * with the gmail.readonly scope (Phase 6+). If the user connected under the
 * old compose-only scope, Gmail returns 403 and we surface
 * { error: "scope-insufficient" } so the UI can prompt a reconnect.
 */
export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const maxRaw = Number(searchParams.get("max") ?? "20");
  const max = Number.isFinite(maxRaw) ? maxRaw : 20;

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const tokenResult = await getValidGmailToken(user.id);
  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: "gmail-not-connected", reason: tokenResult.reason },
      { status: 403 },
    );
  }

  try {
    const data = await searchInbox(tokenResult.accessToken, q, max);
    return NextResponse.json(data);
  } catch (err) {
    const e = err as { code?: number; status?: number; message?: string };
    const status = e.code ?? e.status ?? 0;
    if (status === 403 || status === 401) {
      return NextResponse.json(
        {
          error: "scope-insufficient",
          reason:
            "Gmail returned insufficient permissions. Reconnect Gmail to grant read access.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: e.message ?? "Gmail search failed." },
      { status: 500 },
    );
  }
}
