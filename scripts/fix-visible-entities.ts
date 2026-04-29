/**
 * One-shot codemod: replace the broken inline `visibleEntities = { ... }`
 * blocks in every custom admin page with a call to `getVisibleEntities`
 * from src/lib/visible-entities.ts. The previous inline filter
 * (`!c.admin?.hidden`) silently broke the moment we made `admin.hidden`
 * a function, leaving the sidebar empty for non-admin users on those
 * custom pages.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";

const FILES = [
  "src/app/(payload)/admin/settings/integrations/page.tsx",
  "src/app/(payload)/admin/google-ads/negative-sweep/page.tsx",
  "src/app/(payload)/admin/blog/prompter/page.tsx",
  "src/app/(payload)/admin/finance/costs/page.tsx",
  "src/app/(payload)/admin/finance/invoices/page.tsx",
  "src/app/(payload)/admin/finance/usage/page.tsx",
  "src/app/(payload)/admin/growth-tools/indexing-helper/page.tsx",
  "src/app/(payload)/admin/deployments/page.tsx",
];

const HELPER_ABS = resolve("src/lib/visible-entities.ts");

const OLD_BLOCK = `  const visibleEntities = {
    collections: payload.config.collections
      .filter((c) => !c.admin?.hidden)
      .map((c) => c.slug),
    globals: payload.config.globals
      .filter((g) => !g.admin?.hidden)
      .map((g) => g.slug),
  }`;

for (const file of FILES) {
  const abs = resolve(file);
  let src = readFileSync(abs, "utf8");

  if (!src.includes(OLD_BLOCK)) {
    console.log(`SKIP  ${file} — no matching block`);
    continue;
  }

  // Compute relative path from this file's directory to the helper
  const fromDir = dirname(abs);
  let rel = relative(fromDir, HELPER_ABS).replace(/\.ts$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;

  // Insert import line after the last `import` line in the file's preamble
  const importLine = `import { getVisibleEntities } from '${rel}'`;
  if (!src.includes("getVisibleEntities")) {
    // Find the last import statement, insert after it
    const lines = src.split("\n");
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import /.test(lines[i])) lastImportIdx = i;
    }
    if (lastImportIdx === -1) {
      throw new Error(`No import lines in ${file}`);
    }
    lines.splice(lastImportIdx + 1, 0, importLine);
    src = lines.join("\n");
  }

  // Replace the inline block with the helper call
  src = src.replace(OLD_BLOCK, "  const visibleEntities = getVisibleEntities(payload, user)");

  writeFileSync(abs, src);
  console.log(`OK    ${file}`);
}
