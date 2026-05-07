import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { beginAnthropicLogin } from "@/lib/agents/_shared/llm/auth/oauth/anthropic";

const STATE_COOKIE = "agent-auth-state";
const STATE_TTL_SECONDS = 600; // 10 minutes is plenty for the paste flow

/**
 * POST /api/agent-auth/begin
 *
 * Starts the Anthropic OAuth PKCE flow. Returns the authorize URL the
 * client opens in a new tab. The verifier + state pair is persisted in a
 * signed httpOnly cookie so the matching /complete call can validate the
 * paste. Cookie expires after 10 minutes.
 *
 * Auth: requires a logged-in CMS user.
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  if (body.provider && body.provider !== "anthropic") {
    return NextResponse.json(
      { error: "Only Anthropic OAuth is supported in Phase 0" },
      { status: 400 },
    );
  }

  const { authorizeUrl, state, codeVerifier } = beginAnthropicLogin();

  const cookieValue = JSON.stringify({ state, codeVerifier });
  const res = NextResponse.json({ authorizeUrl, state });
  res.cookies.set(STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });
  return res;
}
