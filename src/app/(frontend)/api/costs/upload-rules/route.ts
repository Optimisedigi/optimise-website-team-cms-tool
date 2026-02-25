import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

/**
 * Bulk import cost rules from CSV.
 * Expected format (header row required):
 *   Pattern,Category
 *
 * - Pattern (required): case-insensitive substring to match transaction descriptions, e.g. "VERCEL"
 * - Category (required): exact name of an existing cost category, e.g. "Infrastructure"
 *
 * Duplicates (by pattern) are skipped.
 * If the category name doesn't match an existing category, the row is skipped with an error.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Load all categories for name → id lookup
    const categoriesResult = await payload.find({
      collection: "cost-categories",
      limit: 500,
      overrideAccess: true,
    });
    const categoryByName = new Map<string, number | string>();
    for (const cat of categoriesResult.docs) {
      categoryByName.set(((cat as any).name as string).toLowerCase(), cat.id);
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      const pattern = fields[0]?.trim();
      const categoryName = fields[1]?.trim();
      if (!pattern || !categoryName) continue;

      const categoryId = categoryByName.get(categoryName.toLowerCase());
      if (!categoryId) {
        errors.push(`Row ${i + 1}: category "${categoryName}" not found`);
        continue;
      }

      // Check for duplicate pattern
      const existing = await payload.find({
        collection: "cost-rules",
        where: { pattern: { equals: pattern } },
        limit: 1,
        overrideAccess: true,
      });

      if (existing.totalDocs > 0) {
        skipped++;
        continue;
      }

      try {
        await payload.create({
          collection: "cost-rules",
          data: {
            pattern,
            category: categoryId as any,
          },
          overrideAccess: true,
        });
        created++;
      } catch (err: any) {
        errors.push(`Row ${i + 1} "${pattern}": ${err?.message || String(err)}`);
      }
    }

    return NextResponse.json({ created, skipped, errors });
  } catch (err) {
    console.error("[costs/upload-rules] error:", err);
    return NextResponse.json({ error: "Failed to import rules", details: String(err) }, { status: 500 });
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
