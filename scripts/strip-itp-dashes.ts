/**
 * One-off cleanup: walk every string field on the in-the-picture proposal,
 * strip em / en dashes, and write the result back. Matches the deck-wide
 * render-time rule but also tidies the underlying data so future edits in
 * the CMS don't show pre-existing dashes in the editor.
 *
 * Scope: top-level string fields, plus the array fields the v2 slides read
 * from (missionPriorities, commercialPhases, commercialPhases[*].features,
 * roadmapCells, competitors, keywordCategories).
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/strip-itp-dashes.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

function stripDashes(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let s = value;
  s = s.replace(/[\s\u00a0]*[\u2014\u2013][\s\u00a0]*/g, ". ");
  s = s.replace(/[\u2014\u2013]/g, "-");
  s = s.replace(/\.\s*\.\s*/g, ". ").replace(/\s{2,}/g, " ").trim();
  return s;
}

function cleanRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === "object"
          ? cleanRow(item as Record<string, unknown>)
          : stripDashes(item),
      );
    } else if (v && typeof v === "object") {
      out[k] = cleanRow(v as Record<string, unknown>);
    } else {
      out[k] = stripDashes(v);
    }
  }
  return out as T;
}

const FIELDS_TO_CLEAN = [
  // Prose string fields
  "businessGoals",
  "commercialNote",
  "roadmapMeta",
  "roadmapNote",
  "commercialMeta",
  // Array fields the v2 slides read from
  "missionPriorities",
  "commercialPhases",
  "roadmapCells",
  "competitors",
  "keywordCategories",
  "croKeyFindings",
];

async function main(): Promise<void> {
  const payload = await getPayload({ config: payloadConfig });

  const res = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proposal = res.docs[0] as any;
  if (!proposal) {
    console.error("Proposal not found");
    process.exit(1);
  }

  const data: Record<string, unknown> = {};
  let changes = 0;

  for (const field of FIELDS_TO_CLEAN) {
    const before = proposal[field];
    if (before == null) continue;
    const after = Array.isArray(before)
      ? before.map((row) =>
          row && typeof row === "object"
            ? cleanRow(row as Record<string, unknown>)
            : stripDashes(row),
        )
      : typeof before === "object"
      ? cleanRow(before as Record<string, unknown>)
      : stripDashes(before);
    const beforeStr = JSON.stringify(before);
    const afterStr = JSON.stringify(after);
    if (beforeStr !== afterStr) {
      data[field] = after;
      changes += 1;
      console.log(`  \u2022 ${field}: changed`);
    }
  }

  if (changes === 0) {
    console.log("No dashes found in tracked fields. Nothing to do.");
    process.exit(0);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload as any).update({
    collection: "client-proposals",
    id: proposal.id,
    overrideAccess: true,
    data,
  });

  console.log(`\n\u2705 Cleaned ${changes} field(s) on proposal ${proposal.id}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
