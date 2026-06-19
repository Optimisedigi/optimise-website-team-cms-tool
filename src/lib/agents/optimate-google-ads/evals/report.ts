import fs from "node:fs/promises";
import path from "node:path";
import type { CanonicalModelName } from "../../_shared/llm/registry";
import type { ModelProbeReport } from "./model-probe";
import type { EvalSuiteResult, EvalRunRecord } from "./runner";

export interface EvalReportSummary {
  generatedAt: string;
  overall: ModelSummary[];
  byCategory: Record<string, ModelSummary[]>;
  recommendations: Record<string, string>;
}

export interface ModelSummary {
  model: string;
  runs: number;
  averageScore: number;
  successRate: number;
  fallbackRate: number;
  p50DurationMs: number;
  p90DurationMs: number;
  inputTokens: number;
  outputTokens: number;
  flags: string[];
}

export async function writeEvalReport(args: {
  suite: EvalSuiteResult;
  outputDir?: string;
  probe?: ModelProbeReport;
}): Promise<{ jsonPath: string; markdownPath: string; summary: EvalReportSummary }> {
  const outputDir = args.outputDir ?? ".gg/optimate-evals";
  await fs.mkdir(outputDir, { recursive: true });
  const summary = buildEvalReportSummary(args.suite);
  const jsonPath = path.join(outputDir, `${args.suite.suiteId}-report.json`);
  const markdownPath = path.join(outputDir, `${args.suite.suiteId}-report.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify({ summary, suite: args.suite, probe: args.probe }, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, formatEvalReportMarkdown(summary, args.suite, args.probe), "utf8");
  return { jsonPath, markdownPath, summary };
}

export function buildEvalReportSummary(suite: EvalSuiteResult): EvalReportSummary {
  const overall = summariseRuns(suite.runs);
  const categories = Array.from(new Set(suite.runs.map((run) => run.caseCategory)));
  const byCategory: Record<string, ModelSummary[]> = {};
  for (const category of categories) {
    byCategory[category] = summariseRuns(suite.runs.filter((run) => run.caseCategory === category));
  }

  return {
    generatedAt: new Date().toISOString(),
    overall,
    byCategory,
    recommendations: buildRecommendations(byCategory, overall),
  };
}

export function formatEvalReportMarkdown(summary: EvalReportSummary, suite: EvalSuiteResult, probe?: ModelProbeReport): string {
  return [
    "# OptiMate Google Ads Model Evaluation Report",
    "",
    `Suite: ${suite.suiteId}`,
    `Generated: ${summary.generatedAt}`,
    `Audit: ${suite.auditId}`,
    "",
    ...(probe ? ["## Model readiness", "", formatProbeTable(probe), ""] : []),
    "## Overall scoreboard",
    "",
    formatSummaryTable(summary.overall),
    "",
    "## Scoreboard by category",
    "",
    ...Object.entries(summary.byCategory).flatMap(([category, rows]) => [`### ${category}`, "", formatSummaryTable(rows), ""]),
    "## Recommendations",
    "",
    ...Object.entries(summary.recommendations).map(([task, model]) => `- **${task}:** ${model}`),
    "",
    "## Safety and hallucination flags",
    "",
    formatFlagsTable(suite.runs),
    "",
  ].join("\n");
}

function summariseRuns(runs: EvalRunRecord[]): ModelSummary[] {
  const byModel = new Map<string, EvalRunRecord[]>();
  for (const run of runs) {
    const key = run.modelRequested;
    byModel.set(key, [...(byModel.get(key) ?? []), run]);
  }

  return Array.from(byModel.entries())
    .map(([model, modelRuns]) => {
      const durations = modelRuns.map((run) => run.durationMs).sort((a, b) => a - b);
      const flags = Array.from(new Set(modelRuns.flatMap((run) => run.score.flags))).sort();
      const successRuns = modelRuns.filter((run) => run.status === "passed" && !run.score.flags.includes("run_error"));
      const fallbackRuns = modelRuns.filter((run) => run.modelUsed && run.modelUsed !== run.modelRequested);
      return {
        model,
        runs: modelRuns.length,
        averageScore: round(avg(modelRuns.map((run) => run.score.total))),
        successRate: round((successRuns.length / modelRuns.length) * 100),
        fallbackRate: round((fallbackRuns.length / modelRuns.length) * 100),
        p50DurationMs: percentile(durations, 0.5),
        p90DurationMs: percentile(durations, 0.9),
        inputTokens: sum(modelRuns.map((run) => run.usage?.inputTokens ?? 0)),
        outputTokens: sum(modelRuns.map((run) => run.usage?.outputTokens ?? 0)),
        flags,
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore || a.p50DurationMs - b.p50DurationMs);
}

function buildRecommendations(byCategory: Record<string, ModelSummary[]>, overall: ModelSummary[]): Record<string, string> {
  return {
    "fast quick answers": pickFastestGood(byCategory["read-only"] ?? overall),
    "deep diagnosis": pickBest(byCategory["read-only"] ?? overall),
    "search-term waste analysis": pickBest(byCategory["read-only"] ?? overall),
    "budget management": pickBest(byCategory["email-scheduled"] ?? byCategory["read-only"] ?? overall),
    "proposal/action queueing": pickBest(byCategory.actions ?? overall),
    "email drafts": pickBest(byCategory["email-scheduled"] ?? overall),
    "scheduled task setup": pickBest(byCategory["email-scheduled"] ?? overall),
    "confirm-gated campaign workflows": pickBest(byCategory["confirm-gated"] ?? overall),
    "safest low-hallucination model": pickSafest(overall),
  };
}

function pickBest(rows: ModelSummary[]): string {
  return rows[0]?.model ?? "No data";
}

function pickFastestGood(rows: ModelSummary[]): string {
  const candidates = rows.filter((row) => row.averageScore >= 75 && row.successRate >= 80 && row.fallbackRate === 0);
  return (candidates.length > 0 ? candidates : rows).sort((a, b) => a.p50DurationMs - b.p50DurationMs)[0]?.model ?? "No data";
}

function pickSafest(rows: ModelSummary[]): string {
  const safetyBadges = ["raw_customer_id_exposed", "fabricated_approval_link", "numeric_claim_without_read_tool", "forbidden_phrase"];
  return [...rows].sort((a, b) => {
    const aFlags = a.flags.filter((flag) => safetyBadges.some((badge) => flag.startsWith(badge))).length;
    const bFlags = b.flags.filter((flag) => safetyBadges.some((badge) => flag.startsWith(badge))).length;
    return aFlags - bFlags || b.averageScore - a.averageScore;
  })[0]?.model ?? "No data";
}

function formatSummaryTable(rows: ModelSummary[]): string {
  if (rows.length === 0) return "No runs.";
  return [
    "| Model | Runs | Avg score | Success | Fallback | p50 | p90 | Tokens |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) =>
      `| ${row.model} | ${row.runs} | ${row.averageScore} | ${row.successRate}% | ${row.fallbackRate}% | ${row.p50DurationMs}ms | ${row.p90DurationMs}ms | ${row.inputTokens + row.outputTokens} |`,
    ),
  ].join("\n");
}

function formatFlagsTable(runs: EvalRunRecord[]): string {
  const flagged = runs.filter((run) => run.score.flags.length > 0);
  if (flagged.length === 0) return "No flags.";
  return [
    "| Model | Case | Score | Flags |",
    "| --- | --- | ---: | --- |",
    ...flagged.map((run) => `| ${run.modelRequested} | ${run.caseId} | ${run.score.total} | ${run.score.flags.join(", ")} |`),
  ].join("\n");
}

function formatProbeTable(probe: ModelProbeReport): string {
  return [
    "| Model | Status | Used | Duration | Error |",
    "| --- | --- | --- | ---: | --- |",
    ...probe.results.map((result) =>
      `| ${result.canonical} | ${result.status} | ${result.modelUsed ?? ""} | ${result.durationMs}ms | ${(result.error ?? result.warning ?? "").replace(/\|/g, "\\|")} |`,
    ),
  ].join("\n");
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
  return values[index] ?? 0;
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
