import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { suggestGmailContacts } from "@/lib/gmail-search";

/**
 * GET /api/gmail/contacts?q=<partial-name-or-email>
 *
 * Lightweight recipient autocomplete for the Gmail draft UI. It uses the
 * already-granted gmail.readonly scope to search recent matching messages and
 * extract From/To/Cc addresses; it does not require People/Contacts scopes.
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
  const maxRaw = Number(searchParams.get("max") ?? "8");
  const max = Number.isFinite(maxRaw) ? maxRaw : 8;

  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const tokenResult = await getValidGmailToken(user.id);
  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: "gmail-not-connected", reason: tokenResult.reason },
      { status: 403 },
    );
  }

  try {
    const data = await suggestGmailContacts(tokenResult.accessToken, q, max);
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
      { error: e.message ?? "Gmail contact search failed." },
      { status: 500 },
    );
  }
}
