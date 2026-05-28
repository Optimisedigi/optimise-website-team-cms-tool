import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { completeAnthropicLogin } from "@/lib/agents/_shared/llm/auth/oauth/anthropic";
import { completeCodexDeviceLogin } from "@/lib/agents/_shared/llm/auth/oauth/openai-codex";
import { setCredential } from "@/lib/agents/_shared/llm/auth/store";
import { recordAuthEvent } from "@/lib/agents/_shared/llm/auth/events";

const STATE_COOKIE = "agent-auth-state";

/**
 * POST /api/agent-auth/complete
 *
 * Anthropic body:    { pasteString: "code#state" }
 * openai-codex body: {} (the device_auth_id + user_code come from the cookie)
 *
 * Anthropic: validates the paste against the cookie-stored state + verifier,
 * exchanges the code, stores the OAuth credential.
 *
 * openai-codex: polls the device token endpoint (server-side, single-shot, up
 * to ~60s) for the operator's authorisation, exchanges for tokens, extracts
 * the chatgpt-account-id, and stores the credential. If the operator hasn't
 * finished in the browser yet, returns 425 so the page can prompt a retry.
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

  const cookie = req.cookies.get(STATE_COOKIE);
  if (!cookie?.value) {
    return NextResponse.json(
      { error: "OAuth flow expired or never started; click Begin login again." },
      { status: 400 },
    );
  }

  let stateBlob: {
    provider?: string;
    state?: string;
    codeVerifier?: string;
    deviceAuthId?: string;
    userCode?: string;
    intervalSeconds?: number;
  };
  try {
    stateBlob = JSON.parse(cookie.value);
  } catch {
    return NextResponse.json(
      { error: "Invalid OAuth state cookie; click Begin login again." },
      { status: 400 },
    );
  }

  const provider = stateBlob.provider ?? "anthropic";

  if (provider === "openai-codex") {
    if (!stateBlob.deviceAuthId || !stateBlob.userCode) {
      return NextResponse.json(
        { error: "Codex device flow state missing; click Begin login again." },
        { status: 400 },
      );
    }
    try {
      const credential = await completeCodexDeviceLogin({
        deviceAuthId: stateBlob.deviceAuthId,
        userCode: stateBlob.userCode,
        maxWaitMs: 60_000,
        intervalSeconds: stateBlob.intervalSeconds,
      });
      await setCredential("openai-codex", credential);
      await recordAuthEvent({
        provider: "openai-codex",
        kind: "oauth-connected",
        message: "Connected to ChatGPT via Codex device-code OAuth.",
      }).catch(() => {});
    } catch (err) {
      const message = (err as Error).message;
      // "not completed in time" means the operator hasn't authorised yet; keep
      // the cookie so they can retry Complete without restarting.
      const pending = /not completed in time/i.test(message);
      return NextResponse.json({ error: message }, { status: pending ? 425 : 400 });
    }
    const res = NextResponse.json({ ok: true, provider });
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  // Anthropic paste flow.
  let body: { pasteString?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const pasteString = body.pasteString?.trim();
  if (!pasteString) {
    return NextResponse.json(
      { error: "pasteString is required (format: code#state)" },
      { status: 400 },
    );
  }
  if (!stateBlob.state || !stateBlob.codeVerifier) {
    return NextResponse.json(
      { error: "Anthropic OAuth state missing; click Begin login again." },
      { status: 400 },
    );
  }

  try {
    const credential = await completeAnthropicLogin({
      pasteString,
      expectedState: stateBlob.state,
      codeVerifier: stateBlob.codeVerifier,
    });
    await setCredential("anthropic", credential);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, provider });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
