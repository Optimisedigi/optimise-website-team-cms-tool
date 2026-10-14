import { NextResponse, type NextRequest } from "next/server";
import { getPayload, type Payload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { userHasFeature } from "@/lib/access";

export const MAIL_FEATURE = "nav:mail";

export interface MailUser {
  id: number;
  email?: string;
  role?: string;
}

export type MailContext = { payload: Payload; user: MailUser };

/** Auth gate shared by every /api/mail route: logged in + Mail feature. */
export async function requireMailUser(req: NextRequest): Promise<MailContext | NextResponse> {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  if (!userHasFeature(user, MAIL_FEATURE)) {
    return NextResponse.json({ error: "Mail is not enabled for your account." }, { status: 403 });
  }
  return { payload, user: user as unknown as MailUser };
}

export async function requireGmailToken(
  userId: number,
): Promise<{ accessToken: string; email: string; userEmail: string } | NextResponse> {
  const token = await getValidGmailToken(userId);
  if (!token.ok) {
    return NextResponse.json(
      { error: "gmail-not-connected", reason: token.reason, connectUrl: "/api/gmail/connect" },
      { status: 403 },
    );
  }
  return token;
}

/** Map Gmail API failures to a JSON error the UI can show. Never echoes content. */
export function gmailErrorResponse(err: unknown, fallback: string): NextResponse {
  const e = err as { code?: number; status?: number; message?: string };
  const status = Number(e.code ?? e.status ?? 0);
  if (status === 401 || status === 403) {
    return NextResponse.json(
      {
        error: "scope-insufficient",
        reason: "Gmail refused the request. Reconnect Gmail to grant the Mail permissions (read, send, archive).",
        connectUrl: "/api/gmail/connect",
      },
      { status: 403 },
    );
  }
  if (status === 404) return NextResponse.json({ error: "Not found in Gmail." }, { status: 404 });
  if (status === 429) return NextResponse.json({ error: "Gmail rate limit reached. Try again in a minute." }, { status: 429 });
  console.error(`[mail] ${fallback}:`, (e.message ?? "").slice(0, 200));
  return NextResponse.json({ error: fallback }, { status: 502 });
}

export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

const GMAIL_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;
export function parseGmailId(raw: unknown): string | null {
  return typeof raw === "string" && GMAIL_ID_RE.test(raw.trim()) ? raw.trim() : null;
}
