import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { completeCodexLogin } from "@/lib/agents/_shared/llm/auth/oauth/openai-codex";
import { setCredential } from "@/lib/agents/_shared/llm/auth/store";
import { recordAuthEvent } from "@/lib/agents/_shared/llm/auth/events";

const STATE_COOKIE = "agent-auth-state";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function html(message: string, ok: boolean): string {
  const title = ok ? "GPT OAuth connected" : "GPT OAuth failed";
  const safeMessage = escapeHtml(message);
  const color = ok ? "#15803d" : "#b91c1c";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 48px; color: #111827; }
      .card { max-width: 560px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      h1 { color: ${color}; margin: 0 0 12px; font-size: 22px; }
      p { line-height: 1.5; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${safeMessage}</p>
      <p>You can close this tab and return to OptiMate settings.</p>
    </div>
    <script>
      try { window.opener && window.opener.postMessage({ type: "optimate-oauth-connected", provider: "openai-codex", ok: ${ok ? "true" : "false"} }, window.location.origin); } catch {}
      try { localStorage.setItem("optimate-oauth-openai-codex", JSON.stringify({ ok: ${ok ? "true" : "false"}, at: Date.now() })); } catch {}
      ${ok ? "setTimeout(() => window.close(), 1200);" : ""}
    </script>
  </body>
</html>`;
}

/**
 * GET /api/agent-auth/callback/openai-codex
 *
 * Browser callback for ChatGPT/Codex OAuth. This replaces the CLI loopback
 * redirect (`localhost:1455`) so the login can complete from the deployed CMS.
 */
export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return new NextResponse(html("Your CMS session was not found. Reopen OptiMate settings and click Begin login again.", false), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const cookie = req.cookies.get(STATE_COOKIE);
  if (!cookie?.value) {
    return new NextResponse(html("The OAuth state cookie expired or was not found. Reopen OptiMate settings and click Begin login again.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let stateBlob: { provider?: string; state?: string; codeVerifier?: string; redirectUri?: string };
  try {
    stateBlob = JSON.parse(cookie.value);
  } catch {
    return new NextResponse(html("The OAuth state cookie was invalid. Reopen OptiMate settings and click Begin login again.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (stateBlob.provider !== "openai-codex" || !stateBlob.state || !stateBlob.codeVerifier) {
    return new NextResponse(html("The OAuth flow was not started for GPT/Codex. Reopen OptiMate settings and click Begin login again.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  try {
    const credential = await completeCodexLogin({
      pasteString: req.nextUrl.toString(),
      expectedState: stateBlob.state,
      codeVerifier: stateBlob.codeVerifier,
      redirectUri: stateBlob.redirectUri,
    });
    await setCredential("openai-codex", credential);
    await recordAuthEvent({
      provider: "openai-codex",
      kind: "oauth-connected",
      message: "Connected to ChatGPT via Codex OAuth callback.",
    }).catch(() => {});
  } catch (err) {
    return new NextResponse(html((err as Error).message, false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const res = new NextResponse(html("ChatGPT is connected to OptiMate via Codex OAuth.", true), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
