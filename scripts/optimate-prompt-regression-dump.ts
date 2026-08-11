/**
 * OptiMate Google Ads saved-prompt regression dump.
 *
 * Replays the saved starter prompts from the `optimate-settings` global across
 * all three chat surfaces and writes every raw response (assistant reply plus
 * every tool call's exact input/output) into a single reviewable HTML file.
 *
 * Surfaces:
 *   - "individual"  -> runChatTurn, same path as POST /api/google-ads-audits/{id}/chat
 *   - "selected"    -> runPortfolioChatTurn with selectedAccountRefs
 *   - "portfolio"   -> runPortfolioChatTurn with the same refs, portfolio chips
 *
 * Nothing here reformats agent output. Tool outputs are captured verbatim from
 * the activity log and only HTML-escaped for display.
 *
 * Usage:
 *   npm run optimate:prompt-dump -- --audit 2 --user 1
 *   npm run optimate:prompt-dump -- --audit 2 --user 1 --refs 2,6
 *   npm run optimate:prompt-dump -- --audit 2 --user 1 --surfaces individual
 *   npm run optimate:prompt-dump -- --audit 2 --user 1 --known-good  # auto-discover valid audits
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runChatTurn, runPortfolioChatTurn } from "@/lib/agents/optimate-google-ads";
import { classifyPortfolioGmailDraftIntent } from "@/lib/agents/optimate-google-ads/portfolio-gmail-draft-intent";
import type { Message } from "@/lib/agents/_shared/llm/types";

type Surface = "individual" | "selected" | "portfolio";

const ALL_SURFACES: Surface[] = ["individual", "selected", "portfolio"];
const OUTPUT_DIR = ".gg/optimate-prompt-dumps";

interface CaseSpec {
  surface: Surface;
  index: number;
  prompt: string;
}

interface ActivityRow {
  type?: string | null;
  toolName?: string | null;
  input?: unknown;
  output?: unknown;
  model?: string | null;
  source?: string | null;
  durationMs?: number | null;
}

interface CaseResult extends CaseSpec {
  startedAt: string;
  durationMs: number;
  shortcutIntent: string;
  reply?: string;
  error?: string;
  runId?: string;
  modelRequested?: string;
  modelUsed?: string;
  activityRows: ActivityRow[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Rebuild the HTML from a previous run's JSON. Report layout changes should
  // never require re-running the agents against live accounts.
  if (args.rerender) {
    await rerenderFromJson(args.rerender);
    return;
  }

  const auditId = Number(requireArg(args, "audit"));
  const userId = Number(requireArg(args, "user"));
  const payload = await getPayload({ config });

  // --known-good: discover all audits with a valid customerId for this client
  // and use them as refs. This avoids manually figuring out which audit IDs
  // have Growth Tools mappings.
  let refs: Array<string | number>;
  if (args["known-good"]) {
    const allAudits = await payload.find({
      collection: "google-ads-audits" as never,
      where: { customerId: { not_equals: "" } } as never,
      limit: 50,
      overrideAccess: true,
      select: { id: true, customerId: true, businessName: true } as never,
    });
    refs = (allAudits.docs as Array<Record<string, unknown>>)
      .map((doc) => doc.id as number)
      .filter(Boolean);
    console.log(`Discovered ${refs.length} audit(s) with a valid customerId: [${refs.join(", ")}]`);
  } else {
    refs = (args.refs ?? String(auditId))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (Number.isFinite(Number(value)) ? Number(value) : value));
  }
  const surfaces = args.surfaces
    ? (args.surfaces.split(",").map((s) => s.trim()) as Surface[])
    : ALL_SURFACES;

  for (const surface of surfaces) {
    if (!ALL_SURFACES.includes(surface)) {
      throw new Error(`Unknown surface: ${surface}. Valid: ${ALL_SURFACES.join(", ")}`);
    }
  }

  const settings = (await payload.findGlobal({
    slug: "optimate-settings" as never,
    overrideAccess: true,
  })) as Record<string, unknown>;

  const individualPrompts = extractQuestions(settings.googleMateStarterQuestions);
  const portfolioPrompts = extractQuestions(settings.googleMatePortfolioStarterQuestions);

  if (individualPrompts.length === 0 && portfolioPrompts.length === 0) {
    throw new Error("No saved starter questions found in the optimate-settings global.");
  }

  const audit = (await payload.findByID({
    collection: "google-ads-audits" as never,
    id: auditId as never,
    depth: 1,
    overrideAccess: true,
  })) as Record<string, unknown>;
  const client = await resolveLinkedClient(payload, audit);

  // Validate that each ref points to an audit with a non-empty customerId.
  // Portfolio/selected tools load all audits for the client, then filter by
  // refs — but if a ref has no Growth Tools mapping the tool retries twice
  // before failing, wasting ~15s per bad ref on every run.
  if (surfaces.some((s) => s !== "individual")) {
    const validRefs: Array<string | number> = [];
    for (const ref of refs) {
      try {
        const a = (await payload.findByID({
          collection: "google-ads-audits" as never,
          id: ref as never,
          overrideAccess: true,
          select: { customerId: true, businessName: true } as never,
        })) as Record<string, unknown>;
        if (a.customerId && String(a.customerId).trim()) {
          // Probe Growth Tools to verify the audit actually resolves there.
          const gtUrl = process.env.GROWTH_TOOLS_URL ?? "http://localhost:3010";
          const gtKey = process.env.INTERNAL_API_KEY ?? "";
          try {
            const probe = await fetch(
              `${gtUrl}/api/google-ads-budgets/${ref}/list?reportOnly=1`,
              { headers: { "x-internal-key": gtKey }, signal: AbortSignal.timeout(15000) },
            );
            if (probe.ok) {
              validRefs.push(ref);
              console.log(`  ✓ ref ${ref} (${String(a.businessName ?? "?")}) — Growth Tools OK`);
            } else {
              const body = await probe.text().catch(() => "");
              console.warn(
                `  ⚠ ref ${ref} (${String(a.businessName ?? "?")}) — Growth Tools returned ${probe.status}: ${body.slice(0, 200)}`,
              );
            }
          } catch (probeError) {
            console.warn(
              `  ⚠ ref ${ref} (${String(a.businessName ?? "?")}) — Growth Tools probe failed: ${probeError instanceof Error ? probeError.message : String(probeError)}`,
            );
          }
        } else {
          console.warn(
            `  ⚠ ref ${ref} (${String(a.businessName ?? "unknown")}) has no customerId — skipping`,
          );
        }
      } catch {
        console.warn(`  ⚠ ref ${ref} not found in google-ads-audits — skipping`);
      }
    }
    if (validRefs.length === 0 && refs.length > 0) {
      throw new Error(
        `None of the provided refs (${refs.join(", ")}) have a valid customerId. ` +
          `Portfolio/selected surfaces require at least one audit-backed ref.`,
      );
    }
    // Replace refs with the validated set for portfolio/selected runs.
    refs.length = 0;
    refs.push(...validRefs);
  }

  // --dry-run: show what would run without actually calling the agents.
  if (args["dry-run"]) {
    const cases: CaseSpec[] = [];
    for (const surface of surfaces) {
      const prompts = surface === "individual" ? individualPrompts : portfolioPrompts;
      prompts.forEach((prompt, index) => {
        cases.push({ surface, index: index + 1, prompt });
      });
    }
    console.log(`\nDRY RUN — would execute ${cases.length} case(s):`);
    for (const c of cases) {
      console.log(`  ${c.surface}#${c.index}: ${c.prompt.slice(0, 100)}...`);
    }
    console.log(`\nRefs: [${refs.join(", ")}]`);
    console.log(`Surfaces: ${surfaces.join(", ")}`);
    return;
  }

  const cases: CaseSpec[] = [];
  for (const surface of surfaces) {
    const prompts = surface === "individual" ? individualPrompts : portfolioPrompts;
    prompts.forEach((prompt, index) => {
      cases.push({ surface, index: index + 1, prompt });
    });
  }

  console.log(
    `Running ${cases.length} prompt(s) across ${surfaces.join(", ")} for audit ${auditId} (refs: ${refs.join(", ")}).`,
  );

  const results: CaseResult[] = [];
  for (const spec of cases) {
    const label = `${spec.surface}#${spec.index}`;
    console.log(`  -> ${label}: ${spec.prompt.slice(0, 70)}...`);
    results.push(await runCase({ spec, audit, client, userId, refs, payload }));
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = path.join(OUTPUT_DIR, `optimate-prompt-dump-${stamp}.html`);
  const jsonPath = path.join(OUTPUT_DIR, `optimate-prompt-dump-${stamp}.json`);

  const accountLabel = String(client?.name ?? audit.businessName ?? `Audit ${auditId}`);
  const customerId = String(audit.customerId ?? "");

  await fs.writeFile(
    jsonPath,
    `${JSON.stringify({ auditId, userId, refs, accountLabel, customerId, generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    htmlPath,
    renderReport({
      auditId,
      userId,
      refs,
      accountLabel,
      customerId,
      results,
    }),
    "utf8",
  );

  console.log(`\nWritten:\n  ${htmlPath}\n  ${jsonPath}`);
}

async function runCase(args: {
  spec: CaseSpec;
  audit: Record<string, unknown>;
  client: Record<string, unknown> | null;
  userId: number;
  refs: Array<string | number>;
  payload: Awaited<ReturnType<typeof getPayload>>;
}): Promise<CaseResult> {
  const { spec, audit, client, userId, refs, payload } = args;
  const messages: Message[] = [{ role: "user", content: [{ type: "text", text: spec.prompt }] }];
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // Record whether the deterministic multi-account shortcut would fire. It is
  // gated on selectedAccountRefs.length >= 2, so a single-account run silently
  // falls through to the LLM path even on the portfolio surfaces.
  const intent = classifyPortfolioGmailDraftIntent(spec.prompt);
  const shortcutEligible = spec.surface !== "individual" && refs.length >= 2;
  const shortcutIntent = intent
    ? `${intent.kind} (${JSON.stringify(intent)}) — ${shortcutEligible ? "SHORTCUT USED" : "matched but NOT used, needs >=2 selected accounts"}`
    : "no deterministic intent match";

  let reply: string | undefined;
  let error: string | undefined;
  let runId: string | undefined;
  let modelRequested: string | undefined;
  let modelUsed: string | undefined;

  try {
    const result =
      spec.surface === "individual"
        ? await runChatTurn({
            audit: audit as never,
            client: client as never,
            messages,
            userId,
            reasoningMode: "off",
          })
        : await runPortfolioChatTurn({
            messages,
            userId,
            reasoningMode: "off",
            selectedAccountRefs: refs,
          });
    reply = result.reply;
    runId = result.runId;
    modelRequested = result.modelRequested;
    modelUsed = result.modelUsed;
  } catch (err) {
    error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  }

  const durationMs = Date.now() - startMs;
  const activityRows = runId ? await fetchActivityRows(payload, runId) : [];

  return { ...spec, startedAt, durationMs, shortcutIntent, reply, error, runId, modelRequested, modelUsed, activityRows };
}

async function fetchActivityRows(
  payload: Awaited<ReturnType<typeof getPayload>>,
  agentRunId: string,
): Promise<ActivityRow[]> {
  const rows = await payload.find({
    collection: "activity-log" as never,
    where: { agentRunId: { equals: agentRunId } } as never,
    limit: 200,
    sort: "createdAt",
    overrideAccess: true,
  });
  return (rows.docs as Array<Record<string, unknown>>).map((row) => ({
    type: row.type as string | null,
    toolName: row.toolName as string | null,
    input: row.input,
    output: row.output,
    model: row.model as string | null,
    source: row.source as string | null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
  }));
}

async function resolveLinkedClient(
  payload: Awaited<ReturnType<typeof getPayload>>,
  audit: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const raw = audit.client;
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  const id = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
  if (id === null || Number.isNaN(id)) return null;
  try {
    return (await payload.findByID({
      collection: "clients" as never,
      id: id as never,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "question" in item
          ? String((item as { question?: unknown }).question ?? "")
          : "",
    )
    .filter((question) => question.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

const SURFACE_LABELS: Record<Surface, string> = {
  individual: "Individual account chat",
  selected: "Selected accounts chat",
  portfolio: "Portfolio chat",
};

function renderReport(args: {
  auditId: number;
  userId: number;
  refs: Array<string | number>;
  accountLabel: string;
  customerId: string;
  results: CaseResult[];
}): string {
  const { auditId, userId, refs, accountLabel, customerId, results } = args;

  const toc = results
    .map(
      (result, i) =>
        `<li><a href="#case-${i}">${escapeHtml(SURFACE_LABELS[result.surface])} #${result.index}</a> — ${escapeHtml(truncate(result.prompt, 90))}</li>`,
    )
    .join("\n");

  const sections = results.map((result, i) => renderCase(result, i)).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OptiMate saved-prompt regression dump — ${escapeHtml(accountLabel)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f6f7f9; color: #1f2933; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px 96px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .meta { color: #52606d; font-size: 13px; margin-bottom: 24px; }
  .meta code { background: #e4e7eb; padding: 1px 5px; border-radius: 3px; }
  ol.toc { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; padding: 16px 16px 16px 36px; font-size: 13px; line-height: 1.7; }
  .case { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; margin: 24px 0; overflow: hidden; }
  .case > header { padding: 14px 18px; background: #f0f4f8; border-bottom: 1px solid #d9e2ec; }
  .case h2 { font-size: 15px; margin: 0 0 4px; }
  .tag { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-right: 6px; }
  .tag.individual { background: #e0f2fe; color: #075985; }
  .tag.selected { background: #ede9fe; color: #5b21b6; }
  .tag.portfolio { background: #dcfce7; color: #166534; }
  .tag.err { background: #fee2e2; color: #991b1b; }
  .tag.warn { background: #fef3c7; color: #92400e; }
  .body { padding: 18px; }
  .label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #627d98; margin: 18px 0 6px; }
  .label:first-child { margin-top: 0; }
  pre { background: #1f2933; color: #e4e7eb; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; margin: 0; }
  pre.plain { background: #f8fafc; color: #1f2933; border: 1px solid #e4e7eb; }
  pre.prompt { background: #fffbeb; border: 1px solid #fcd34d; font-weight: 600; }
  .headline-prompt { font-size: 13px; color: #334e68; line-height: 1.5; margin-top: 6px; }
  details { border: 1px solid #e4e7eb; border-radius: 6px; margin-bottom: 10px; }
  summary { cursor: pointer; padding: 9px 12px; font-size: 13px; font-weight: 600; background: #f8fafc; }
  details > div { padding: 12px; border-top: 1px solid #e4e7eb; }
  .rendered { border: 1px dashed #9aa5b1; border-radius: 6px; padding: 14px; background: #fff; margin-top: 8px; }
  .rendered-note { font-size: 11px; color: #829ab1; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>OptiMate saved-prompt regression dump</h1>
  <div class="meta">
    Account: <strong>${escapeHtml(accountLabel)}</strong> (customer <code>${escapeHtml(customerId)}</code>, audit <code>${auditId}</code>)<br>
    Selected account refs: <code>${escapeHtml(refs.join(", "))}</code> &middot; CMS user: <code>${userId}</code><br>
    Generated: ${escapeHtml(new Date().toISOString())}<br>
    Prompts are read verbatim from the <code>optimate-settings</code> global. Replies and tool outputs are unmodified; only HTML-escaped for display.
  </div>
  <ol class="toc">
${toc}
  </ol>
${sections}
</div>
</body>
</html>
`;
}

function renderCase(result: CaseResult, i: number): string {
  const parts: string[] = [];

  // Prompt first, then the reply directly beneath it: the pair is the point of
  // this report, so nothing is allowed between them. Metadata and raw tool
  // traces follow underneath.
  parts.push(
    `<div class="label">Prompt sent (verbatim)</div><pre class="plain prompt">${escapeHtml(result.prompt)}</pre>`,
  );

  if (result.error) {
    parts.push(`<div class="label">Error</div><pre>${escapeHtml(result.error)}</pre>`);
  }

  parts.push(
    `<div class="label">Assistant reply to the prompt above (exact, unmodified)</div><pre>${escapeHtml(result.reply ?? "(no reply)")}</pre>`,
  );

  parts.push(
    `<div class="label">Run metadata</div><pre class="plain">${escapeHtml(
      [
        `runId:            ${result.runId ?? "(none)"}`,
        `model requested:  ${result.modelRequested ?? "(n/a)"}`,
        `model used:       ${result.modelUsed ?? "(n/a)"}`,
        `duration:         ${result.durationMs} ms`,
        `started:          ${result.startedAt}`,
        `shortcut routing: ${result.shortcutIntent}`,
        `tool calls:       ${result.activityRows.filter((r) => r.toolName).length}`,
        `tools used:       ${result.activityRows.map((r) => r.toolName).filter(Boolean).join(", ") || "(none)"}`,
      ].join("\n"),
    )}</pre>`,
  );

  if (result.activityRows.length > 0) {
    parts.push(`<div class="label">Tool calls — exact input / output</div>`);
    result.activityRows.forEach((row, index) => {
      const title = `${index + 1}. ${row.toolName ?? row.type ?? "activity"}${row.durationMs ? ` (${row.durationMs} ms)` : ""}`;
      const inputJson = safeJson(row.input);
      const outputJson = safeJson(row.output);
      const htmlBodies = collectHtmlStrings(row.output);
      const rendered = htmlBodies
        .map(
          (html, n) =>
            `<div class="rendered-note">Rendered preview of HTML field #${n + 1} (exact markup below, shown as it would appear in the email):</div><div class="rendered">${html}</div>`,
        )
        .join("");
      parts.push(
        `<details><summary>${escapeHtml(title)}</summary><div>` +
          `<div class="label">Input</div><pre>${escapeHtml(inputJson)}</pre>` +
          `<div class="label">Output</div><pre>${escapeHtml(outputJson)}</pre>` +
          (rendered ? `<div class="label">Rendered email HTML</div>${rendered}` : "") +
          `</div></details>`,
      );
    });
  }

  const errTag = result.error ? `<span class="tag err">ERROR</span>` : "";
  const warnTag = result.shortcutIntent.includes("NOT used") ? `<span class="tag warn">SHORTCUT SKIPPED</span>` : "";

  return `<section class="case" id="case-${i}">
  <header>
    <h2><span class="tag ${result.surface}">${escapeHtml(SURFACE_LABELS[result.surface])}</span>${errTag}${warnTag} Prompt #${result.index}</h2>
    <div class="headline-prompt">${escapeHtml(result.prompt)}</div>
  </header>
  <div class="body">
${parts.join("\n")}
  </div>
</section>`;
}

/** Pull every plausible email-HTML string out of a tool output payload. */
function collectHtmlStrings(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === "string") {
    return /<(table|div|p|h[1-6]|tr)\b/i.test(value) ? [value] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectHtmlStrings(item, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectHtmlStrings(item, depth + 1),
    );
  }
  return [];
}

/** Rebuild the HTML from a prior run's JSON, without re-running any agents. */
async function rerenderFromJson(jsonPath: string): Promise<void> {
  const saved = JSON.parse(await fs.readFile(jsonPath, "utf8")) as {
    auditId: number;
    userId: number;
    refs: Array<string | number>;
    accountLabel?: string;
    customerId?: string;
    results: CaseResult[];
  };
  const htmlPath = jsonPath.replace(/\.json$/, "-rerendered.html");
  await fs.writeFile(
    htmlPath,
    renderReport({
      auditId: saved.auditId,
      userId: saved.userId,
      refs: saved.refs,
      accountLabel: saved.accountLabel ?? `Audit ${saved.auditId}`,
      customerId: saved.customerId ?? "",
      results: saved.results,
    }),
    "utf8",
  );
  console.log(`Re-rendered ${saved.results.length} case(s) -> ${htmlPath}`);
}

function safeJson(value: unknown): string {
  if (value === undefined) return "(undefined)";
  if (typeof value === "string") {
    // Activity log frequently stores pre-serialised JSON; pretty-print when possible.
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function requireArg(args: Record<string, string>, key: string): string {
  const value = args[key];
  if (!value) throw new Error(`Missing required --${key} argument.`);
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
