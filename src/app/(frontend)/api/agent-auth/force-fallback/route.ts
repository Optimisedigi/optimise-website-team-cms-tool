import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { setForceFallback } from "@/lib/agents/_shared/llm/auth/store";

/**
 * POST /api/agent-auth/force-fallback
 * Body: { provider: 'anthropic' | 'moonshot' | 'minimax', enabled: boolean }
 *
 * Toggles the emergency "force API key" flag for a provider. When on, the
 * resolver skips OAuth even if a stored OAuth credential exists.
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

  let body: { provider?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.provider !== "anthropic" && body.provider !== "moonshot" && body.provider !== "minimax") {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  await setForceFallback(body.provider, body.enabled);
  return NextResponse.json({ ok: true });
}
