/**
 * One-off cleanup after the notification review (24th Oct 2026 export).
 *
 * Deletes bell notification rows that were marked "remove":
 *  - the individual rows marked remove in the review export (by id), for kinds
 *    that are being kept (client emails, task mentions);
 *  - every row of the kinds that no longer exist: agent approvals, negative
 *    keyword removed, mail follow-up due, meeting declined;
 *  - every team-task mention that only says "done with this".
 *
 * Dry run by default: prints counts and writes a full JSON copy of every row
 * it would delete. Pass --execute to delete, which writes the same copy first.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/cleanup-reviewed-notifications.ts <export.json>
 *   node --env-file=.env --import tsx scripts/cleanup-reviewed-notifications.ts <export.json> --execute
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";
import { isBareDoneComment } from "../src/lib/team-task-mention-filter";

const REMOVED_KINDS = ["agent-approval-pending", "negative-keywords-removed", "mail-follow-up-due", "meeting-response-declined"];
const ITEM_LEVEL_KINDS = new Set(["client-email-received", "team-task-mention"]);
const BATCH = 100;

type Row = { id: number | string; kind: string; title?: string; body?: string | null };
type ExportFile = {
  categories: Array<{ kinds: Array<{ kind: string; items: Array<{ ids: string[]; decision?: string | null }> }> }>;
};

async function main(): Promise<void> {
  const exportPath = process.argv[2];
  const execute = process.argv.includes("--execute");
  if (!exportPath) throw new Error("Pass the review export JSON path");
  const review = JSON.parse(await fs.readFile(exportPath, "utf8")) as ExportFile;

  const markedIds = new Set<string>();
  for (const category of review.categories) {
    for (const kind of category.kinds) {
      if (!ITEM_LEVEL_KINDS.has(kind.kind)) continue;
      for (const item of kind.items) if (item.decision === "remove") item.ids.forEach((id) => markedIds.add(String(id)));
    }
  }

  const payload = await getPayload({ config: await payloadConfig });
  const all: Row[] = [];
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: "notifications" as never,
      where: { kind: { in: [...REMOVED_KINDS, ...ITEM_LEVEL_KINDS] } } as never,
      limit: 500,
      page,
      depth: 0,
      overrideAccess: true,
      sort: "id",
    });
    all.push(...(res.docs as unknown as Row[]));
    if (!res.hasNextPage) break;
  }

  const reasons = new Map<string, string>();
  for (const row of all) {
    const id = String(row.id);
    if (REMOVED_KINDS.includes(row.kind)) reasons.set(id, `kind removed: ${row.kind}`);
    else if (markedIds.has(id)) reasons.set(id, `marked remove: ${row.kind}`);
    else if (row.kind === "team-task-mention" && isBareDoneComment(row.body ?? "")) reasons.set(id, "bare done mention");
  }
  const targets = all.filter((row) => reasons.has(String(row.id)));

  const tally = new Map<string, number>();
  for (const reason of reasons.values()) tally.set(reason, (tally.get(reason) ?? 0) + 1);
  console.log(`Database: ${new URL(process.env.DATABASE_URL ?? "file:local").hostname || "local file"}`);
  console.log(`Marked-remove ids in export: ${markedIds.size} (found in DB: ${targets.filter((r) => markedIds.has(String(r.id))).length})`);
  for (const [reason, count] of [...tally.entries()].sort()) console.log(`  ${String(count).padStart(4)}  ${reason}`);
  console.log(`Total rows to delete: ${targets.length}`);

  // Full copy of every targeted row (all fields) so the delete can be undone.
  const full: unknown[] = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    const ids = targets.slice(i, i + BATCH).map((r) => r.id);
    const res = await payload.find({ collection: "notifications" as never, where: { id: { in: ids } } as never, limit: BATCH, depth: 0, overrideAccess: true, pagination: false });
    full.push(...res.docs);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(".gg", "tmp", `notification-cleanup-${execute ? "deleted" : "dry-run"}-${stamp}.json`);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.writeFile(backup, JSON.stringify(full, null, 2));
  console.log(`Row copy written: ${backup} (${full.length} rows)`);
  if (full.length !== targets.length) throw new Error("Row copy is incomplete; refusing to continue");

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to delete.");
    process.exit(0);
  }

  let deleted = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const ids = targets.slice(i, i + BATCH).map((r) => r.id);
    const res = await payload.delete({ collection: "notifications" as never, where: { id: { in: ids } } as never, overrideAccess: true });
    deleted += (res as { docs?: unknown[] }).docs?.length ?? 0;
    console.log(`  deleted ${deleted}/${targets.length}`);
  }
  console.log(`Done. Deleted ${deleted} rows.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
