/**
 * Inspects specific Gmail drafts by id and reports thread, recipient, and
 * whether the body carries Google Ads report markers.
 *
 * Used to attribute a draft to a source: OptiMate Google Ads report tools leave
 * the recipient blank and emit report tables/charts, so a draft with a real
 * recipient and no report markers came from somewhere else.
 *
 * Usage:
 *   npm run optimate:inspect-drafts -- --user 1 --ids r123,r456
 */

import { google } from "googleapis";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const userArg = argv.indexOf("--user");
  const userId = userArg >= 0 ? Number(argv[userArg + 1]) : 1;
  const idsArg = argv.indexOf("--ids");
  const ids = String(argv[idsArg + 1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error("Usage: npm run optimate:inspect-drafts -- --user 1 --ids r123,r456");
  }

  const token = await getValidGmailToken(userId);
  if (!token.ok) throw new Error(`Gmail token unavailable: ${token.reason}`);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token.accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  for (const id of ids) {
    const draft = await gmail.users.drafts.get({ userId: "me", id, format: "full" });
    const message = draft.data.message;
    const html = extractHtml(message?.payload) ?? "";
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const reportMarkers =
      /Weekly Performance Trend|Monthly Performance|Spend to Budget|quickchart\.io|Keyword Relevancy/.test(
        html,
      );

    console.log(`\n===== draft ${id}`);
    console.log(`  threadId : ${message?.threadId ?? "(none)"}`);
    console.log(`  subject  : ${headerValue(message?.payload, "Subject") ?? "(none)"}`);
    console.log(`  to       : ${headerValue(message?.payload, "To") ?? "(blank)"}`);
    console.log(`  bytes    : ${html.length}`);
    console.log(`  GA report markers present: ${reportMarkers}`);
    console.log(`  body     : ${text.slice(0, 400)}`);
  }
}

function extractHtml(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const part = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const found = extractHtml(child);
    if (found) return found;
  }
  return null;
}

function headerValue(payload: unknown, name: string): string | null {
  const headers = (payload as { headers?: Array<{ name?: string; value?: string }> })?.headers ?? [];
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
