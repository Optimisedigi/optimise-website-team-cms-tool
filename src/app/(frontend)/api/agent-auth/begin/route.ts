import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { beginAnthropicLogin } from "@/lib/agents/_shared/llm/auth/oauth/anthropic";
import { beginCodexDeviceLogin } from "@/lib/agents/_shared/llm/auth/oauth/openai-codex";

const STATE_COOKIE = "agent-auth-state";
const STATE_TTL_SECONDS = 600; // 10 minutes is plenty for the paste/device flow

/**
 * POST /api/agent-auth/begin
 * Body: { provider?: "anthropic" | "openai-codex" }  (defaults to anthropic)
 *
 * Anthropic: starts the OAuth PKCE flow and returns the authorize URL the
 * client opens in a new tab. The verifier + state pair is persisted in a
 * signed httpOnly cookie so the matching /complete call can validate the paste.
 *
 * openai-codex: starts the Codex device-code flow and returns the one-time
 * user code + verification URL. The device_auth_id + poll interval are stored
 * in the cookie so /complete can poll the device token endpoint.
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

  if (provider === "openai-codex") {
    try {
      const { userCode, deviceAuthId, verificationUrl, intervalSeconds } =
        await beginCodexDeviceLogin();
      const cookieValue = JSON.stringify({ provider, deviceAuthId, userCode, intervalSeconds });
      const res = NextResponse.json({
        provider,
        userCode,
        verificationUrl,
        deviceAuthId,
        intervalSeconds,
      });
      res.cookies.set(STATE_COOKIE, cookieValue, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: STATE_TTL_SECONDS,
        path: "/",
      });
      return res;
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  if (provider !== "anthropic") {
    return NextResponse.json(
      { error: "Unsupported provider. Use 'anthropic' or 'openai-codex'." },
      { status: 400 },
    );
  }

  const { authorizeUrl, state, codeVerifier } = beginAnthropicLogin();

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
