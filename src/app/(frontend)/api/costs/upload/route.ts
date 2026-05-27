import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "business-costs")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    // Expect header: Date,Amount,Description,Balance
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
    }

    // Load cost rules for auto-categorisation
    const rulesResult = await payload.find({
      collection: "cost-rules",
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    const rules = rulesResult.docs as Array<{ pattern: string; category: number | string }>;

    const batchId = `csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dataLines = lines.slice(1); // skip header

    let total = 0;
    let categorised = 0;
    let uncategorised = 0;
    let duplicatesSkipped = 0;

    for (const line of dataLines) {
      // CBA CSV format: DD/MM/YYYY,"Amount","Description","Balance"
      // Handle quoted fields
      const fields = parseCSVLine(line);
      if (fields.length < 3) continue;

      const [dateStr, amountStr, description] = fields;
      const amount = parseFloat(amountStr.replace(/[",]/g, ""));

      // Only import debits (negative amounts in CBA CSV)
      if (isNaN(amount) || amount >= 0) continue;

      // Parse DD/MM/YYYY
      const dateParts = dateStr.split("/");
      if (dateParts.length !== 3) continue;
      const [day, month, year] = dateParts;
      const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;

      const positiveAmount = Math.abs(amount);
      const cleanDescription = description.replace(/^"|"$/g, "").trim();

      // Deduplicate: skip if date + amount + description already exists
      const existing = await payload.find({
        collection: "business-costs",
        where: {
          and: [
            { date: { equals: isoDate } },
            { amount: { equals: positiveAmount } },
            { description: { equals: cleanDescription } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      });

      if (existing.totalDocs > 0) {
        duplicatesSkipped++;
        continue;
      }

      // Match description against rules (case-insensitive substring, first match wins)
      let categoryId: number | string | null = null;
      const descUpper = cleanDescription.toUpperCase();
      for (const rule of rules) {
        if (descUpper.includes(rule.pattern.toUpperCase())) {
          categoryId = rule.category;
          break;
        }
      }

      await payload.create({
        collection: "business-costs",
        data: {
          date: isoDate,
          amount: positiveAmount,
          description: cleanDescription,
          category: categoryId as any,
          source: "csv_import",
          importBatch: batchId,
        },
        overrideAccess: true,
      });

      total++;
      if (categoryId) {
        categorised++;
      } else {
        uncategorised++;
      }
    }

    return NextResponse.json({
      total,
      categorised,
      uncategorised,
      duplicatesSkipped,
      batchId,
    });
  } catch (err) {
    console.error("[costs/upload] error:", err);
    return NextResponse.json(
      { error: "Failed to process CSV", details: String(err) },
      { status: 500 },
    );
  }
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}
