import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

type ParsedRow = {
  isoDate: string;
  amount: number; // signed, as on the statement
  description: string;
};

/**
 * Imports a bank statement CSV.
 * - Debits (negative amounts) → `business-costs`, auto-categorised by cost rules.
 * - Credits (positive amounts) → `bank-receipts` (money received).
 *
 * Re-uploading a statement, or one that overlaps an earlier import, is safe:
 * for each date + amount + description, only occurrences beyond the number
 * already stored are imported. Two genuine identical charges on the same day
 * therefore both import the first time, and neither is re-imported later.
 */
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

    // CBA exports have no header row; other files may start with
    // "Date,Amount,Description,Balance". Every line is parsed and a header
    // line is dropped by parseRow's date/amount checks, so the first real
    // transaction is never skipped.
    if (lines.length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
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
    let total = 0;
    let categorised = 0;
    let uncategorised = 0;
    let receipts = 0;
    let duplicatesSkipped = 0;

    // key → how many matching rows already exist in the database
    const storedCounts = new Map<string, number>();
    // key → how many matching rows seen so far in this file
    const seenInFile = new Map<string, number>();

    for (const line of lines) {
      const row = parseRow(line);
      if (!row) continue;

      const isCost = row.amount < 0;
      const collection = isCost ? "business-costs" : "bank-receipts";
      const positiveAmount = Math.abs(row.amount);
      const key = `${collection}|${row.isoDate}|${positiveAmount}|${row.description}`;

      let stored = storedCounts.get(key);
      if (stored === undefined) {
        const existing = await payload.count({
          collection,
          where: {
            and: [
              { date: { equals: row.isoDate } },
              { amount: { equals: positiveAmount } },
              { description: { equals: row.description } },
            ],
          },
          overrideAccess: true,
        });
        stored = existing.totalDocs;
        storedCounts.set(key, stored);
      }

      const occurrence = (seenInFile.get(key) ?? 0) + 1;
      seenInFile.set(key, occurrence);
      if (occurrence <= stored) {
        duplicatesSkipped++;
        continue;
      }

      if (!isCost) {
        await payload.create({
          collection: "bank-receipts",
          data: {
            date: row.isoDate,
            amount: positiveAmount,
            description: row.description,
            source: "csv_import",
            importBatch: batchId,
          },
          overrideAccess: true,
        });
        receipts++;
        continue;
      }

      // Match description against rules (case-insensitive substring, first match wins)
      let categoryId: number | string | null = null;
      const descUpper = row.description.toUpperCase();
      for (const rule of rules) {
        if (descUpper.includes(rule.pattern.toUpperCase())) {
          categoryId = rule.category;
          break;
        }
      }

      await payload.create({
        collection: "business-costs",
        data: {
          date: row.isoDate,
          amount: positiveAmount,
          description: row.description,
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
      receipts,
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

/** CBA CSV row: DD/MM/YYYY,"Amount","Description","Balance". Null for headers/invalid rows. */
function parseRow(line: string): ParsedRow | null {
  const fields = parseCSVLine(line);
  if (fields.length < 3) return null;
  const [dateStr = "", amountStr = "", description = ""] = fields;

  const amount = parseFloat(amountStr.replace(/[",]/g, ""));
  if (!Number.isFinite(amount) || amount === 0) return null;

  const dateParts = dateStr.split("/");
  if (dateParts.length !== 3) return null;
  const [day = "", month = "", year = ""] = dateParts;
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;

  const cleanDescription = description.replace(/^"|"$/g, "").trim();
  if (!cleanDescription) return null;

  return { isoDate, amount, description: cleanDescription };
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
