/**
 * Render a side-by-side before/after comparison of two prompt-dump JSON files
 * produced by `scripts/optimate-prompt-regression-dump.ts`.
 *
 * Cases are matched on surface + index. For each case the report shows the
 * saved prompt text, the tools invoked, whether a real Gmail draft id came
 * back, and the verbatim reply from each run.
 *
 * Usage:
 *   npm run optimate:prompt-compare -- <before.json> <after.json>
 */

import fs from "node:fs/promises";
import path from "node:path";

interface ActivityRow {
  toolName?: string | null;
  output?: unknown;
}

interface CaseResult {
  surface: string;
  index: number;
  prompt: string;
  reply?: string;
  error?: string;
  durationMs: number;
  shortcutIntent: string;
  activityRows: ActivityRow[];
}

interface DumpFile {
  generatedAt: string;
  results: CaseResult[];
}

const OUTPUT_DIR = ".gg/optimate-prompt-dumps";

async function main(): Promise<void> {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    throw new Error("Usage: npm run optimate:prompt-compare -- <before.json> <after.json>");
  }

  const before = JSON.parse(await fs.readFile(beforePath, "utf8")) as DumpFile;
  const after = JSON.parse(await fs.readFile(afterPath, "utf8")) as DumpFile;

  const keys = [...new Set([...before.results, ...after.results].map(keyOf))];
  const rows = keys.map((key) => ({
    key,
    before: before.results.find((r) => keyOf(r) === key),
    after: after.results.find((r) => keyOf(r) === key),
  }));

  const outPath = path.join(
    OUTPUT_DIR,
    `optimate-prompt-comparison-${new Date().toISOString().replace(/[:.]/g, "-")}.html`,
  );
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(outPath, render(rows, before, after, beforePath, afterPath), "utf8");

  console.log("Before/after summary\n");
  for (const row of rows) {
    console.log(
      `${row.key.padEnd(14)} drafts ${draftCount(row.before)} -> ${draftCount(row.after)}   ` +
        `${verdict(row.before)} -> ${verdict(row.after)}`,
    );
  }
  console.log(`\nWritten: ${outPath}`);
}

function keyOf(result: CaseResult): string {
  return `${result.surface}#${result.index}`;
}

function draftIds(result?: CaseResult): string[] {
  if (!result) return [];
  const found = new Set<string>();
  for (const row of result.activityRows) {
    const serialised = typeof row.output === "string" ? row.output : JSON.stringify(row.output ?? "");
    for (const match of serialised.matchAll(/"draftId":"([^"]+)"/g)) found.add(match[1]);
  }
  return [...found];
}

function draftCount(result?: CaseResult): number {
  return draftIds(result).length;
}

/** Classify the outcome so the regression (clarification stall) is obvious. */
function verdict(result?: CaseResult): string {
  if (!result) return "absent";
  if (result.error) return "error";
  if (draftCount(result) > 0) return "DRAFT CREATED";
  const reply = (result.reply ?? "").toLowerCase();
  if (/^\s*which\b/.test(reply) || /which (dashboard|graph|weekly|monthly|component)/.test(reply)) {
    return "clarification stall";
  }
  const tools = result.activityRows.filter((r) => r.toolName).length;
  return tools > 0 ? "answered (no draft)" : "no tool call";
}

function render(
  rows: Array<{ key: string; before?: CaseResult; after?: CaseResult }>,
  before: DumpFile,
  after: DumpFile,
  beforePath: string,
  afterPath: string,
): string {
  const cards = rows
    .map((row) => {
      const prompt = row.after?.prompt ?? row.before?.prompt ?? "";
      const promptChanged = row.before && row.after && row.before.prompt !== row.after.prompt;
      return `
<section class="case">
  <h2>${esc(row.key)}</h2>
  ${
    promptChanged
      ? `<div class="prompts">
      <div><span class="tag old">prompt before</span><pre>${esc(row.before!.prompt)}</pre></div>
      <div><span class="tag new">prompt after</span><pre>${esc(row.after!.prompt)}</pre></div>
    </div>`
      : `<div><span class="tag">prompt (unchanged)</span><pre>${esc(prompt)}</pre></div>`
  }
  <div class="grid">
    ${column("BEFORE", row.before)}
    ${column("AFTER", row.after)}
  </div>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>OptiMate prompt fix — before/after</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin:0; background:#f6f7f9; color:#1f2933; }
  .wrap { max-width: 1400px; margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .meta { color:#616e7c; font-size:13px; margin-bottom:28px; }
  .case { background:#fff; border:1px solid #e4e7eb; border-radius:10px; padding:20px; margin-bottom:22px; }
  .case h2 { margin:0 0 12px; font-size:17px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:14px; }
  .col { border:1px solid #e4e7eb; border-radius:8px; padding:14px; background:#fcfcfd; min-width:0; }
  .col h3 { margin:0 0 10px; font-size:12px; letter-spacing:.08em; color:#616e7c; }
  pre { white-space:pre-wrap; word-break:break-word; background:#f5f7fa; border:1px solid #e4e7eb;
        border-radius:6px; padding:10px; font-size:12.5px; line-height:1.5; margin:6px 0; }
  .tag { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px; background:#e4e7eb; color:#3e4c59; margin-bottom:2px; }
  .tag.old { background:#fce8e6; color:#a61b1b; } .tag.new { background:#e3f9e5; color:#0b6b2f; }
  .prompts { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .verdict { display:inline-block; font-weight:600; font-size:12px; padding:4px 10px; border-radius:6px; }
  .v-draft { background:#e3f9e5; color:#0b6b2f; }
  .v-stall { background:#fce8e6; color:#a61b1b; }
  .v-other { background:#f0f4f8; color:#3e4c59; }
  .kv { font-size:12px; color:#52606d; margin:4px 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
</style></head><body><div class="wrap">
<h1>OptiMate saved-prompt fix — before / after</h1>
<div class="meta">
  BEFORE: <code>${esc(path.basename(beforePath))}</code> (${esc(before.generatedAt)})<br>
  AFTER: <code>${esc(path.basename(afterPath))}</code> (${esc(after.generatedAt)})
</div>
${cards}
</div></body></html>`;
}

function column(label: string, result?: CaseResult): string {
  if (!result) return `<div class="col"><h3>${label}</h3><em>not run</em></div>`;
  const v = verdict(result);
  const cls = v === "DRAFT CREATED" ? "v-draft" : v === "clarification stall" ? "v-stall" : "v-other";
  const tools = result.activityRows.filter((r) => r.toolName).map((r) => String(r.toolName));
  const ids = draftIds(result);
  return `<div class="col">
  <h3>${label}</h3>
  <span class="verdict ${cls}">${esc(v)}</span>
  <div class="kv">tools: ${tools.length ? esc(tools.join(", ")) : "(none)"}</div>
  <div class="kv">draft ids: ${ids.length ? esc(ids.join(", ")) : "(none)"}</div>
  <div class="kv">shortcut: ${esc(result.shortcutIntent)}</div>
  <div class="kv">duration: ${Math.round(result.durationMs / 1000)}s</div>
  ${result.error ? `<pre>ERROR: ${esc(result.error)}</pre>` : ""}
  <pre>${esc(result.reply ?? "(no reply)")}</pre>
</div>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
