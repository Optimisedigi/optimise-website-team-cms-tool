import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

const GROWTH_TOOLS_URL =
  process.env.GROWTH_TOOLS_URL || "http://localhost:5000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

/**
 * POST /api/google-ads-audits/[id]/chat
 *
 * Proxies a natural language question to Growth Tools' Google Ads chat endpoint.
 * Looks up the customerId from the audit doc so the caller only needs the CMS ID.
 *
 * Body: { message: string, history?: Array<{ role: "user"|"assistant", content: string }> }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: "INTERNAL_API_KEY not configured" },
        { status: 503 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { message, history, sessionId } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    // Fetch audit doc to get customerId
    const doc = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });

    if (!doc) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const customerId = (doc as any).customerId;
    if (!customerId) {
      return NextResponse.json(
        { error: "Audit doc has no customerId" },
        { status: 400 },
      );
    }

    // Forward to Growth Tools
    const chatRes = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        customerId,
        message,
        sessionId: sessionId || "",
        history: history || [],
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      return NextResponse.json(
        { error: `Chat service error: ${errText}` },
        { status: 502 },
      );
    }

    const result = await chatRes.json();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[google-ads-chat] error:", err);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 },
    );
  }
}
