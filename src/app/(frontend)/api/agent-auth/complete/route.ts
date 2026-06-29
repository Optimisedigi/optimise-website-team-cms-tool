import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { completeAnthropicLogin } from "@/lib/agents/_shared/llm/auth/oauth/anthropic";
import { completeCodexLogin } from "@/lib/agents/_shared/llm/auth/oauth/openai-codex";
import { setCredential } from "@/lib/agents/_shared/llm/auth/store";
import { recordAuthEvent } from "@/lib/agents/_shared/llm/auth/events";

const STATE_COOKIE = "agent-auth-state";

/**
 * POST /api/agent-auth/complete
 * Body: { pasteString: "code" | "code#state" | "<callback URL>" }
 *
 * Both providers use the same paste flow: validate the pasted code against the
 * cookie-stored state + PKCE verifier, exchange the code for tokens, and store
 * the OAuth credential encrypted.
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

  let body: { pasteString?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const pasteString = body.pasteString?.trim();
  if (!pasteString) {
    return NextResponse.json(
      { error: "pasteString is required (code, code#state, or callback URL)" },
      { status: 400 },
    );
  }

  const cookie = req.cookies.get(STATE_COOKIE);
  if (!cookie?.value) {
    return NextResponse.json(
      { error: "OAuth flow expired or never started; click Begin login again." },
      { status: 400 },
    );
  }

  let stateBlob: { provider?: string; state?: string; codeVerifier?: string; redirectUri?: string };
  try {
    stateBlob = JSON.parse(cookie.value);
  } catch {
    return NextResponse.json(
      { error: "Invalid OAuth state cookie; click Begin login again." },
      { status: 400 },
    );
  }

  const provider = stateBlob.provider === "openai-codex" ? "openai-codex" : "anthropic";
  if (!stateBlob.state || !stateBlob.codeVerifier) {
    return NextResponse.json(
      { error: "OAuth state missing; click Begin login again." },
      { status: 400 },
    );
  }

  try {
    if (provider === "openai-codex") {
      const credential = await completeCodexLogin({
        pasteString,
        expectedState: stateBlob.state,
        codeVerifier: stateBlob.codeVerifier,
        redirectUri: stateBlob.redirectUri,
      });
      await setCredential("openai-codex", credential);
      await recordAuthEvent({
        provider: "openai-codex",
        kind: "oauth-connected",
        message: "Connected to ChatGPT via Codex OAuth.",
      }).catch(() => {});
    } else {
      const credential = await completeAnthropicLogin({
        pasteString,
        expectedState: stateBlob.state,
        codeVerifier: stateBlob.codeVerifier,
      });
      await setCredential("anthropic", credential);
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, provider });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
