import { NextResponse } from "next/server";
import { callLLM } from "@/lib/agents/_shared/llm";
import { isCanonicalModel, type CanonicalModelName } from "@/lib/agents/_shared/llm/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type EvalBrief = {
  id: string;
  brief: string;
  baseline: string;
  primaryKeywords?: string[];
  secondaryKeywords?: string[];
  forbiddenPhrases?: string[];
  requiredConcepts?: string[];
};

type RequestBody = {
  action?: "run";
  models?: string[];
  briefs?: EvalBrief[];
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = request.headers.get("x-internal-api-key") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!process.env.INTERNAL_API_KEY || auth !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    if (body.action !== "run") return NextResponse.json({ error: "Unknown action. Use run." }, { status: 400 });
    const models = parseModels(body.models);
    const briefs = body.briefs?.filter((brief) => brief.id && brief.brief && brief.baseline) ?? [];
    if (briefs.length === 0) return NextResponse.json({ error: "Provide at least one brief with id, brief, and baseline." }, { status: 400 });

    const results = [];
    for (const brief of briefs) {
      for (const model of models) {
        results.push(await runOne(brief, model));
      }
    }

    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function runOne(brief: EvalBrief, model: CanonicalModelName) {
  const started = Date.now();
  try {
    const response = await callLLM({
      model,
      fallbackModels: [],
      system: "You are writing blog content for Optimise Digital. Follow the supplied markdown brief exactly. Return only markdown suitable for CMS paste. Do not wrap the answer in code fences.",
      messages: [{ role: "user", content: [{ type: "text", text: brief.brief }] }],
      maxTokens: 12000,
      timeoutMs: 180000,
    });
    const markdown = response.message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n\n").trim();
    return {
      briefId: brief.id,
      modelRequested: model,
      modelUsed: response.model,
      source: response.source,
      status: "passed",
      durationMs: Date.now() - started,
      usage: response.usage,
      markdown,
      score: scoreBlog({ output: markdown, baseline: brief.baseline, config: brief }),
    };
  } catch (error) {
    return {
      briefId: brief.id,
      modelRequested: model,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseModels(models?: string[]): CanonicalModelName[] {
  if (!models || models.length === 0) throw new Error("Provide models explicitly.");
  return models.map((model) => {
    if (!isCanonicalModel(model)) throw new Error(`Unknown model: ${model}`);
    return model;
  });
}

function scoreBlog(args: { output: string; baseline: string; config: EvalBrief }) {
  const flags: string[] = [];
  const outputWords = wordCount(args.output);
  const baselineWords = wordCount(args.baseline);
  const headingOverlap = overlapRatio(extractHeadings(args.output), extractHeadings(args.baseline));
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
  const links = [...args.output.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] ?? "");
  const duplicateLinks = links.filter((url, index) => links.indexOf(url) !== index);
  const tldrBlock = args.output.split(/\n\s*##\s+/)[0] ?? "";
  const tldrHasInternalLink = /\[[^\]]+\]\(\//.test(tldrBlock);
  const primaryCoverage = coverage(args.output, args.config.primaryKeywords ?? []);
  const secondaryCoverage = coverage(args.output, args.config.secondaryKeywords ?? []);
  const conceptCoverage = coverage(args.output, args.config.requiredConcepts ?? []);
  const forbiddenHits = (args.config.forbiddenPhrases ?? []).filter((phrase) => containsNormalised(args.output, phrase));

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

  return { total, baselineSimilarity, briefCompliance, seoAuthority, commercialFit, improvementPotential, flags, metrics: { outputWords, baselineWords, wordDelta, headingOverlap, faqCount, baselineFaqCount, primaryCoverage, secondaryCoverage, conceptCoverage, linkCount: links.length, duplicateLinks, dashViolations } };
}

function wordCount(text: string): number { return normaliseText(text).split(/\s+/).filter(Boolean).length; }
function extractHeadings(text: string): string[] { return [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => normaliseText(match[1] ?? "")); }
function extractLabel(text: string, label: string): string | undefined { return text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim(); }
function coverage(text: string, phrases: string[]): number { if (phrases.length === 0) return 1; return phrases.filter((phrase) => containsNormalised(text, phrase)).length / phrases.length; }
function containsNormalised(text: string, phrase: string): boolean { return normaliseText(text).includes(normaliseText(phrase)); }
function normaliseText(text: string): string { return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function overlapRatio(a: string[], b: string[]): number { if (b.length === 0) return 0; const matched = b.filter((item) => a.some((other) => tokenOverlap(item, other) >= 0.5)).length; return matched / b.length; }
function tokenOverlap(a: string, b: string): number { const aa = new Set(a.split(/\s+/).filter(Boolean)); const bb = new Set(b.split(/\s+/).filter(Boolean)); if (aa.size === 0 || bb.size === 0) return 0; return [...aa].filter((token) => bb.has(token)).length / Math.max(aa.size, bb.size); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
