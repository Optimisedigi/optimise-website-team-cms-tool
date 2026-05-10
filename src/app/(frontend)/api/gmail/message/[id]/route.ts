import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { fetchMessageBody } from "@/lib/gmail-search";

/**
 * GET /api/gmail/message/[id]
 *
 * Returns the decoded plaintext body of a single Gmail message owned by the
 * logged-in user. Used by the chat route on the server side; not currently
 * called by the picker UI (which only needs metadata from /search), but kept
 * symmetric for previewing or future client-side use.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Missing message id." },
      { status: 400 },
    );
  }

  const tokenResult = await getValidGmailToken(user.id);
  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: "gmail-not-connected", reason: tokenResult.reason },
      { status: 403 },
    );
  }

  try {
    const data = await fetchMessageBody(tokenResult.accessToken, id);
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
    if (status === 404) {
      return NextResponse.json(
        { error: "Message not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: e.message ?? "Gmail fetch failed." },
      { status: 500 },
    );
  }
}
