import fs from "node:fs/promises";
import path from "node:path";
import { callLLM } from "../src/lib/agents/_shared/llm/index";
import { CHAT_PICKER_MODELS, isCanonicalModel, type CanonicalModelName } from "../src/lib/agents/_shared/llm/registry";

const DEFAULT_OUTPUT_DIR = ".gg/blog-evals";
const DEFAULT_MODELS: CanonicalModelName[] = [
  "claude-sonnet-4.6",
  "claude-haiku-4.5",
  "claude-opus-4-8",
  "kimi-for-coding",
  "minimax-m3",
  "gpt-5.5-codex",
  "gpt-5.4",
  "gpt-5.4-mini",
  "grok-build",
  "grok-composer-2.5-fast",
];

interface BlogBriefConfig {
  id: string;
  briefPath: string;
  baselinePath: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  forbiddenPhrases: string[];
  requiredConcepts: string[];
}

interface ModelRunMetadata {
  briefId: string;
  modelRequested: CanonicalModelName;
  modelUsed?: string;
  source?: string;
  status: "passed" | "failed";
  durationMs: number;
  error?: string;
  usage?: unknown;
  markdownPath: string;
  score?: BlogScore;
}

interface BlogScore {
  total: number;
  baselineSimilarity: number;
  briefCompliance: number;
  seoAuthority: number;
  commercialFit: number;
  improvementPotential: number;
  metrics: Record<string, unknown>;
  flags: string[];
  strengths: string[];
  editingIssues: string[];
}

const BLOGS: Record<string, BlogBriefConfig> = {
  "growth-systems": {
    id: "growth-systems",
    briefPath: ".gg/blog-evals/briefs/growth-systems-brief.md",
    baselinePath: ".gg/blog-evals/baselines/growth-systems-live.md",
    primaryKeywords: ["growth systems", "websites", "conversion rate optimisation", "SEO", "AI", "automation"],
    secondaryKeywords: ["customer journey", "CRM", "email flows", "paid media", "integrated digital growth strategy"],
    forbiddenPhrases: [],
    requiredConcepts: ["systems not websites", "website is one component", "connected data", "customer journey", "automation", "AI"],
  },
  "time-vs-money": {
    id: "time-vs-money",
    briefPath: ".gg/blog-evals/briefs/time-vs-money-brief.md",
    baselinePath: ".gg/blog-evals/baselines/time-vs-money-live.md",
    primaryKeywords: ["google ads strategy", "digital marketing strategy", "business growth strategy", "paid vs organic marketing", "how to grow a business"],
    secondaryKeywords: ["customer lifetime value", "return on ad spend", "conversion rate optimisation", "SEO vs Google Ads", "scaling a business", "lead generation strategy", "marketing ROI"],
    forbiddenPhrases: ["step by step Google Ads setup", "just run ads", "guaranteed", "overnight"],
    requiredConcepts: ["time", "money", "hybrid", "LTV", "ROAS", "conversion infrastructure", "Google Ads amplifier"],
  },
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = stringArg(args, "output-dir") ?? DEFAULT_OUTPUT_DIR;
  const command = args._[0] ?? "run";

  if (command === "run") {
    const briefs = resolveBriefs(args);
    const models = resolveModels(args);
    const runDate = new Date().toISOString().slice(0, 10);
    const allMetadata: ModelRunMetadata[] = [];
    for (const brief of briefs) {
      for (const model of models) {
        const metadata = await runModelForBrief({ brief, model, outputDir, runDate });
        allMetadata.push(metadata);
        console.log(`${brief.id}/${model}: ${metadata.status}${metadata.error ? ` (${metadata.error})` : ""}`);
      }
    }
    await writeReports({ outputDir, runDate, metadata: allMetadata, briefs });
    return;
  }

  if (command === "report") {
    const runDir = stringArg(args, "run-dir");
    if (!runDir) throw new Error("Missing --run-dir");
    const metadata = await readMetadataFromRunDir(runDir);
    const briefs = [...new Set(metadata.map((m) => m.briefId))].map((id) => BLOGS[id]).filter(Boolean);
    await writeReports({ outputDir, runDate: new Date().toISOString().slice(0, 10), metadata, briefs });
    return;
  }

  printUsage();
}

async function runModelForBrief(args: { brief: BlogBriefConfig; model: CanonicalModelName; outputDir: string; runDate: string }): Promise<ModelRunMetadata> {
  const brief = await fs.readFile(args.brief.briefPath, "utf8");
  const baseline = await fs.readFile(args.brief.baselinePath, "utf8");
  const runDir = path.join(args.outputDir, "runs", args.runDate, args.brief.id);
  await fs.mkdir(runDir, { recursive: true });
  const markdownPath = path.join(runDir, `${args.model}.md`);
  const jsonPath = path.join(runDir, `${args.model}.json`);
  const started = Date.now();

  try {
    const response = await callLLM({
      model: args.model,
      fallbackModels: [],
      system: "You are writing blog content for Optimise Digital. Follow the supplied markdown brief exactly. Return only markdown suitable for CMS paste. Do not wrap the answer in code fences.",
      messages: [{ role: "user", content: [{ type: "text", text: brief }] }],
      maxTokens: 12000,
      timeoutMs: 180000,
    });
    const markdown = response.message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n\n").trim();
    await fs.writeFile(markdownPath, `${markdown}\n`, "utf8");
    const score = scoreBlog({ output: markdown, baseline, brief, config: args.brief });
    const metadata: ModelRunMetadata = {
      briefId: args.brief.id,
      modelRequested: args.model,
      modelUsed: response.model,
      source: response.source,
      status: "passed",
      durationMs: Date.now() - started,
      usage: response.usage,
      markdownPath,
      score,
    };
    await fs.writeFile(jsonPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    return metadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const metadata: ModelRunMetadata = {
      briefId: args.brief.id,
      modelRequested: args.model,
      status: "failed",
      durationMs: Date.now() - started,
      error: message,
      markdownPath,
    };
    await fs.writeFile(jsonPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    return metadata;
  }
}

function scoreBlog(args: { output: string; baseline: string; brief: string; config: BlogBriefConfig }): BlogScore {
  const flags: string[] = [];
  const strengths: string[] = [];
  const editingIssues: string[] = [];
  const outputWords = wordCount(args.output);
  const baselineWords = wordCount(args.baseline);
  const headings = extractHeadings(args.output);
  const baselineHeadings = extractHeadings(args.baseline);
  const headingOverlap = overlapRatio(headings, baselineHeadings);
  const faqCount = (args.output.match(/\*\*Q:/g) ?? []).length;
  const baselineFaqCount = (args.baseline.match(/\*\*Q:/g) ?? []).length;
  const tldrPresent = />?\s*TL;?DR/i.test(args.output);
  const readingTimePresent = /reading time/i.test(args.output);
  const h1Present = /^#\s+.+/m.test(args.output);
  const faqPresent = /##\s*FAQ/i.test(args.output) || faqCount > 0;
  const metaTitle = extractLabel(args.output, "Meta Title");
  const metaDescription = extractLabel(args.output, "Meta Description");
  const excerpt = extractLabel(args.output, "Excerpt");
  const dashViolations = (args.output.match(/[—–]/g) ?? []).length;
  const links = [...args.output.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1] ?? "");
  const duplicateLinks = links.filter((url, index) => links.indexOf(url) !== index);
  const tldrBlock = args.output.split(/\n\s*##\s+/)[0] ?? "";
  const tldrHasInternalLink = /\[[^\]]+\]\(\//.test(tldrBlock);
  const primaryCoverage = coverage(args.output, args.config.primaryKeywords);
  const secondaryCoverage = coverage(args.output, args.config.secondaryKeywords);
  const conceptCoverage = coverage(args.output, args.config.requiredConcepts);
  const forbiddenHits = args.config.forbiddenPhrases.filter((phrase) => containsNormalised(args.output, phrase));

  if (!tldrPresent) flags.push("missing_tldr");
  if (!readingTimePresent) flags.push("missing_reading_time");
  if (!h1Present) flags.push("missing_h1");
  if (!faqPresent) flags.push("missing_faq");
  if (!metaTitle) flags.push("missing_meta_title");
  if (!metaDescription) flags.push("missing_meta_description");
  if (!excerpt) flags.push("missing_excerpt");
  if (metaTitle && metaTitle.length > 90) flags.push("meta_title_too_long");
  if (metaDescription && metaDescription.length > 160) flags.push("meta_description_too_long");
  if (excerpt && excerpt.length > 160) flags.push("excerpt_too_long");
  if (dashViolations > 0) flags.push("em_or_en_dash");
  if (duplicateLinks.length > 0) flags.push("duplicate_internal_or_external_url");
  if (tldrHasInternalLink) flags.push("internal_link_in_tldr");
  if (forbiddenHits.length > 0) flags.push(`forbidden_content:${forbiddenHits.join(",")}`);

  const wordDelta = baselineWords ? Math.abs(outputWords - baselineWords) / baselineWords : 1;
  const baselineSimilarity = clamp(Math.round(40 * headingOverlap + 25 * (1 - Math.min(wordDelta, 1)) + 20 * conceptCoverage + 15 * Math.min(faqCount / Math.max(baselineFaqCount, 1), 1)), 0, 100);
  const complianceChecks = [tldrPresent, readingTimePresent, h1Present, faqPresent, !!metaTitle && metaTitle.length <= 90, !!metaDescription && metaDescription.length <= 160, !!excerpt && excerpt.length <= 160, dashViolations === 0, duplicateLinks.length === 0, !tldrHasInternalLink, forbiddenHits.length === 0];
  const briefCompliance = Math.round((complianceChecks.filter(Boolean).length / complianceChecks.length) * 100);
  const seoAuthority = clamp(Math.round(primaryCoverage * 50 + secondaryCoverage * 30 + Math.min(faqCount / 4, 1) * 20), 0, 100);
  const commercialFit = clamp(Math.round(conceptCoverage * 45 + (containsNormalised(args.output, "commercial") ? 10 : 0) + (containsNormalised(args.output, "conversion") ? 15 : 0) + (containsNormalised(args.output, "strategy") ? 15 : 0) + (links.length > 0 ? 15 : 0)), 0, 100);
  const improvementPotential = clamp(Math.round((briefCompliance > 85 ? 35 : 20) + (seoAuthority > 80 ? 25 : 15) + (commercialFit > 80 ? 25 : 15) + (headingOverlap < 0.6 && conceptCoverage > 0.7 ? 15 : 8)), 0, 100);
  const total = Math.round(baselineSimilarity * 0.25 + briefCompliance * 0.25 + seoAuthority * 0.2 + commercialFit * 0.2 + improvementPotential * 0.1);

  if (briefCompliance >= 90) strengths.push("Strong markdown and brief compliance"); else editingIssues.push("Needs formatting or metadata edits before CMS paste");
  if (baselineSimilarity >= 75) strengths.push("Close to live-site structure and coverage");
  if (seoAuthority >= 80) strengths.push("Strong keyword and FAQ coverage"); else editingIssues.push("SEO/topic coverage needs review");
  if (commercialFit >= 80) strengths.push("Good Optimise Digital commercial fit"); else editingIssues.push("Commercial point of view could be sharper");
  if (dashViolations > 0) editingIssues.push("Remove em dash/en dash characters");
  if (duplicateLinks.length > 0) editingIssues.push("Deduplicate repeated URLs");

  return {
    total,
    baselineSimilarity,
    briefCompliance,
    seoAuthority,
    commercialFit,
    improvementPotential,
    metrics: { outputWords, baselineWords, wordDelta, headingOverlap, faqCount, baselineFaqCount, primaryCoverage, secondaryCoverage, conceptCoverage, linkCount: links.length, duplicateLinks, dashViolations, metaTitleLength: metaTitle?.length ?? 0, metaDescriptionLength: metaDescription?.length ?? 0, excerptLength: excerpt?.length ?? 0 },
    flags,
    strengths,
    editingIssues,
  };
}

async function writeReports(args: { outputDir: string; runDate: string; metadata: ModelRunMetadata[]; briefs: BlogBriefConfig[] }): Promise<void> {
  const reportDir = path.join(args.outputDir, "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `blog-content-model-comparison-${args.runDate}.json`);
  const mdPath = path.join(reportDir, `blog-content-model-comparison-${args.runDate}.md`);
  const htmlPath = path.join(reportDir, `blog-content-model-comparison-${args.runDate}.html`);
  const passed = args.metadata.filter((m) => m.status === "passed" && m.score);
  const byModel = new Map<string, ModelRunMetadata[]>();
  for (const item of passed) byModel.set(item.modelRequested, [...(byModel.get(item.modelRequested) ?? []), item]);
  const rows = [...byModel.entries()].map(([model, items]) => ({
    model,
    runs: items.length,
    average: round(avg(items.map((m) => m.score?.total ?? 0))),
    similarity: round(avg(items.map((m) => m.score?.baselineSimilarity ?? 0))),
    compliance: round(avg(items.map((m) => m.score?.briefCompliance ?? 0))),
    seo: round(avg(items.map((m) => m.score?.seoAuthority ?? 0))),
    commercial: round(avg(items.map((m) => m.score?.commercialFit ?? 0))),
    cmsPaste: round(avg(items.map((m) => cmsPasteScore(m.score!)))),
    flags: summariseFlags(items.flatMap((m) => m.score?.flags ?? [])),
  })).sort((a, b) => b.average - a.average);

  const report = { generatedAt: new Date().toISOString(), runDate: args.runDate, rows, runs: args.metadata };
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const md = renderMarkdownReport({ rows, metadata: args.metadata, jsonPath, mdPath, htmlPath });
  await fs.writeFile(mdPath, md, "utf8");
  await fs.writeFile(htmlPath, renderHtmlReport(md), "utf8");
  console.log(`Reports written:\n${jsonPath}\n${mdPath}\n${htmlPath}`);
}

function renderMarkdownReport(args: { rows: Array<Record<string, unknown>>; metadata: ModelRunMetadata[]; jsonPath: string; mdPath: string; htmlPath: string }): string {
  const best = args.rows[0];
  const closest = [...args.rows].sort((a, b) => Number(b.similarity) - Number(a.similarity))[0];
  const compliance = [...args.rows].sort((a, b) => Number(b.compliance) - Number(a.compliance))[0];
  const seo = [...args.rows].sort((a, b) => Number(b.seo) - Number(a.seo))[0];
  const commercial = [...args.rows].sort((a, b) => Number(b.commercial) - Number(a.commercial))[0];
  const cms = [...args.rows].sort((a, b) => Number(b.cmsPaste) - Number(a.cmsPaste))[0];
  const lines = [
    "# Blog content model comparison",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## TLDR recommendation",
    "",
    best ? `Best overall in this deterministic pass: **${best.model}** with an average score of **${best.average}**. Use this as a shortlist signal, then manually review the saved markdown before changing Blog Prompter defaults.` : "No successful model runs yet.",
    "",
    "## Best model by use case",
    "",
    `- Closest to live site style: **${closest?.model ?? "n/a"}**`,
    `- Best SEO/topic authority: **${seo?.model ?? "n/a"}**`,
    `- Best commercial strategy article: **${commercial?.model ?? "n/a"}**`,
    `- Best formatting/compliance: **${compliance?.model ?? "n/a"}**`,
    `- Best direct CMS paste candidate: **${cms?.model ?? "n/a"}**`,
    "",
    "## Overall ranking",
    "",
    "| Model | Runs | Avg | Similarity | Compliance | SEO | Commercial | CMS paste | Flags |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...args.rows.map((row) => `| ${row.model} | ${row.runs} | ${row.average} | ${row.similarity} | ${row.compliance} | ${row.seo} | ${row.commercial} | ${row.cmsPaste} | ${row.flags || "-"} |`),
    "",
    "## Per-blog results",
    "",
  ];
  const grouped = groupBy(args.metadata.filter((m) => m.score), (m) => m.briefId);
  for (const [briefId, items] of grouped) {
    lines.push(`### ${briefId}`, "", "| Model | Total | Similarity | Compliance | SEO | Commercial | Main issues |", "| --- | ---: | ---: | ---: | ---: | ---: | --- |");
    for (const item of items.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))) {
      lines.push(`| ${item.modelRequested} | ${item.score?.total} | ${item.score?.baselineSimilarity} | ${item.score?.briefCompliance} | ${item.score?.seoAuthority} | ${item.score?.commercialFit} | ${(item.score?.editingIssues ?? []).slice(0, 2).join("; ") || "-"} |`);
    }
    lines.push("");
  }
  lines.push("## Failed or unavailable models", "");
  const failed = args.metadata.filter((m) => m.status === "failed");
  if (failed.length === 0) lines.push("None.");
  for (const item of failed) lines.push(`- ${item.briefId}/${item.modelRequested}: ${item.error}`);
  lines.push("", "## Artifact paths", "", `- JSON: ${args.jsonPath}`, `- Markdown: ${args.mdPath}`, `- HTML: ${args.htmlPath}`);
  return `${lines.join("\n")}\n`;
}

function renderHtmlReport(markdown: string): string {
  const escaped = escapeHtml(markdown);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Blog content model comparison</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;line-height:1.5;color:#172033}pre{white-space:pre-wrap;background:#f8fafc;border:1px solid #dbe3ef;border-radius:14px;padding:18px}</style></head><body><pre>${escaped}</pre></body></html>`;
}

async function readMetadataFromRunDir(runDir: string): Promise<ModelRunMetadata[]> {
  const out: ModelRunMetadata[] = [];
  for (const briefDir of await fs.readdir(runDir)) {
    const full = path.join(runDir, briefDir);
    const stat = await fs.stat(full);
    if (!stat.isDirectory()) continue;
    for (const file of await fs.readdir(full)) {
      if (file.endsWith(".json")) out.push(JSON.parse(await fs.readFile(path.join(full, file), "utf8")));
    }
  }
  return out;
}

interface ParsedArgs {
  _: string[];
  [key: string]: string | string[];
}

function stringArg(args: ParsedArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function resolveBriefs(args: ParsedArgs): BlogBriefConfig[] {
  if (args.all === "true") return Object.values(BLOGS);
  const brief = stringArg(args, "brief");
  const selected = brief ? brief.split(",") : Object.keys(BLOGS);
  return selected.map((id) => BLOGS[id]).filter(Boolean);
}

function resolveModels(args: ParsedArgs): CanonicalModelName[] {
  const models = stringArg(args, "models");
  if (!models || models === "default") return DEFAULT_MODELS;
  if (models === "active") return CHAT_PICKER_MODELS.map((m) => m.canonical);
  return models.split(",").map((model) => {
    const trimmed = model.trim();
    if (!isCanonicalModel(trimmed)) throw new Error(`Unknown model: ${trimmed}`);
    return trimmed;
  });
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { out._.push(arg); continue; }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = "true";
    else { out[key] = next; i += 1; }
  }
  return out;
}

function printUsage(): void {
  console.log("Usage: npm run blog:evaluate -- run --brief growth-systems --models claude-sonnet-4.6");
}

function wordCount(text: string): number { return normaliseText(text).split(/\s+/).filter(Boolean).length; }
function extractHeadings(text: string): string[] { return [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => normaliseText(m[1] ?? "")); }
function extractLabel(text: string, label: string): string | undefined { return text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim(); }
function coverage(text: string, phrases: string[]): number { if (phrases.length === 0) return 1; return phrases.filter((phrase) => containsNormalised(text, phrase)).length / phrases.length; }
function containsNormalised(text: string, phrase: string): boolean { return normaliseText(text).includes(normaliseText(phrase)); }
function normaliseText(text: string): string { return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function overlapRatio(a: string[], b: string[]): number { if (b.length === 0) return 0; const matched = b.filter((item) => a.some((other) => tokenOverlap(item, other) >= 0.5)).length; return matched / b.length; }
function tokenOverlap(a: string, b: string): number { const aa = new Set(a.split(/\s+/).filter(Boolean)); const bb = new Set(b.split(/\s+/).filter(Boolean)); if (aa.size === 0 || bb.size === 0) return 0; return [...aa].filter((token) => bb.has(token)).length / Math.max(aa.size, bb.size); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function avg(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value: number): number { return Math.round(value * 10) / 10; }
function cmsPasteScore(score: BlogScore): number { return clamp(Math.round(score.briefCompliance * 0.6 + score.commercialFit * 0.2 + score.seoAuthority * 0.2 - score.flags.length * 3), 0, 100); }
function summariseFlags(flags: string[]): string { const counts = new Map<string, number>(); for (const flag of flags) counts.set(flag, (counts.get(flag) ?? 0) + 1); return [...counts.entries()].map(([flag, count]) => `${flag}×${count}`).join(", "); }
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> { const map = new Map<string, T[]>(); for (const item of items) { const key = keyFn(item); map.set(key, [...(map.get(key) ?? []), item]); } return map; }
function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
