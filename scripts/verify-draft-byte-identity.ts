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

export interface DraftBody {
  surface: string;
  index: number;
  /** Gmail Subject is stable per account and lets multi-account surfaces be aligned. */
  accountKey: string;
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

  console.log("");
  const { comparisons, failures } = compareBodies(bodies);
  for (const comparison of comparisons) console.log(`  ${comparison}`);

  if (failures.length > 0) {
    console.error(`\nFAILED: ${failures.length} account-keyed prompt body comparison(s) differ across surfaces.`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nPASS: every account-keyed prompt body is byte-identical across all available surfaces.");
}

/**
 * Each `<section class="case">` carries one surface + prompt number and embeds
 * its email bodies as iframe `srcdoc` attributes, HTML-escaped exactly once by
 * the report renderer.
 */
export function extractBodies(html: string): DraftBody[] {
  const bodies: DraftBody[] = [];
  const sections = html.split('<section class="case">').slice(1);

  for (const section of sections) {
    const surface = /<span class="tag ([a-z]+)"/.exec(section)?.[1];
    const index = /<h3>Prompt #(\d+)<\/h3>/.exec(section)?.[1];
    if (!surface || !index) continue;

    for (const match of section.matchAll(/srcdoc="([\s\S]*?)" loading/g)) {
      const body = unescapeHtml(match[1]!);
      const beforeFrame = section.slice(0, match.index);
      const subjectMatch = /<div class="kv">([\s\S]*?) &middot; <code>/.exec(beforeFrame.slice(beforeFrame.lastIndexOf('<div class="kv">')));
      const accountKey = unescapeHtml(subjectMatch?.[1] ?? "(unknown subject)").replace(/<[^>]+>/g, "").trim();
      bodies.push({
        surface,
        index: Number(index),
        accountKey,
        bytes: Buffer.byteLength(body, "utf8"),
        sha: crypto.createHash("sha256").update(body).digest("hex").slice(0, 12),
      });
    }
  }

  return bodies.sort((a, b) => a.index - b.index || surfaceRank(a.surface) - surfaceRank(b.surface));
}

export function compareBodies(bodies: DraftBody[]): { comparisons: string[]; failures: string[] } {
  const comparisons: string[] = [];
  const failures: string[] = [];
  const groups = new Map<string, DraftBody[]>();
  for (const body of bodies) {
    const key = `${body.index}\u0000${body.accountKey}`;
    groups.set(key, [...(groups.get(key) ?? []), body]);
  }
  for (const [key, group] of groups) {
    const [index, accountKey] = key.split("\u0000");
    const surfaces = [...new Set(group.map((body) => body.surface))];
    if (surfaces.length < 2) {
      comparisons.push(`prompt #${index} / ${accountKey}: only ${surfaces.join(", ")} - nothing to compare`);
      continue;
    }
    const hashes = new Set(group.map((body) => body.sha));
    const detail = group.map((body) => `${body.surface}=${body.sha}/${body.bytes}B`).join(", ");
    if (hashes.size === 1) {
      comparisons.push(`prompt #${index} / ${accountKey}: IDENTICAL across ${surfaces.join(", ")} - ${group[0]!.bytes} B`);
    } else {
      failures.push(`prompt #${index} / ${accountKey} differs: ${detail}`);
      comparisons.push(`prompt #${index} / ${accountKey}: DIFFERS - ${detail}`);
    }
  }
  return { comparisons, failures };
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

if (process.argv[1]?.endsWith("verify-draft-byte-identity.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
