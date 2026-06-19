import fs from "node:fs/promises";
import path from "node:path";
import { AggregateLLMError, callLLM } from "../../_shared/llm";
import type { Message, Usage } from "../../_shared/llm/types";
import { NoCredentialError } from "../../_shared/llm/auth/types";
import { OAuthFailedError } from "../../_shared/llm/auth/resolver";
import { classifyError, HttpError } from "../../_shared/llm/retry";
import { isCanonicalModel, type CanonicalModelName } from "../../_shared/llm/registry";
import { getActivePickerModels, getModelInventory, type ModelInventoryEntry } from "./model-inventory";

export const MODEL_PROBE_EXPECTED_REPLY = "OPTIMATE_MODEL_PROBE_OK";

export type ModelProbeStatus =
  | "ready"
  | "ready_non_exact"
  | "ready_with_fallback"
  | "missing_credentials"
  | "auth_failed"
  | "model_unavailable"
  | "rate_limited_or_overloaded"
  | "failed";

export interface ModelProbeResult {
  canonical: CanonicalModelName;
  status: ModelProbeStatus;
  modelRequested: CanonicalModelName;
  modelUsed?: string;
  source?: string;
  durationMs: number;
  reply?: string;
  usage?: Usage;
  error?: string;
  warning?: string;
}

export interface ModelProbeReport {
  generatedAt: string;
  results: ModelProbeResult[];
  inventory: ModelInventoryEntry[];
}

export function parseModelSelection(selection: string | undefined): CanonicalModelName[] {
  if (!selection || selection === "active") return getActivePickerModels();
  if (selection === "all") return getModelInventory().map((entry) => entry.canonical);

  const out: CanonicalModelName[] = [];
  for (const raw of selection.split(",")) {
    const model = raw.trim();
    if (!model) continue;
    if (!isCanonicalModel(model)) {
      throw new Error(`Unknown model: ${model}`);
    }
    out.push(model);
  }
  return Array.from(new Set(out));
}

export async function probeModels(models: CanonicalModelName[]): Promise<ModelProbeReport> {
  const results: ModelProbeResult[] = [];
  for (const model of models) {
    results.push(await probeModel(model));
  }

  return {
    generatedAt: new Date().toISOString(),
    inventory: getModelInventory(),
    results,
  };
}

export async function probeModel(model: CanonicalModelName): Promise<ModelProbeResult> {
  const started = Date.now();
  const messages: Message[] = [
    {
      role: "user",
      content: [{ type: "text", text: `Reply with exactly: ${MODEL_PROBE_EXPECTED_REPLY}` }],
    },
  ];

  try {
    const response = await callLLM({
      model,
      messages,
      system: "You are a connectivity probe. Do not call tools. Reply with the exact requested text and nothing else.",
      maxTokens: 32,
      fallbackModels: [],
      timeoutMs: 45_000,
      reasoningMode: "off",
    });
    const reply = response.message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    const status: ModelProbeStatus =
      response.model !== model
        ? "ready_with_fallback"
        : reply === MODEL_PROBE_EXPECTED_REPLY
          ? "ready"
          : "ready_non_exact";

    return {
      canonical: model,
      status,
      modelRequested: model,
      modelUsed: response.model,
      source: response.source,
      durationMs: Date.now() - started,
      reply,
      usage: response.usage,
      warning:
        status === "ready"
          ? undefined
          : status === "ready_with_fallback"
            ? "Probe succeeded but a different model served it, not suitable for fair benchmarking until fixed."
            : "Probe connected to the requested model, but the reply was not exact. Include only if a real OptiMate smoke case behaves normally.",
    };
  } catch (error) {
    return {
      canonical: model,
      status: classifyProbeError(error),
      modelRequested: model,
      durationMs: Date.now() - started,
      error: describeProbeError(error),
    };
  }
}

export async function writeProbeReport(report: ModelProbeReport, outputDir = ".gg/optimate-evals"): Promise<{ jsonPath: string; markdownPath: string }> {
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = report.generatedAt.slice(0, 10);
  const jsonPath = path.join(outputDir, `model-probe-${stamp}.json`);
  const markdownPath = path.join(outputDir, `model-probe-${stamp}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, formatProbeReportMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

export function formatProbeReportMarkdown(report: ModelProbeReport): string {
  return [
    "# OptiMate Model Probe Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Model | Status | Served by | Source | Duration | Notes |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...report.results.map((result) =>
      [
        result.canonical,
        result.status,
        result.modelUsed ?? "",
        result.source ?? "",
        `${result.durationMs}ms`,
        result.warning ?? result.error ?? "",
      ]
        .map(escapeMarkdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    ),
    "",
    "## Ready models",
    "",
    readyModelsFromProbe(report).length > 0 ? readyModelsFromProbe(report).map((model) => `- ${model}`).join("\n") : "No models ready.",
    "",
  ].join("\n");
}

export function readyModelsFromProbe(report: ModelProbeReport): CanonicalModelName[] {
  return report.results.filter((result) => result.status === "ready").map((result) => result.canonical);
}

function classifyProbeError(error: unknown): ModelProbeStatus {
  const primary = unwrapAggregateError(error);
  if (primary instanceof NoCredentialError) return "missing_credentials";
  if (primary instanceof OAuthFailedError) return "auth_failed";
  const errorClass = classifyError(primary);
  if (errorClass === "auth") return "auth_failed";
  if (errorClass === "rate-limited" || errorClass === "overloaded" || errorClass === "timeout" || errorClass === "transient") {
    return "rate_limited_or_overloaded";
  }
  if (errorClass === "invalid-request") return "model_unavailable";
  if (primary instanceof HttpError && primary.status === 404) return "model_unavailable";
  return "failed";
}

function describeProbeError(error: unknown): string {
  const primary = unwrapAggregateError(error);
  return primary instanceof Error ? primary.message : String(primary);
}

function unwrapAggregateError(error: unknown): unknown {
  if (error instanceof AggregateLLMError) {
    return error.errors[0]?.error ?? error;
  }
  return error;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
