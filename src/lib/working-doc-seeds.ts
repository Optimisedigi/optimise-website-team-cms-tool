import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Registry of PIN-gated working documents rendered by
 * `WorkingDocReviewEditor`. This is the single source of truth: adding an entry
 * here whitelists the slug for PIN access (see `working-doc-auth.ts`) and lets
 * the API route seed the first revision automatically.
 *
 * To onboard a new review document:
 *   1. Drop the initial markdown at `src/content/<seedFile>`.
 *   2. Add one entry below, keyed by `<clientSlug>/<docName>`.
 *   3. Render `<WorkingDocReviewEditor docSlug="<clientSlug>/<docName>" … />`
 *      from a page under `src/app/(frontend)/<clientSlug>/<docName>/page.tsx`.
 *
 * The `<clientSlug>` segment must match an existing client's `slug`; that
 * client's `clientPin` unlocks the document.
 */
export type WorkingDocSeed = {
  /** Human title stored on the first seeded revision. */
  title: string;
  /** Seed markdown file relative to `src/content`. */
  seedFile: string;
};

export const WORKING_DOC_SEEDS: Record<string, WorkingDocSeed> = {
  "cipher/patient-journey-review": {
    title: "Cipher Health patient journey review",
    seedFile: "cipher-health-patient-journey-review.md",
  },
};

export function isKnownWorkingDocSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(WORKING_DOC_SEEDS, slug);
}

/**
 * Build the seed payload for `loadWorkingDoc`, or `undefined` when the slug has
 * no registered seed (an unknown slug simply 404s at load time).
 */
export async function workingDocSeed(slug: string) {
  const entry = WORKING_DOC_SEEDS[slug];
  if (!entry) return undefined;
  const [clientSlug, deckSlug] = slug.split("/", 2);
  const contentMarkdown = await readFile(
    path.join(process.cwd(), "src/content", entry.seedFile),
    "utf8",
  );
  return { title: entry.title, clientSlug, deckSlug, contentMarkdown };
}
