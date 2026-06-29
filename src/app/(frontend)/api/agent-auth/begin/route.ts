import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { beginAnthropicLogin } from "@/lib/agents/_shared/llm/auth/oauth/anthropic";
import { beginCodexLogin } from "@/lib/agents/_shared/llm/auth/oauth/openai-codex";

const STATE_COOKIE = "agent-auth-state";
const STATE_TTL_SECONDS = 600; // 10 minutes is plenty for the callback/paste flow

function requestOrigin(req: NextRequest): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return req.nextUrl.origin;
}

function codexRedirectUri(req: NextRequest): string {
  return (
    process.env.OPENAI_CODEX_REDIRECT_URI ??
    `${requestOrigin(req).replace(/\/+$/, "")}/api/agent-auth/callback/openai-codex`
  );
}

/**
 * POST /api/agent-auth/begin
 * Body: { provider?: "anthropic" | "openai-codex" }  (defaults to anthropic)
 *
 * Anthropic uses a paste flow. GPT/Codex uses this app's callback route instead
 * of the CLI localhost loopback, then falls back to paste if the provider cannot
 * redirect back. We persist verifier + state in an httpOnly cookie so the
 * matching callback or /complete call can validate the code.
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

  const redirectUri = provider === "openai-codex" ? codexRedirectUri(req) : undefined;
  const login = redirectUri ? beginCodexLogin({ redirectUri }) : beginAnthropicLogin();

  const cookieValue = JSON.stringify({
    provider,
    state: login.state,
    codeVerifier: login.codeVerifier,
    ...(redirectUri ? { redirectUri } : {}),
  });
  const res = NextResponse.json({
    provider,
    authorizeUrl: login.authorizeUrl,
    state: login.state,
    ...(redirectUri ? { redirectUri } : {}),
  });
  res.cookies.set(STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });
  return res;
}
