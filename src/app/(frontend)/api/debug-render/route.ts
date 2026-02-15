import { getPayload } from "payload";
import config from "@payload-config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    const payload = await getPayload({ config });
    results.payloadInit = "ok";

    // Test list query for each collection (same as admin panel does)
    const collections = [
      "users",
      "clients",
      "blog-posts",
      "test-items",
      "media",
    ] as const;

    for (const slug of collections) {
      try {
        const res = await payload.find({
          collection: slug as any,
          limit: 1,
          overrideAccess: true,
        });
        results[slug] = {
          ok: true,
          totalDocs: res.totalDocs,
          hasDoc: res.docs.length > 0,
        };
      } catch (err: any) {
        results[slug] = {
          ok: false,
          error: err?.message || String(err),
        };
      }
    }

    // Check database tables exist
    try {
      const db = payload.db as any;
      if (db.drizzle) {
        const tablesResult = await db.drizzle.run(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        results.tables = tablesResult?.rows?.map((r: any) => r[0] || r.name) || "unknown format";
      }
    } catch (err: any) {
      results.tables = { error: err?.message };
    }
  } catch (err: any) {
    results.payloadInit = { error: err?.message || String(err) };
  }

  return NextResponse.json(results, {
    headers: { "content-type": "application/json" },
  });
}
