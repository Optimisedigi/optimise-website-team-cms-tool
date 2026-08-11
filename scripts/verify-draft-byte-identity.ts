/**
 * Verifies that one saved prompt produces a byte-identical Gmail email body on
 * every chat surface (individual / selected accounts / portfolio).
 *
 * Reads a report produced by `scripts/fetch-gmail-draft-bodies.ts`, recovers
 * each embedded email body from its iframe `srcdoc`, and compares bodies across
 * surfaces by prompt number. Exits non-zero when any prompt renders differently
 * between surfaces, so it can gate a release.
 *
 * The bodies are the real MIME payloads read back from the Gmail API, so this
 * compares what Gmail actually stores - not the assistant's chat reply.
 *
 * Usage:
 *   npm run optimate:verify-parity -- <gmail-bodies-report.html>
 */

import fs from "node:fs/promises";
import crypto from "node:crypto";

interface DraftBody {
  surface: string;
  index: number;
  bytes: number;
  sha: string;
}

const SURFACE_ORDER = ["individual", "selected", "portfolio"];

async function main(): Promise<void> {
  const reportPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!reportPath) {
    throw new Error("Usage: npm run optimate:verify-parity -- <gmail-bodies-report.html>");
  }

  const html = await fs.readFile(reportPath, "utf8");
  const bodies = extractBodies(html);
  if (bodies.length === 0) {
    throw new Error(`No email bodies found in ${reportPath}.`);
  }

  console.log(`Report: ${reportPath}`);
  console.log(`Email bodies found: ${bodies.length}\n`);

  for (const body of bodies) {
    console.log(
      `  ${body.surface.padEnd(11)} prompt #${body.index}  ${String(body.bytes).padStart(7)} B  sha=${body.sha}`,
    );
  }

  const indices = [...new Set(bodies.map((b) => b.index))].sort((a, b) => a - b);
  const failures: string[] = [];
  console.log("");

  for (const index of indices) {
    const forIndex = bodies.filter((b) => b.index === index);
    const surfaces = [...new Set(forIndex.map((b) => b.surface))];
    const hashes = new Set(forIndex.map((b) => b.sha));

    if (surfaces.length < 2) {
      console.log(`  prompt #${index}: only ${surfaces.join(", ")} - nothing to compare`);
      continue;
    }
    if (hashes.size === 1) {
      console.log(
        `  prompt #${index}: IDENTICAL across ${surfaces.length} surfaces (${surfaces.join(", ")}) - ${forIndex[0]!.bytes} B`,
      );
      continue;
    }

    const detail = forIndex.map((b) => `${b.surface}=${b.sha}/${b.bytes}B`).join(", ");
    failures.push(`prompt #${index} differs between surfaces: ${detail}`);
    console.log(`  prompt #${index}: DIFFERS - ${detail}`);
  }

  if (failures.length > 0) {
    console.error(`\nFAILED: ${failures.length} prompt(s) not byte-identical across surfaces.`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nPASS: every compared prompt is byte-identical across all surfaces.");
}

/**
 * Each `<section class="case">` carries one surface + prompt number and embeds
 * its email bodies as iframe `srcdoc` attributes, HTML-escaped exactly once by
 * the report renderer.
 */
function extractBodies(html: string): DraftBody[] {
  const bodies: DraftBody[] = [];
  const sections = html.split('<section class="case">').slice(1);

  for (const section of sections) {
    const surface = /<span class="tag ([a-z]+)"/.exec(section)?.[1];
    const index = /<h3>Prompt #(\d+)<\/h3>/.exec(section)?.[1];
    if (!surface || !index) continue;

    for (const match of section.matchAll(/srcdoc="([\s\S]*?)" loading/g)) {
      const body = unescapeHtml(match[1]!);
      bodies.push({
        surface,
        index: Number(index),
        bytes: body.length,
        sha: crypto.createHash("sha256").update(body).digest("hex").slice(0, 12),
      });
    }
  }

  return bodies.sort((a, b) => a.index - b.index || surfaceRank(a.surface) - surfaceRank(b.surface));
}

function surfaceRank(surface: string): number {
  const rank = SURFACE_ORDER.indexOf(surface);
  return rank === -1 ? SURFACE_ORDER.length : rank;
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
