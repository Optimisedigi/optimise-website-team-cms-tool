import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { completeAnthropicLogin } from "@/lib/agents/_shared/llm/auth/oauth/anthropic";
import { setCredential } from "@/lib/agents/_shared/llm/auth/store";

const STATE_COOKIE = "agent-auth-state";

/**
 * POST /api/agent-auth/complete
 * Body: { pasteString: "code#state" }
 *
 * Validates the paste against the cookie-stored state + verifier, exchanges
 * the code with Anthropic, stores the resulting OAuth credential encrypted.
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
      { error: "pasteString is required (format: code#state)" },
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

  let stateBlob: { state: string; codeVerifier: string };
  try {
    stateBlob = JSON.parse(cookie.value);
  } catch {
    return NextResponse.json(
      { error: "Invalid OAuth state cookie; click Begin login again." },
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
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
