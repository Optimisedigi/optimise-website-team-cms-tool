/**
 * Apply handler: stakeholder-deck
 *
 * Writes a 5-slide deck to disk under
 * `src/app/(frontend)/partners/google-ads-audit/<slug>/`:
 *   - page.tsx   — built from the proposalPayload via generateDeckTsx()
 *   - globals.css — verbatim baseline shared across all decks
 *
 * v1 ships in "local-dev-only" mode. Vercel's runtime filesystem is
 * read-only, so writing source files on a deployed function never
 * surfaces in a build. We refuse to run when NODE_ENV=production and
 * return a clear error. The operator hits Apply on their laptop, the
 * files appear on disk, and the existing manual commit+push workflow
 * carries them to production.
 *
 * TODO (v1.1): swap the fs.writeFile path for an Octokit
 * `PUT /repos/{owner}/{repo}/contents/{path}` call so Apply works in
 * production. Requires GITHUB_DECK_WRITE_TOKEN env var scoped to
 * contents:write on the deployed repo. See the v1 plan for the upgrade
 * path.
 */

import { promises as fs } from "fs";
import path from "path";

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import {
  DECK_GLOBALS_CSS,
  generateDeckTsx,
  type DeckPayload,
} from "./_deck-templates";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function coercePayload(raw: Record<string, unknown>): DeckPayload {
  // Re-validate the fields the apply handler depends on. The propose
  // tool already validated the same fields, but apply can be called on
  // an arbitrarily-old queued row so we don't trust the shape blindly.
  const required = [
    "clientName",
    "shortName",
    "slug",
    "launchDate",
    "reviewDate",
    "shippedDid",
    "shippedProduced",
    "formsLeads",
    "phonesLeads",
    "leadsCopy",
    "keywordsSubtitle",
    "keywordStats",
    "keywordRows",
    "nextItems",
  ] as const;
  for (const k of required) {
    if (raw[k] === undefined || raw[k] === null) {
      throw new Error(`stakeholder-deck: payload missing required field "${k}"`);
    }
  }
  const slug = String(raw.slug);
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(`stakeholder-deck: slug "${slug}" failed kebab-case validation`);
  }
  return raw as unknown as DeckPayload;
}

export const applyStakeholderDeck: ApplyHandler = async (
  rawPayload,
  _ctx,
): Promise<ApplyHandlerResult> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "stakeholder-deck apply is disabled in production for v1 (Vercel filesystem is read-only). " +
        "Pull the proposalPayload locally and run Apply from `npm run dev`, then commit the generated files. " +
        "v1.1 will swap this to a GitHub commit via Octokit.",
    );
  }

  const payload = coercePayload(rawPayload);
  const projectRoot = process.cwd();
  const folderPath = path.join(
    projectRoot,
    "src",
    "app",
    "(frontend)",
    "partners",
    "google-ads-audit",
    payload.slug,
  );

  // Slug collision check — refuse to silently overwrite an existing
  // hand-tweaked deck. Operator must change the slug or delete the
  // existing folder first.
  let existing = false;
  try {
    await fs.access(folderPath);
    existing = true;
  } catch {
    existing = false;
  }
  if (existing) {
    throw new Error(
      `stakeholder-deck: folder already exists at ${folderPath}. Change the slug or delete the existing folder before re-applying.`,
    );
  }

  await fs.mkdir(folderPath, { recursive: true });

  const pageTsx = generateDeckTsx(payload);
  const pageTsxPath = path.join(folderPath, "page.tsx");
  const globalsCssPath = path.join(folderPath, "globals.css");

  await fs.writeFile(pageTsxPath, pageTsx, "utf8");
  await fs.writeFile(globalsCssPath, DECK_GLOBALS_CSS, "utf8");

  const urlPath = `/partners/google-ads-audit/${payload.slug}`;

  return {
    message: `Wrote deck files for ${payload.clientName} (${payload.shortName}) to ${path.relative(projectRoot, folderPath)}. Commit and push to deploy. Local preview at ${urlPath}.`,
    detail: {
      folderPath: path.relative(projectRoot, folderPath),
      pageTsxPath: path.relative(projectRoot, pageTsxPath),
      globalsCssPath: path.relative(projectRoot, globalsCssPath),
      urlPath,
      slug: payload.slug,
    },
  };
};
