import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { sql } from "@payloadcms/db-sqlite";
import config from "@/payload.config";

const ALLOWED_FIELDS = ["rawData", "scoredReport"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

const COLUMN_MAP: Record<AllowedField, string> = {
  rawData: "raw_data",
  scoredReport: "scored_report",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const field = req.nextUrl.searchParams.get("field") as AllowedField | null;

  if (!field || !ALLOWED_FIELDS.includes(field)) {
    return NextResponse.json(
      { error: "Invalid field. Use ?field=rawData or ?field=scoredReport" },
      { status: 400 },
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Authenticate — admin users only
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Verify the audit exists (uses Payload's findByID so access control applies)
    await payload.findByID({
      collection: "google-ads-audits",
      id,
      select: { slug: true },
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Bypass afterRead hooks by querying the database directly via Drizzle.
  // The afterRead hook strips rawData to null to prevent 413 errors on normal reads,
  // but for an explicit download we want the actual stored value.
  const column = COLUMN_MAP[field];
  const drizzle = payload.db.drizzle;
  const result = await drizzle.run(
    sql.raw(`SELECT \`${column}\` FROM \`google_ads_audits\` WHERE \`id\` = '${id.replace(/'/g, "''")}'`),
  );

  // drizzle.run returns { rows: [...] } for libSQL
  const rows = result?.rows;
  const value = rows?.[0]?.[column] ?? null;

  if (!value) {
    return NextResponse.json(
      { error: `No ${field} data found for this audit` },
      { status: 404 },
    );
  }

  // The value is stored as a JSON text column — parse it to ensure valid JSON,
  // then re-stringify with indentation for readability
  let jsonContent: string;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    jsonContent = JSON.stringify(parsed, null, 2);
  } catch {
    // If parsing fails, return the raw string
    jsonContent = typeof value === "string" ? value : JSON.stringify(value);
  }

  const filename = `audit-${id}-${field}.json`;

  return new NextResponse(jsonContent, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
