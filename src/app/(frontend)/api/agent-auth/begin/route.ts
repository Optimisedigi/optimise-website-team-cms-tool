import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { beginAnthropicLogin } from "@/lib/agents/_shared/llm/auth/oauth/anthropic";
import { beginCodexLogin } from "@/lib/agents/_shared/llm/auth/oauth/openai-codex";

const STATE_COOKIE = "agent-auth-state";
const STATE_TTL_SECONDS = 600; // 10 minutes is plenty for the paste flow

/**
 * POST /api/agent-auth/begin
 * Body: { provider?: "anthropic" | "openai-codex" }  (defaults to anthropic)
 *
 * Both providers use the same Authorization Code + PKCE "paste the code" flow
 * (no localhost callback, which can't work on Vercel): we return the authorize
 * URL the client opens in a new tab, and persist the verifier + state in an
 * httpOnly cookie so the matching /complete call can validate the paste.
 *
 * The openai-codex flow is lifted from gg-framework's Codex OAuth — the same
 * standard browser PKCE flow the Codex CLI uses by default.
 *
 * Cookie expires after 10 minutes. Auth: requires a logged-in CMS user.
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = body.provider ?? "anthropic";

  if (provider !== "anthropic" && provider !== "openai-codex") {
    return NextResponse.json(
      { error: "Unsupported provider. Use 'anthropic' or 'openai-codex'." },
      { status: 400 },
    );
  }

  const { authorizeUrl, state, codeVerifier } =
    provider === "openai-codex" ? beginCodexLogin() : beginAnthropicLogin();

  const cookieValue = JSON.stringify({ provider, state, codeVerifier });
  const res = NextResponse.json({ provider, authorizeUrl, state });
  res.cookies.set(STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });
  return res;
}
