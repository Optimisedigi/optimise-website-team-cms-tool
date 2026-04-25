import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Debug-only endpoint. POST /api/meeting-schedulers/_debug?id=2
 * Header: x-api-key: $AUDIT_API_KEY
 *
 * Tries to update the given meeting scheduler with a hardcoded test
 * attendee, returns the full error stack on failure so we can see
 * the actual server-side error that the admin UI hides as
 * "Something went wrong".
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.AUDIT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") || "2", 10);

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Inspect raw DB columns first
  const client = (payload.db as any).client;
  let mainCols: any = null;
  let attCols: any = null;
  let rawDoc: any = null;
  try {
    const r1 = await client.execute("PRAGMA table_info(`meeting_schedulers`)");
    mainCols = r1.rows;
  } catch (e: any) { mainCols = String(e); }
  try {
    const r2 = await client.execute("PRAGMA table_info(`meeting_schedulers_attendees`)");
    attCols = r2.rows;
  } catch (e: any) { attCols = String(e); }
  try {
    const r3 = await client.execute(`SELECT * FROM meeting_schedulers WHERE id = ${id}`);
    rawDoc = r3.rows[0];
  } catch (e: any) { rawDoc = String(e); }

  // Try a payload.update with one attendee
  let updateError: any = null;
  let updateSuccess: any = null;
  try {
    const result = await payload.update({
      collection: "meeting-schedulers" as any,
      id,
      data: {
        attendees: [
          { name: "Debug Test", email: "debug@example.com" },
        ],
      } as any,
      overrideAccess: true,
    });
    updateSuccess = { id: (result as any)?.id, attendees: (result as any)?.attendees };
  } catch (err: any) {
    updateError = {
      message: err?.message || String(err),
      name: err?.name,
      stack: err?.stack?.split("\n").slice(0, 12).join("\n"),
      data: err?.data,
      cause: err?.cause ? String(err.cause) : undefined,
    };
  }

  return NextResponse.json({
    id,
    mainCols,
    attCols,
    rawDoc,
    updateSuccess,
    updateError,
  });
}
