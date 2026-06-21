import fs from "node:fs/promises";
import path from "node:path";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { CanonicalModelName } from "../../_shared/llm/registry";
import type { Message } from "../../_shared/llm/types";
import { runChatTurn, type RunChatTurnResult } from "../index";
import { getEvalCases, type EvalCaseCategory, type OptimateEvalCase } from "./cases";
import { scoreEvalRun, type EvalActivityRow, type EvalScore } from "./score";

export interface EvalRunOptions {
  auditId: string | number;
  models: CanonicalModelName[];
  categories?: EvalCaseCategory[];
  caseIds?: string[];
  repeats?: number;
  concurrency?: number;
  allowActions?: boolean;
  outputDir?: string;
  userId?: number;
}

export interface EvalRunRecord {
  id: string;
  caseId: string;
  caseCategory: EvalCaseCategory;
  modelRequested: CanonicalModelName;
  modelUsed?: string;
  source?: string;
  repeatIndex: number;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  reply?: string;
  error?: string;
  runId?: string;
  usage?: RunChatTurnResult["totalUsage"];
  proposals?: RunChatTurnResult["proposals"];
  confirmRequests?: RunChatTurnResult["confirmRequests"];
  activityRows: EvalActivityRow[];
  score: EvalScore;
}

export interface EvalSuiteResult {
  suiteId: string;
  generatedAt: string;
  auditId: string | number;
  models: CanonicalModelName[];
  cases: Array<Pick<OptimateEvalCase, "id" | "category" | "version" | "prompt">>;
  runs: EvalRunRecord[];
}

interface EvalJob {
  testCase: OptimateEvalCase;
  model: CanonicalModelName;
  repeatIndex: number;
}

export async function runOptimateGoogleAdsEval(options: EvalRunOptions): Promise<{ result: EvalSuiteResult; jsonPath: string }> {
  const repeats = options.repeats ?? 1;
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const cases = getEvalCases({ categories: options.categories, ids: options.caseIds, allowActions: options.allowActions });
  const unsafeParallel = cases.some((testCase) => !testCase.parallelSafe);
  const effectiveConcurrency = unsafeParallel ? 1 : concurrency;
  const jobs = buildJobs(cases, options.models, repeats);
  const suiteId = `optimate-eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = path.join(options.outputDir ?? ".gg/optimate-evals", suiteId);
  await fs.mkdir(outputDir, { recursive: true });

  const payload = await getPayload({ config });
  const audit = await payload.findByID({ collection: "google-ads-audits" as never, id: options.auditId as never, depth: 1, overrideAccess: true });
  const client = await resolveLinkedClient(payload, audit as Record<string, unknown>);

  const runs: EvalRunRecord[] = [];
  let nextJobIndex = 0;

  async function worker(): Promise<void> {
    while (nextJobIndex < jobs.length) {
      const job = jobs[nextJobIndex++];
      if (!job) return;
      const run = await executeJob({ job, audit, client, userId: options.userId });
      runs.push(run);
      await fs.writeFile(path.join(outputDir, `${run.id}.json`), `${JSON.stringify(run, null, 2)}\n`, "utf8");
    }
  }

  await Promise.all(Array.from({ length: effectiveConcurrency }, () => worker()));

  const result: EvalSuiteResult = {
    suiteId,
    generatedAt: new Date().toISOString(),
    auditId: options.auditId,
    models: options.models,
    cases: cases.map((testCase) => ({ id: testCase.id, category: testCase.category, version: testCase.version, prompt: testCase.prompt })),
    runs: runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
  };
  const jsonPath = path.join(outputDir, "suite-results.json");
  await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { result, jsonPath };
}

function buildJobs(cases: OptimateEvalCase[], models: CanonicalModelName[], repeats: number): EvalJob[] {
  const jobs: EvalJob[] = [];
  for (const testCase of cases) {
    for (const model of models) {
      for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
        jobs.push({ testCase, model, repeatIndex });
      }
    }
  }
  return jobs;
}

async function executeJob(args: {
  job: EvalJob;
  audit: unknown;
  client: unknown;
  userId?: number;
}): Promise<EvalRunRecord> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const id = `${args.job.testCase.id}-${args.job.model}-${args.job.repeatIndex}-${Date.now().toString(36)}`;
  const prompt = buildEvalPrompt(args.job.testCase);
  const messages: Message[] = [{ role: "user", content: [{ type: "text", text: prompt }] }];

  let result: RunChatTurnResult | undefined;
  let error: string | undefined;
  try {
    result = await runChatTurn({
      audit: args.audit as never,
      client: args.client as never,
      messages,
      modelOverride: args.job.model,
      userId: args.userId,
      reasoningMode: args.job.testCase.reasoningMode,
      restrictExternalContextActions: args.job.testCase.category === "security",
      disableFallbacks: true,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - started;
  const activityRows = result?.runId ? await fetchActivityRows(result.runId) : [];
  const score = scoreEvalRun({ testCase: args.job.testCase, result, activityRows, durationMs, error });
  const hasHardFailure = score.flags.some((flag) =>
    flag.startsWith("missing_expected_tools:") || flag === "numeric_claim_without_read_tool",
  );

  return {
    id,
    caseId: args.job.testCase.id,
    caseCategory: args.job.testCase.category,
    modelRequested: args.job.model,
    modelUsed: result?.modelUsed,
    source: result?.source,
    repeatIndex: args.job.repeatIndex,
    status: error || hasHardFailure ? "failed" : "passed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    reply: result?.reply,
    error,
    runId: result?.runId,
    usage: result?.totalUsage,
    proposals: result?.proposals,
    confirmRequests: result?.confirmRequests,
    activityRows,
    score,
  };
}

function buildEvalPrompt(testCase: OptimateEvalCase): string {
  if (!testCase.requiresAllowActions) return testCase.prompt;
  return [
    "[EVAL RUN] This is a controlled OptiMate model evaluation. Do not apply live changes. If you queue any approval or proposal, include [EVAL] at the start of the proposal summary. Keep all changes approval-only.",
    "",
    testCase.prompt,
  ].join("\n");
}

async function fetchActivityRows(agentRunId: string): Promise<EvalActivityRow[]> {
  const payload = await getPayload({ config });
  const rows = await payload.find({
    collection: "activity-log" as never,
    where: { agentRunId: { equals: agentRunId } } as never,
    limit: 100,
    sort: "createdAt",
    overrideAccess: true,
  });
  return (rows.docs as Array<Record<string, unknown>>).map((row) => ({
    type: row.type as string | null | undefined,
    toolName: row.toolName as string | null | undefined,
    input: row.input,
    output: row.output,
    model: row.model as string | null | undefined,
    source: row.source as string | null | undefined,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    reasoning: row.reasoning as string | null | undefined,
  }));
}

async function resolveLinkedClient(payload: Awaited<ReturnType<typeof getPayload>>, audit: Record<string, unknown>): Promise<unknown | null> {
  const linkedClient = audit.linkedClient;
  if (linkedClient && typeof linkedClient === "object") return linkedClient;
  const linkedClientId = typeof linkedClient === "number" || typeof linkedClient === "string" ? linkedClient : null;
  if (!linkedClientId) return null;
  try {
    return await payload.findByID({ collection: "clients" as never, id: linkedClientId as never, depth: 1, overrideAccess: true });
  } catch {
    return null;
  }
}
