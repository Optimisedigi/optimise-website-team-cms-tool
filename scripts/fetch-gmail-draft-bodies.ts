/**
 * Fetch the real Gmail draft bodies created by a prompt-dump run and render
 * them exactly as Gmail stores them.
 *
 * The draft tools only return `draftId` in their activity-log output, so the
 * dump report could show the assistant's markdown chat reply but not the
 * actual email. The authoritative HTML is the MIME body Gmail holds after
 * `formatGmailDraftHtml` + signature append, so we read it straight back from
 * the Gmail API rather than re-deriving it.
 *
 * Usage:
 *   npm run optimate:gmail-bodies -- <dump.json> [--user 1]
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
  activityRows: ActivityRow[];
}

interface DraftRender {
  surface: string;
  index: number;
  prompt: string;
  toolName: string;
  draftId: string;
  messageId: string;
  subject: string;
  html: string;
  bytes: number;
}

const OUTPUT_DIR = ".gg/optimate-prompt-dumps";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonPath = argv.find((a) => !a.startsWith("--"));
  if (!jsonPath) throw new Error("Usage: npm run optimate:gmail-bodies -- <dump.json> [--user 1]");
  const userIdArg = argv.indexOf("--user");
  const userId = userIdArg >= 0 ? Number(argv[userIdArg + 1]) : 1;

  const dump = JSON.parse(await fs.readFile(jsonPath, "utf8")) as { results: CaseResult[] };

  const token = await getValidGmailToken(userId);
  if (!token.ok) throw new Error(`Gmail token unavailable: ${token.reason}`);

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token.accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const renders: DraftRender[] = [];

  for (const result of dump.results) {
    for (const row of result.activityRows) {
      const serialised =
        typeof row.output === "string" ? row.output : JSON.stringify(row.output ?? "");
      const ids = [...serialised.matchAll(/"draftId":"([^"]+)"/g)].map((m) => m[1]);
      const subjects = [...serialised.matchAll(/"subject":"((?:[^"\\]|\\.)*)"/g)].map((m) =>
        m[1].replace(/\\"/g, '"'),
      );

      for (const [i, draftId] of ids.entries()) {
        const draft = await gmail.users.drafts.get({
          userId: "me",
          id: draftId,
          format: "full",
        });
        const message = draft.data.message;
        const html = extractHtmlPart(message?.payload) ?? "(no text/html part found)";
        renders.push({
          surface: result.surface,
          index: result.index,
          prompt: result.prompt,
          toolName: String(row.toolName ?? "unknown"),
          draftId,
          messageId: String(message?.id ?? ""),
          subject: subjects[i] ?? headerValue(message?.payload, "Subject") ?? "(no subject)",
          html,
          bytes: html.length,
        });
        console.log(
          `${result.surface}#${result.index} ${draftId} -> ${html.length} bytes of Gmail HTML`,
        );
      }
    }
  }

  if (renders.length === 0) {
    console.log("No draft ids found in that dump.");
    return;
  }

  const outPath = path.join(
    OUTPUT_DIR,
    `optimate-gmail-bodies-${new Date().toISOString().replace(/[:.]/g, "-")}.html`,
  );
  await fs.writeFile(outPath, render(renders), "utf8");
  console.log(`\nWritten: ${outPath}`);
}

/** Walk the MIME tree for the text/html part and decode it. */
function extractHtmlPart(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const part = payload as {
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  };
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

function render(renders: DraftRender[]): string {
  const cards = renders
    .map(
      (r, i) => `
<section class="case" id="draft-${i}">
  <header>
    <span class="tag ${esc(r.surface)}">${esc(r.surface)} #${r.index}</span>
    <h2>${esc(r.subject)}</h2>
    <div class="kv">tool <code>${esc(r.toolName)}</code> &middot; draft <code>${esc(r.draftId)}</code>
      &middot; ${r.bytes.toLocaleString()} bytes
      &middot; <a href="https://mail.google.com/mail/u/0/#drafts/${esc(r.messageId)}" target="_blank" rel="noreferrer">open in Gmail</a></div>
  </header>
  <div class="body">
    <div class="label">Prompt that produced this draft</div>
    <pre class="prompt">${esc(r.prompt)}</pre>

    <div class="label">Rendered exactly as Gmail shows it</div>
    <div class="gmail-frame">
      <iframe srcdoc="${esc(r.html)}" loading="lazy" onload="this.style.height=Math.max(320,this.contentWindow.document.body.scrollHeight+40)+'px'"></iframe>
    </div>

    <details>
      <summary>Raw email HTML source (${r.bytes.toLocaleString()} bytes, verbatim from the Gmail draft)</summary>
      <pre class="src">${esc(r.html)}</pre>
    </details>
  </div>
</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>OptiMate drafts — exact Gmail rendering</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin:0; background:#f6f7f9; color:#1f2933; }
  .wrap { max-width: 1100px; margin:0 auto; padding: 28px 20px 80px; }
  h1 { font-size: 23px; margin-bottom: 6px; }
  .intro { color:#52606d; font-size:13px; margin-bottom:24px; line-height:1.6; }
  .case { background:#fff; border:1px solid #d9e2ec; border-radius:10px; margin:22px 0; overflow:hidden; }
  .case > header { padding:14px 18px; background:#f0f4f8; border-bottom:1px solid #d9e2ec; }
  .case h2 { font-size:16px; margin:6px 0 4px; }
  .kv { font-size:12px; color:#52606d; }
  .body { padding:18px; }
  .label { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#627d98; margin:16px 0 6px; }
  .label:first-child { margin-top:0; }
  pre { white-space:pre-wrap; word-break:break-word; font-size:12px; line-height:1.55; border-radius:6px; padding:12px; margin:0; }
  pre.prompt { background:#fffbeb; border:1px solid #fcd34d; font-weight:600; }
  pre.src { background:#1f2933; color:#e4e7eb; overflow-x:auto; }
  .gmail-frame { border:1px solid #c1c7cd; border-radius:6px; background:#fff; padding:0; }
  iframe { width:100%; border:0; display:block; min-height:320px; }
  details { margin-top:14px; border:1px solid #e4e7eb; border-radius:6px; }
  summary { cursor:pointer; padding:9px 12px; font-size:13px; font-weight:600; background:#f8fafc; }
  details > pre { border-top:1px solid #e4e7eb; border-radius:0 0 6px 6px; }
  .tag { display:inline-block; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:#e4e7eb; color:#3e4c59; }
  .tag.individual { background:#e0f2fe; color:#075985; }
  .tag.selected { background:#ede9fe; color:#5b21b6; }
  .tag.portfolio { background:#dcfce7; color:#166534; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style></head><body><div class="wrap">
<h1>OptiMate drafts — exact Gmail rendering</h1>
<div class="intro">
  Each body below was read back from the Gmail API for the draft the agent created, so this is the
  post-<code>formatGmailDraftHtml</code>, post-signature markup Gmail actually stores &mdash; not the
  assistant's markdown chat reply. Bodies render in a sandboxed iframe with the email's own styles.
</div>
${cards}
</div></body></html>`;
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
