/**
 * One-time migration: copy `legacyNotes` content from each client into a new
 * `clientNotes` array entry, so we can safely hide the legacyNotes field.
 *
 * For each client that has non-empty `legacy_notes`:
 *   - Insert one row into `client_notes` with:
 *       category = 'general'
 *       date     = the client's createdAt (so the note sits at the right
 *                  point in the timeline, not as if it was just written today)
 *       author   = 'system (migrated from legacy notes)'
 *       content  = the original legacyNotes text
 *   - Clear the original `legacy_notes` column (so the field is empty even
 *     though we're hiding it; nothing to leak if it ever gets unhidden).
 *
 * Idempotent guard: if a client already has a clientNotes entry whose author
 * starts with 'system (migrated from legacy notes)', we skip it.
 *
 * NOTE: writes to whatever DATABASE_URL points at — currently prod Turso.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const MIGRATED_AUTHOR = "system (migrated from legacy notes)";

async function main() {
  const db = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const clientsWithLegacy = await db.execute(
    "SELECT id, name, legacy_notes, created_at FROM clients WHERE legacy_notes IS NOT NULL AND TRIM(legacy_notes) != ''",
  );

  console.log(`Found ${clientsWithLegacy.rows.length} clients with legacyNotes content.`);

  let migrated = 0;
  let skipped = 0;
  for (const row of clientsWithLegacy.rows as any[]) {
    const clientId = Number(row.id);
    const clientName = row.name as string;
    const legacyText = String(row.legacy_notes).trim();
    const createdAt = (row.created_at as string) || new Date().toISOString();

    // Idempotent: skip if already migrated
    const existing = await db.execute({
      sql: "SELECT id FROM client_notes WHERE _parent_id = ? AND author = ? LIMIT 1",
      args: [clientId, MIGRATED_AUTHOR],
    });
    if (existing.rows.length > 0) {
      console.log(`  [skip] ${clientName} (id=${clientId}) already migrated`);
      skipped++;
      continue;
    }

    // Determine the next _order for this client (insert at top — order=1, push others down)
    // Simpler: just append to the end with order = current_max + 1
    const orderRes = await db.execute({
      sql: "SELECT COALESCE(MAX(_order), 0) + 1 AS next_order FROM client_notes WHERE _parent_id = ?",
      args: [clientId],
    });
    const nextOrder = Number((orderRes.rows[0] as any).next_order);

    await db.execute({
      sql: `INSERT INTO client_notes (_order, _parent_id, id, category, date, author, content)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nextOrder,
        clientId,
        randomUUID(),
        "general",
        createdAt,
        MIGRATED_AUTHOR,
        legacyText,
      ],
    });

    // Clear the legacyNotes column
    await db.execute({
      sql: "UPDATE clients SET legacy_notes = NULL WHERE id = ?",
      args: [clientId],
    });

    console.log(`  [done] ${clientName} (id=${clientId}) — moved ${legacyText.length} chars`);
    migrated++;
  }

  console.log(`\n✓ Migrated ${migrated}, skipped ${skipped}`);

  // Verify
  const remaining = await db.execute(
    "SELECT COUNT(*) AS c FROM clients WHERE legacy_notes IS NOT NULL AND TRIM(legacy_notes) != ''",
  );
  console.log(`Remaining clients with legacy_notes content: ${(remaining.rows[0] as any).c}`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
