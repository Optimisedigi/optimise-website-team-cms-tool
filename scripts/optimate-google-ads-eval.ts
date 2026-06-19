import fs from "node:fs/promises";
import { formatModelInventoryMarkdown, getModelInventory } from "../src/lib/agents/optimate-google-ads/evals/model-inventory";
import { parseModelSelection, probeModels, writeProbeReport, type ModelProbeReport } from "../src/lib/agents/optimate-google-ads/evals/model-probe";
import { runOptimateGoogleAdsEval } from "../src/lib/agents/optimate-google-ads/evals/runner";
import { writeEvalReport } from "../src/lib/agents/optimate-google-ads/evals/report";
import { judgeSuite } from "../src/lib/agents/optimate-google-ads/evals/judge";
import type { EvalCaseCategory } from "../src/lib/agents/optimate-google-ads/evals/cases";
import type { CanonicalModelName } from "../src/lib/agents/_shared/llm/registry";

const OUTPUT_DIR = ".gg/optimate-evals";

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "inventory") {
    const inventory = getModelInventory();
    const markdown = formatModelInventoryMarkdown(inventory);
    console.log(markdown);
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(`${OUTPUT_DIR}/model-inventory.json`, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    await fs.writeFile(`${OUTPUT_DIR}/model-inventory.md`, markdown, "utf8");
    return;
  }

  if (command === "probe") {
    const models = parseModelSelection(args.models);
    const report = await probeModels(models);
    const paths = await writeProbeReport(report, OUTPUT_DIR);
    console.log(`Probe written:\n${paths.jsonPath}\n${paths.markdownPath}`);
    return;
  }

  if (command === "run") {
    const audit = requireArg(args, "audit");
    const models = await resolveModelsForRun(args.models);
    const categories = parseCategories(args.cases);
    const { result, jsonPath } = await runOptimateGoogleAdsEval({
      auditId: audit,
      models,
      categories,
      repeats: args.repeats ? Number(args.repeats) : 1,
      concurrency: args.concurrency ? Number(args.concurrency) : 1,
      allowActions: args["allow-actions"] === "true",
      outputDir: OUTPUT_DIR,
      userId: args.user ? Number(args.user) : undefined,
    });
    const report = await writeEvalReport({ suite: result, outputDir: OUTPUT_DIR });
    console.log(`Suite written:\n${jsonPath}\n${report.markdownPath}`);
    return;
  }

  if (command === "report") {
    const suitePath = requireArg(args, "suite");
    const suite = JSON.parse(await fs.readFile(suitePath, "utf8"));
    const report = await writeEvalReport({ suite, outputDir: OUTPUT_DIR });
    console.log(`Report written:\n${report.jsonPath}\n${report.markdownPath}`);
    return;
  }

  if (command === "judge") {
    const suitePath = requireArg(args, "suite");
    const judgeModels = parseModelSelection(requireArg(args, "judge-models"));
    const suite = JSON.parse(await fs.readFile(suitePath, "utf8"));
    const report = await judgeSuite({ suite, judgeModels, outputDir: OUTPUT_DIR });
    console.log(`Judge report written:\n${report.jsonPath}`);
    return;
  }

  printUsage();
  process.exit(command ? 1 : 0);
}

async function resolveModelsForRun(selection: string | undefined): Promise<CanonicalModelName[]> {
  if (selection === "ready-from-latest-probe") {
    const latest = await findLatestProbeReport();
    if (!latest) throw new Error("No model probe report found under .gg/optimate-evals");
    const report = JSON.parse(await fs.readFile(latest, "utf8")) as ModelProbeReport;
    return report.results.filter((result) => result.status === "ready").map((result) => result.canonical);
  }
  return parseModelSelection(selection);
}

async function findLatestProbeReport(): Promise<string | null> {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const probes = files.filter((file) => /^model-probe-.*\.json$/.test(file)).sort();
    const latest = probes.at(-1);
    return latest ? `${OUTPUT_DIR}/${latest}` : null;
  } catch {
    return null;
  }
}

function parseCategories(value: string | undefined): EvalCaseCategory[] | undefined {
  if (!value || value === "read-only") return ["read-only"];
  if (value === "actions") return ["actions", "confirm-gated", "email-scheduled", "memory-context"];
  if (value === "all") return undefined;
  return value.split(",").map((category) => category.trim() as EvalCaseCategory).filter(Boolean);
}

function parseArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function requireArg(args: Record<string, string>, key: string): string {
  const value = args[key];
  if (!value) throw new Error(`Missing required --${key}`);
  return value;
}

function printUsage(): void {
  console.log(`Usage:
  npm run optimate:evaluate -- inventory
  npm run optimate:evaluate -- probe --models active
  npm run optimate:evaluate -- run --models ready-from-latest-probe --cases read-only --audit <auditId> --concurrency 1 --repeats 1
  npm run optimate:evaluate -- report --suite <suite-results.json>
  npm run optimate:evaluate -- judge --suite <suite-results.json> --judge-models claude-sonnet-4.6,gpt-5.5-codex`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
