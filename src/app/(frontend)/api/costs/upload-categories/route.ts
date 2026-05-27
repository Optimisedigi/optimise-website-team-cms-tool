import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

/**
 * Bulk import cost categories from CSV.
 * Expected format (header row required):
 *   Name,Color,Budget
 *
 * - Name (required): category name, e.g. "Infrastructure"
 * - Color (optional): hex colour, defaults to #4A90D9
 * - Budget (optional): monthly budget in AUD, leave blank for no budget
 *
 * Duplicates (by name) are skipped.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "cost-categories")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      const name = fields[0]?.trim();
      if (!name) continue;

      const color = fields[1]?.trim() || "#4A90D9";
      const budgetStr = fields[2]?.trim();
      const budget = budgetStr ? parseFloat(budgetStr) : undefined;

      // Check for duplicate
      const existing = await payload.find({
        collection: "cost-categories",
        where: { name: { equals: name } },
        limit: 1,
        overrideAccess: true,
      });

      if (existing.totalDocs > 0) {
        skipped++;
        continue;
      }

      try {
        await payload.create({
          collection: "cost-categories",
          data: {
            name,
            color,
            budget: budget && !isNaN(budget) ? budget : undefined,
            isActive: true,
          },
          overrideAccess: true,
        });
        created++;
      } catch (err: any) {
        errors.push(`Row ${i + 1} "${name}": ${err?.message || String(err)}`);
      }
    }

    return NextResponse.json({ created, skipped, errors });
  } catch (err) {
    console.error("[costs/upload-categories] error:", err);
    return NextResponse.json({ error: "Failed to import categories", details: String(err) }, { status: 500 });
  }
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; }
    else current += ch;
  }
  fields.push(current.trim());
  return fields;
}
