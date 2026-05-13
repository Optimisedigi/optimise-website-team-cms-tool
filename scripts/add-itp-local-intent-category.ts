/**
 * Append a "Local Intent" keyword category to the in-the-picture proposal so
 * it appears on the Keyword Landscape slide. Three Sydney/Surry Hills geo
 * keywords — zero search volume is expected and fine; the slide renders the
 * keyword text with a blank volume cell.
 *
 * Idempotent: skips when a category with the same name already exists.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/add-itp-local-intent-category.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

const CATEGORY_NAME = "Local Intent";
const KEYWORDS = [
  "accounting firm Surry Hills",
  "bookkeeping services Surry Hills",
  "tax accountant Sydney",
].join("\n");

type KwCategory = { categoryName?: string | null; keywords?: string | null };

async function main(): Promise<void> {
  const payload = await getPayload({ config: payloadConfig });

  const res = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const proposal = res.docs[0] as unknown as {
    id: number;
    businessName: string;
    keywordCategories?: KwCategory[] | null;
  };
  if (!proposal) {
    console.error("Proposal 'in-the-picture' not found");
    process.exit(1);
  }

  const existing: KwCategory[] = Array.isArray(proposal.keywordCategories)
    ? proposal.keywordCategories
    : [];
  console.log(`Existing categories: ${existing.length}`);
  for (const c of existing) console.log(`  - ${c.categoryName}`);

  if (
    existing.some(
      (c) =>
        c.categoryName?.trim().toLowerCase() === CATEGORY_NAME.toLowerCase(),
    )
  ) {
    console.log(`\n"${CATEGORY_NAME}" already present — nothing to do.`);
    process.exit(0);
  }

  if (existing.length >= 6) {
    console.error(
      `\nCannot append — proposal already has 6 categories (maxRows). Remove one first.`,
    );
    process.exit(1);
  }

  const next = [
    ...existing,
    { categoryName: CATEGORY_NAME, keywords: KEYWORDS },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload as any).update({
    collection: "client-proposals",
    id: proposal.id,
    overrideAccess: true,
    data: { keywordCategories: next },
  });

  console.log(
    `\n✅ Added "${CATEGORY_NAME}" with ${KEYWORDS.split("\n").length} keywords.`,
  );
  console.log(
    "Note: zero-volume keywords are expected. The slide will show them with blank volume cells.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
