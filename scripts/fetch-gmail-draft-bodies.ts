/**
 * Build the reviewable OptiMate report: every saved prompt, on every chat
 * surface, with the agent's reply AND the real Gmail email body it produced.
 *
 * The draft tools only return `draftId` in their activity-log output, so a
 * prompt dump alone can show the assistant's markdown chat reply but not the
 * actual email. The authoritative HTML is the MIME body Gmail holds after
 * `formatGmailDraftHtml` + signature append, so it is read straight back from
 * the Gmail API rather than re-derived.
 *
 * Cases are grouped by prompt number so the three surfaces sit side by side and
 * any divergence between them is obvious. Cases that produced no draft are still
 * listed, with their reply, so nothing silently disappears from the review.
 *
 * Usage:
 *   npm run optimate:gmail-bodies -- <dump.json> [--user 1] [--out <file.html>]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";

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

interface DraftRender {
  toolName: string;
  draftId: string;
  messageId: string;
  subject: string;
  html: string;
  bytes: number;
  weekRows: string[];
  chartCount: number;
}

interface CaseReport {
  surface: string;
  index: number;
  prompt: string;
  reply: string;
  error?: string;
  durationMs: number;
  shortcutIntent: string;
  tools: string[];
  drafts: DraftRender[];
}

const OUTPUT_DIR = ".gg/optimate-prompt-dumps";
const SURFACE_ORDER = ["individual", "selected", "portfolio"];
const SURFACE_LABELS: Record<string, string> = {
  individual: "Individual account chat",
  selected: "Selected accounts chat",
  portfolio: "Portfolio chat",
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonPath = argv.find((a) => !a.startsWith("--"));
  if (!jsonPath) {
    throw new Error(
      "Usage: npm run optimate:gmail-bodies -- <dump.json> [--user 1] [--out <file.html>]",
    );
  }
  const userIdArg = argv.indexOf("--user");
  const userId = userIdArg >= 0 ? Number(argv[userIdArg + 1]) : 1;
  const outArg = argv.indexOf("--out");
  const outPath =
    outArg >= 0
      ? argv[outArg + 1]
      : path.join(
          OUTPUT_DIR,
          `optimate-gmail-bodies-${new Date().toISOString().replace(/[:.]/g, "-")}.html`,
        );

  const dump = JSON.parse(await fs.readFile(jsonPath, "utf8")) as {
    generatedAt?: string;
    accountLabel?: string;
    customerId?: string;
    results: CaseResult[];
  };

  const token = await getValidGmailToken(userId);
  if (!token.ok) throw new Error(`Gmail token unavailable: ${token.reason}`);

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token.accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const reports: CaseReport[] = [];

  for (const result of dump.results) {
    const drafts: DraftRender[] = [];

    for (const row of result.activityRows) {
      const serialised =
        typeof row.output === "string" ? row.output : JSON.stringify(row.output ?? "");
      const ids = [...serialised.matchAll(/"draftId":"([^"]+)"/g)].map((m) => m[1]);
      const subjects = [...serialised.matchAll(/"subject":"((?:[^"\\]|\\.)*)"/g)].map((m) =>
        m[1].replace(/\\"/g, '"'),
      );

      for (const [i, draftId] of ids.entries()) {
        const draft = await gmail.users.drafts.get({ userId: "me", id: draftId, format: "full" });
        const message = draft.data.message;
        const html = extractHtmlPart(message?.payload) ?? "(no text/html part found)";
        drafts.push({
          toolName: String(row.toolName ?? "unknown"),
          draftId,
          messageId: String(message?.id ?? ""),
          subject: subjects[i] ?? headerValue(message?.payload, "Subject") ?? "(no subject)",
          html,
          bytes: html.length,
          weekRows: extractWeekRows(html),
          chartCount: (html.match(/quickchart\.io/g) ?? []).length,
        });
        console.log(`${result.surface}#${result.index} ${draftId} -> ${html.length} bytes`);
      }
    }

    // The deterministic multi-account shortcut bypasses the LLM, so it writes no
    // activity-log rows. Its drafts are only discoverable as Gmail message ids in
    // the reply text, fetched here via messages.get so shortcut runs are still
    // represented in the report.
    if (drafts.length === 0) {
      const messageIds = [
        ...new Set(
          [...(result.reply ?? "").matchAll(/#drafts\/([0-9a-f]+)/g)].map((m) => m[1]),
        ),
      ];
      for (const messageId of messageIds) {
        try {
          const message = await gmail.users.messages.get({
            userId: "me",
            id: messageId,
            format: "full",
          });
          const html = extractHtmlPart(message.data.payload) ?? "(no text/html part found)";
          drafts.push({
            toolName: "deterministic shortcut",
            draftId: `(message ${messageId})`,
            messageId,
            subject: headerValue(message.data.payload, "Subject") ?? "(no subject)",
            html,
            bytes: html.length,
            weekRows: extractWeekRows(html),
            chartCount: (html.match(/quickchart\.io/g) ?? []).length,
          });
          console.log(`${result.surface}#${result.index} msg ${messageId} -> ${html.length} bytes`);
        } catch (error) {
          console.warn(
            `  could not fetch message ${messageId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    reports.push({
      surface: result.surface,
      index: result.index,
      prompt: result.prompt,
      reply: result.reply ?? "(no reply)",
      error: result.error,
      durationMs: result.durationMs,
      shortcutIntent: result.shortcutIntent,
      tools: result.activityRows.map((r) => r.toolName).filter((n): n is string => Boolean(n)),
      drafts,
    });
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, render(reports, dump), "utf8");

  const withDrafts = reports.filter((r) => r.drafts.length > 0).length;
  console.log(
    `\n${reports.length} case(s), ${withDrafts} with drafts, ${reports.reduce((n, r) => n + r.drafts.length, 0)} email bodies.`,
  );
  console.log(`Written: ${outPath}`);
}

/** Pull the weekly trend rows out of an email body for the parity summary. */
function extractWeekRows(html: string): string[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) =>
      m[1]
        .replace(/<[^>]+>/g, "|")
        .replace(/\|+/g, "|")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((row) => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s*-\s*/.test(row));
  return rows;
}

function extractHtmlPart(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const part = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const found = extractHtmlPart(child);
    if (found) return found;
  }
  return null;
}

function headerValue(payload: unknown, name: string): string | null {
  const headers = (payload as { headers?: Array<{ name?: string; value?: string }> })?.headers ?? [];
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function verdict(report: CaseReport): { label: string; cls: string } {
  if (report.error) return { label: "ERROR", cls: "v-err" };
  if (report.drafts.length > 0)
    return {
      label: `${report.drafts.length} DRAFT${report.drafts.length === 1 ? "" : "S"} CREATED`,
      cls: "v-ok",
    };
  const reply = report.reply.toLowerCase();
  if (/^\s*which\b/.test(reply) || /which (dashboard|graph|weekly|monthly|component)/.test(reply)) {
    return { label: "clarification stall", cls: "v-bad" };
  }
  return report.tools.length > 0
    ? { label: "answered, no draft", cls: "v-mid" }
    : { label: "no tool call", cls: "v-mid" };
}

function render(
  reports: CaseReport[],
  dump: { generatedAt?: string; accountLabel?: string; customerId?: string },
): string {
  const indices = [...new Set(reports.map((r) => r.index))].sort((a, b) => a - b);

  // Parity table: same prompt number across surfaces should render the same email.
  const parityRows = indices
    .map((index) => {
      const cells = SURFACE_ORDER.map((surface) => {
        const report = reports.find((r) => r.surface === surface && r.index === index);
        if (!report) return `<td class="muted">not run</td>`;
        const draft = report.drafts[0];
        const v = verdict(report);
        const detail = draft
          ? `${draft.weekRows.length} week rows &middot; ${draft.chartCount} charts &middot; ${draft.bytes.toLocaleString()} B`
          : "&mdash;";
        return `<td><span class="pill ${v.cls}">${esc(v.label)}</span><div class="muted">${detail}</div></td>`;
      }).join("");
      return `<tr><th>Prompt #${index}</th>${cells}</tr>`;
    })
    .join("\n");

  const groups = indices
    .map((index) => {
      const cards = SURFACE_ORDER.flatMap((surface) =>
        reports.filter((r) => r.surface === surface && r.index === index).map((r) => card(r)),
      ).join("\n");
      return `<h2 class="group">Prompt #${index}</h2>\n${cards}`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>OptiMate prompts, replies &amp; Gmail bodies</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin:0; background:#f6f7f9; color:#1f2933; }
  .wrap { max-width: 1180px; margin:0 auto; padding: 28px 20px 80px; }
  h1 { font-size: 23px; margin-bottom: 6px; }
  .intro { color:#52606d; font-size:13px; margin-bottom:22px; line-height:1.6; }
  .group { font-size:17px; margin:34px 0 10px; padding-bottom:6px; border-bottom:2px solid #d9e2ec; }
  table.parity { width:100%; border-collapse:collapse; background:#fff; border:1px solid #d9e2ec; border-radius:8px; overflow:hidden; font-size:12.5px; }
  table.parity th, table.parity td { padding:9px 12px; text-align:left; border-bottom:1px solid #e4e7eb; vertical-align:top; }
  table.parity thead th { background:#f0f4f8; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#627d98; }
  .case { background:#fff; border:1px solid #d9e2ec; border-radius:10px; margin:14px 0; overflow:hidden; }
  .case > header { padding:13px 18px; background:#f0f4f8; border-bottom:1px solid #d9e2ec; }
  .case h3 { font-size:15px; margin:6px 0 4px; }
  .kv { font-size:12px; color:#52606d; line-height:1.6; }
  .body { padding:18px; }
  .label { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#627d98; margin:16px 0 6px; }
  .label:first-child { margin-top:0; }
  pre { white-space:pre-wrap; word-break:break-word; font-size:12px; line-height:1.55; border-radius:6px; padding:12px; margin:0; }
  pre.prompt { background:#fffbeb; border:1px solid #fcd34d; font-weight:600; }
  pre.reply { background:#1f2933; color:#e4e7eb; overflow-x:auto; }
  pre.src { background:#1f2933; color:#e4e7eb; overflow-x:auto; }
  .gmail-frame { border:1px solid #c1c7cd; border-radius:6px; background:#fff; }
  iframe { width:100%; border:0; display:block; min-height:300px; }
  details { margin-top:12px; border:1px solid #e4e7eb; border-radius:6px; }
  summary { cursor:pointer; padding:9px 12px; font-size:13px; font-weight:600; background:#f8fafc; }
  details > pre { border-top:1px solid #e4e7eb; border-radius:0 0 6px 6px; }
  .tag { display:inline-block; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:#e4e7eb; color:#3e4c59; }
  .tag.individual { background:#e0f2fe; color:#075985; }
  .tag.selected { background:#ede9fe; color:#5b21b6; }
  .tag.portfolio { background:#dcfce7; color:#166534; }
  .pill { display:inline-block; font-size:11px; font-weight:700; padding:3px 9px; border-radius:6px; }
  .v-ok { background:#e3f9e5; color:#0b6b2f; }
  .v-bad { background:#fce8e6; color:#a61b1b; }
  .v-err { background:#fee2e2; color:#991b1b; }
  .v-mid { background:#f0f4f8; color:#3e4c59; }
  .muted { color:#829ab1; font-size:11.5px; margin-top:3px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
</style></head><body><div class="wrap">
<h1>OptiMate prompts, replies &amp; Gmail bodies</h1>
<div class="intro">
  Account <strong>${esc(dump.accountLabel ?? "")}</strong>${dump.customerId ? ` (customer <code>${esc(dump.customerId)}</code>)` : ""}
  &middot; run ${esc(dump.generatedAt ?? "")}<br>
  Every saved prompt is shown on each chat surface with the agent's reply and, where a draft was
  created, the email body read back from the Gmail API &mdash; the post-<code>formatGmailDraftHtml</code>,
  post-signature markup Gmail actually stores, rendered in a sandboxed iframe with its own styles.
</div>

<table class="parity">
  <thead><tr><th></th>${SURFACE_ORDER.map((s) => `<th>${esc(SURFACE_LABELS[s])}</th>`).join("")}</tr></thead>
  <tbody>${parityRows}</tbody>
</table>

${groups}
</div></body></html>`;
}

function card(report: CaseReport): string {
  const v = verdict(report);
  const emails = report.drafts
    .map(
      (draft, i) => `
    <div class="label">Email body ${report.drafts.length > 1 ? `#${i + 1} ` : ""}&mdash; rendered exactly as Gmail shows it</div>
    <div class="kv">${esc(draft.subject)} &middot; <code>${esc(draft.toolName)}</code>
      &middot; draft <code>${esc(draft.draftId)}</code>
      &middot; ${draft.weekRows.length} week rows &middot; ${draft.chartCount} charts
      &middot; ${draft.bytes.toLocaleString()} bytes
      &middot; <a href="https://mail.google.com/mail/u/0/#drafts/${esc(draft.messageId)}" target="_blank" rel="noreferrer">open in Gmail</a></div>
    ${
      draft.weekRows.length
        ? `<pre class="src">${esc(draft.weekRows.join("\n"))}</pre>`
        : ""
    }
    <div class="gmail-frame">
      <iframe srcdoc="${esc(draft.html)}" loading="lazy"
        onload="this.style.height=Math.max(300,this.contentWindow.document.body.scrollHeight+40)+'px'"></iframe>
    </div>
    <details><summary>Raw email HTML source (${draft.bytes.toLocaleString()} bytes, verbatim)</summary><pre class="src">${esc(draft.html)}</pre></details>`,
    )
    .join("\n");

  return `<section class="case">
  <header>
    <span class="tag ${esc(report.surface)}">${esc(SURFACE_LABELS[report.surface] ?? report.surface)}</span>
    <span class="pill ${v.cls}">${esc(v.label)}</span>
    <h3>Prompt #${report.index}</h3>
    <div class="kv">tools: ${report.tools.length ? esc(report.tools.join(", ")) : "(none)"}
      &middot; ${Math.round(report.durationMs / 1000)}s<br>shortcut: ${esc(report.shortcutIntent)}</div>
  </header>
  <div class="body">
    <div class="label">Prompt sent (verbatim)</div>
    <pre class="prompt">${esc(report.prompt)}</pre>

    ${report.error ? `<div class="label">Error</div><pre class="reply">${esc(report.error)}</pre>` : ""}

    <div class="label">Assistant reply to the prompt above (exact, unmodified)</div>
    <pre class="reply">${esc(report.reply)}</pre>
    ${emails || `<div class="label">Email body</div><div class="kv muted">No Gmail draft was created for this prompt.</div>`}
  </div>
</section>`;
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
