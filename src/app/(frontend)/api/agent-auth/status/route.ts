import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getCredential, isForceFallback } from "@/lib/agents/_shared/llm/auth/store";
import { getLastFailure } from "@/lib/agents/_shared/llm/auth/events";

/**
 * GET /api/agent-auth/status
 *
 * Returns per-provider credential status for the admin UI:
 *   - whether OAuth is connected
 *   - last refresh timestamp
 *   - force-fallback flag
 *   - whether an env-var API key is set
 *
 * Auth: requires a logged-in CMS user.
 */
export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providers = ["anthropic", "moonshot", "minimax"] as const;
  const status = await Promise.all(
    providers.map(async (provider) => {
      const cred = await getCredential(provider);
      const force = await isForceFallback(provider);
      const lastFailure = await getLastFailure(provider);
      const envKey =
        provider === "anthropic"
          ? Boolean(process.env.ANTHROPIC_API_KEY)
          : provider === "moonshot"
          ? Boolean(process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY)
          : Boolean(process.env.MINIMAX_API_KEY);
      return {
        provider,
        oauthConnected: cred?.kind === "oauth",
        oauthExpiresAt: cred?.kind === "oauth" ? cred.expiresAt : null,
        oauthObtainedAt: cred?.kind === "oauth" ? cred.obtainedAt : null,
        forceFallback: force,
        envApiKeyPresent: envKey,
        lastFailure: lastFailure
          ? {
              timestamp: lastFailure.timestamp,
              message: lastFailure.message,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({ providers: status });
}
