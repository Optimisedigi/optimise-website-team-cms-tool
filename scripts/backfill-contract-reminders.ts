/**
 * Backfill contract-reminders rows for every existing contract.
 *
 * Iterates every contract and calls `scheduleContractReminders()` with
 * `skipPast: true`, which marks reminders whose `sendAt` has already
 * passed as `status: "skipped"` (with a note) so they don't fire on the
 * next cron tick. Future reminders are scheduled as normal `pending`.
 *
 * Idempotent — re-running replaces only PENDING rows; SENT/FAILED/SKIPPED
 * are preserved.
 *
 * Run with: `npx tsx scripts/backfill-contract-reminders.ts`
 */
import { getPayload } from "payload";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

async function main(): Promise<void> {
  const config = (await import("../src/payload.config")).default;
  const { scheduleContractReminders } = await import(
    "../src/lib/contract-reminders"
  );

  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const all = await payload.find({
    collection: "contracts" as never,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });

  let scheduled = 0;
  let skipped = 0;
  let cleared = 0;

  for (const row of all.docs) {
    const c = row as {
      id: number | string;
      contractTitle?: string | null;
      contractDate?: string | null;
      annualReviewReminderEnabled?: boolean | null;
      annualReviewReminderRecipients?: Array<number | { id: number | string }> | null;
    };

    const result = await scheduleContractReminders(
      payload,
      {
        id: c.id,
        contractDate: c.contractDate ?? null,
        annualReviewReminderEnabled: c.annualReviewReminderEnabled ?? null,
        annualReviewReminderRecipients: c.annualReviewReminderRecipients ?? null,
      },
      { skipPast: true },
    );

    cleared += result.deletedCount;
    for (const r of result.created) {
      if (r.status === "skipped") skipped++;
      else scheduled++;
    }
    console.log(
      `\u2714 ${c.id}\t${c.contractTitle || "(untitled)"}\tcleared=${result.deletedCount}\tcreated=${result.created.length}`,
    );
  }

  console.log("\nSummary:");
  console.log(`  contracts processed: ${all.docs.length}`);
  console.log(`  pending rows cleared: ${cleared}`);
  console.log(`  scheduled (future):  ${scheduled}`);
  console.log(`  skipped  (past):     ${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  });
