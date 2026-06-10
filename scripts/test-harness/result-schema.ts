/**
 * Machine-readable result schema + output layout for platform test runs.
 *
 * One `ScenarioResult` record is produced per executed scenario and appended
 * as a single JSON line to `<runDir>/results.jsonl`. The schema is the single
 * source of truth — `appendResult()` validates every record before it touches
 * disk, so a malformed record fails loudly at write time rather than silently
 * corrupting a run log.
 *
 * Output layout (see `docs/test-runs/README.md`):
 *
 *     docs/test-runs/<YYYY-MM-DD>/
 *       ├── results.jsonl            one ScenarioResult per line
 *       ├── report.md               human-readable run summary
 *       ├── teardown-manifest.jsonl  resources to clean up after the run
 *       └── screenshots/            evidence captures referenced by `evidence`
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** Outcome of a single scenario execution. */
export const ScenarioStatusSchema = z.enum([
  'pass',
  'fail',
  'blocked',
  'skipped-danger',
]);
export type ScenarioStatus = z.infer<typeof ScenarioStatusSchema>;

/**
 * Triage classification for non-passing results.
 *
 * - `DEV-CONFIG`: failure caused by local/dev environment or missing config,
 *   not a real product defect.
 * - `PROD-BUG`: a genuine bug that would also reproduce in production.
 * - `UNKNOWN`: not yet triaged / insufficient evidence to classify.
 * - `null`: triage not applicable (e.g. a passing result).
 */
export const TriageSchema = z.enum(['DEV-CONFIG', 'PROD-BUG', 'UNKNOWN']).nullable();
export type Triage = z.infer<typeof TriageSchema>;

/** Schema for a single scenario result record. */
export const ScenarioResultSchema = z.object({
  /** Feature identifier the scenario belongs to. */
  featId: z.string().min(1),
  /** Scenario identifier, unique within a feature. */
  scenarioId: z.string().min(1),
  /** Surface under test (e.g. 'admin', 'public-report', 'api'). */
  surface: z.string().min(1),
  /** Domain area (e.g. 'audits', 'finance', 'gsc'). */
  domain: z.string().min(1),
  /** Ordered human-readable steps that were executed. */
  steps: z.array(z.string()),
  /** What the scenario expected to happen. */
  expected: z.string(),
  /** What was actually observed. */
  observed: z.string(),
  /** Outcome of the scenario. */
  status: ScenarioStatusSchema,
  /** Optional evidence: screenshot path or a response snippet. */
  evidence: z.string().optional(),
  /** Required env keys / external services for this scenario to run. */
  envDeps: z.array(z.string()),
  /** Triage classification (null when not applicable). */
  triage: TriageSchema,
  /** Free-form notes / context. */
  notes: z.string(),
});

export type ScenarioResult = z.infer<typeof ScenarioResultSchema>;

/** Root directory under which all dated test runs live. */
export const TEST_RUNS_ROOT = join('docs', 'test-runs');

/** Format a Date as `YYYY-MM-DD` (UTC-stable, zero-padded). */
function isoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Create (and return the path to) the dated run directory
 * `docs/test-runs/<YYYY-MM-DD>/`, including its `screenshots/` subfolder.
 * Idempotent — safe to call repeatedly for the same day.
 */
export function makeRunDir(date: Date = new Date()): string {
  const runDir = join(TEST_RUNS_ROOT, isoDate(date));
  mkdirSync(join(runDir, 'screenshots'), { recursive: true });
  return runDir;
}

/**
 * Validate `record` against {@link ScenarioResultSchema} and append it as one
 * JSON line to `<runDir>/results.jsonl`. Throws (via Zod) if the record is
 * invalid, so callers never persist malformed results.
 */
export function appendResult(runDir: string, record: ScenarioResult): ScenarioResult {
  const parsed = ScenarioResultSchema.parse(record);
  mkdirSync(runDir, { recursive: true });
  appendFileSync(join(runDir, 'results.jsonl'), `${JSON.stringify(parsed)}\n`, 'utf8');
  return parsed;
}
