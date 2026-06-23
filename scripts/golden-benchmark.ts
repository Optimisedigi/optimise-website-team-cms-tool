import fs from "node:fs/promises";
import path from "node:path";

interface Manifest {
  version: number;
  domain: string;
  benchmarks: Array<{
    id: string;
    description: string;
    goldModel: string;
    files: Record<string, string>;
  }>;
}

interface FixtureCheck {
  domain: string;
  id: string;
  ok: boolean;
  missing: string[];
  warnings: string[];
}

const FIXTURE_ROOTS = [
  "tests/fixtures/optimate-google-ads/golden-benchmarks",
  "tests/fixtures/blog-content/golden-benchmarks",
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const roots = args.domain
    ? FIXTURE_ROOTS.filter((root) => root.includes(String(args.domain)))
    : FIXTURE_ROOTS;
  const checks: FixtureCheck[] = [];

  for (const root of roots) {
    checks.push(...await validateRoot(root));
  }

  const failed = checks.filter((check) => !check.ok);
  const lines = renderReport(checks);
  console.log(lines.join("\n"));

  if (args["write-report"]) {
    const outPath = typeof args["write-report"] === "string" ? args["write-report"] : ".gg/benchmark-reports/golden-benchmark-validation.md";
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${lines.join("\n")}\n`, "utf8");
  }

  if (failed.length > 0) process.exit(1);
}

async function validateRoot(root: string): Promise<FixtureCheck[]> {
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
  const checks: FixtureCheck[] = [];

  for (const benchmark of manifest.benchmarks) {
    const missing: string[] = [];
    const warnings: string[] = [];
    const fileContents = new Map<string, string>();
    for (const [label, relativePath] of Object.entries(benchmark.files)) {
      const filePath = path.join(root, relativePath);
      try {
        const content = await fs.readFile(filePath, "utf8");
        fileContents.set(label, content);
        if (!content.trim()) warnings.push(`${label} is empty`);
        if ((label === "goldAnswer" || label === "prompt") && /[—–]/.test(content)) {
          warnings.push(`${label} contains em/en dash characters`);
        }
      } catch {
        missing.push(`${label}: ${filePath}`);
      }
    }
    if (missing.length === 0) {
      warnings.push(...validateBenchmarkContent(manifest.domain, benchmark.id, fileContents));
    }
    checks.push({
      domain: manifest.domain,
      id: benchmark.id,
      ok: missing.length === 0 && warnings.length === 0,
      missing,
      warnings,
    });
  }

  return checks;
}

function validateBenchmarkContent(domain: string, id: string, files: Map<string, string>): string[] {
  const warnings: string[] = [];
  const goldAnswer = files.get("goldAnswer") ?? "";

  if (domain === "optimate-google-ads") {
    const canonicalText = files.get("canonical");
    if (!canonicalText) return ["missing canonical content"];
    const canonical = JSON.parse(canonicalText) as { tool?: string; output?: unknown };
    if (id === "eight-week-performance-story") {
      const rows = ((canonical.output as { rows?: Array<{ label: string; totals: { clicks: number; spend: number; conversions: number } }> })?.rows ?? []);
      for (const row of rows) {
        const cpa = Math.round(row.totals.spend / row.totals.conversions);
        const required = [row.label, String(row.totals.clicks), `$${Math.round(row.totals.spend)}`, String(Math.round(row.totals.conversions)), `$${cpa}`];
        for (const token of required) {
          if (!goldAnswer.includes(token)) warnings.push(`${id} gold answer missing ${token}`);
        }
      }
    }
    if (id === "may-converting-search-terms-top-10") {
      const terms = ((canonical.output as { terms?: Array<{ term: string; clicks: number; spend: number; conversions: number; cpa: number | null }> })?.terms ?? [])
        .filter((term) => Number(term.conversions) >= 1)
        .sort((a, b) => Number(b.spend) - Number(a.spend))
        .slice(0, 10);
      for (const term of terms) {
        const avgCpc = term.clicks > 0 ? term.spend / term.clicks : 0;
        const required = [term.term, `$${term.spend.toFixed(2)}`, term.cpa === null ? "" : `$${term.cpa.toFixed(2)}`, `$${avgCpc.toFixed(2)}`].filter(Boolean);
        for (const token of required) {
          if (!goldAnswer.includes(token)) warnings.push(`${id} gold answer missing ${token}`);
        }
      }
    }
  }

  if (domain === "blog-content") {
    const requiredPatterns: Array<[string, RegExp]> = [
      ["H1", /^#\s+.+/m],
      ["TLDR", />?\s*TL;?DR/i],
      ["reading time", /reading time/i],
      ["FAQ", /##\s*FAQ/i],
      ["Meta Title", /^Meta Title:\s*.+$/im],
      ["Meta Description", /^Meta Description:\s*.+$/im],
      ["Excerpt", /^Excerpt:\s*.+$/im],
    ];
    for (const [label, pattern] of requiredPatterns) {
      if (!pattern.test(goldAnswer)) warnings.push(`${id} gold answer missing ${label}`);
    }
    const metaTitle = goldAnswer.match(/^Meta Title:\s*(.+)$/im)?.[1]?.trim();
    const metaDescription = goldAnswer.match(/^Meta Description:\s*(.+)$/im)?.[1]?.trim();
    const excerpt = goldAnswer.match(/^Excerpt:\s*(.+)$/im)?.[1]?.trim();
    if (metaTitle && metaTitle.length > 90) warnings.push(`${id} meta title exceeds 90 chars`);
    if (metaDescription && metaDescription.length > 160) warnings.push(`${id} meta description exceeds 160 chars`);
    if (excerpt && excerpt.length > 160) warnings.push(`${id} excerpt exceeds 160 chars`);
  }

  return warnings;
}

function renderReport(checks: FixtureCheck[]): string[] {
  const lines = [
    "# Golden benchmark fixture validation",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Domain | Benchmark | Status | Warnings | Missing |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const check of checks) {
    lines.push(`| ${check.domain} | ${check.id} | ${check.ok ? "ok" : "failed"} | ${check.warnings.join("; ") || "-"} | ${check.missing.join("; ") || "-"} |`);
  }

  lines.push(
    "",
    "## How to use",
    "",
    "Run this validation after adding or editing benchmark fixtures:",
    "",
    "```bash",
    "npm run benchmark:golden",
    "```",
    "",
    "Use these fixtures as the target set for future model, tool, prompt and system-prompt changes. A later runner can generate candidate outputs and compare them against each fixture's prompt, canonical data, gold answer and scoring notes.",
  );

  return lines;
}

function parseArgs(args: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
