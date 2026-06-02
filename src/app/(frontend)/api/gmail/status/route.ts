import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { getPrimaryGmailSignature } from "@/lib/gmail-service";

/**
 * GET /api/gmail/status
 *
 * Lightweight connection probe for the OptiMate launcher's Gmail reply flow.
 * Returns whether the logged-in user has connected their Gmail account and,
 * if so, the connected address. The Users collection stores `gmailConnected`
 * / `gmailEmail` but does not save them to the JWT, so the client `useAuth()`
 * user can't be relied on to expose them — this route reads them server-side.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const fresh = (await payload.findByID({
    collection: "users",
    id: user.id,
    depth: 0,
    overrideAccess: true,
  })) as { gmailConnected?: boolean; gmailEmail?: string | null; gmailTokenExpiry?: string | null };

  let settingsAccess = false;
  let hasSignature = false;
  let reconnectRequired = false;

  if (fresh.gmailConnected) {
    const userId = typeof user.id === "number" ? user.id : Number(user.id);
    const token = await getValidGmailToken(userId);
    if (token.ok) {
      try {
        const signature = await getPrimaryGmailSignature(token.accessToken);
        settingsAccess = true;
        hasSignature = signature.trim().length > 0;
      } catch {
        reconnectRequired = true;
      }
    } else {
      reconnectRequired = true;
    }
  }

  return NextResponse.json({
    connected: Boolean(fresh.gmailConnected),
    email: fresh.gmailEmail ?? null,
    tokenExpiry: fresh.gmailTokenExpiry ?? null,
    settingsAccess,
    hasSignature,
    reconnectRequired,
  });
}
