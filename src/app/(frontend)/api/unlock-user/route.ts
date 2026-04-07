import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { createClient } from "@libsql/client";

// POST /api/unlock-user — resets a user's failedLoginCount to 0
// Requires x-api-key header matching AUDIT_API_KEY
export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.AUDIT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await req.json().catch(() => ({}));
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    // Try Payload update first (might work if the rels columns exist)
    const payload = await getPayload({ config });
    await payload.update({
      collection: "users",
      where: { email: { equals: email } },
      data: { failedLoginCount: 0 } as any,
      overrideAccess: true,
    });

    return NextResponse.json({ success: true, message: "Failed login count reset via Payload" });
  } catch (payloadErr: unknown) {
    const msg = payloadErr instanceof Error ? payloadErr.message : String(payloadErr);

    // If Payload fails due to missing rels column, fall back to direct SQL
    if (msg.includes("payload_locked_documents_rels") || msg.includes("no such column")) {
      try {
        const db = createClient({
          url: process.env.DATABASE_URL!,
          authToken: process.env.DATABASE_AUTH_TOKEN,
        });

        const userResult = await db.execute({
          sql: `SELECT id FROM users WHERE email = ?`,
          args: [email],
        });

        if (!userResult.rows || userResult.rows.length === 0) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const userId = String((userResult.rows[0] as Record<string, unknown>).id);

        await db.execute({
          sql: `UPDATE users SET failed_login_count = 0 WHERE id = ?`,
          args: [userId],
        });

        return NextResponse.json({ success: true, message: "Failed login count reset via direct SQL" });
      } catch (sqlErr) {
        return NextResponse.json(
          { error: "SQL fallback failed", detail: String(sqlErr) },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      { error: "Payload update failed", detail: msg },
      { status: 500 },
    );
  }
}
