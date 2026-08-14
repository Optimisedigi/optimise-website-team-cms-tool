/**
 * Guard for scripts that write test or seed data.
 *
 * A seed script once wrote 9,915 fake events into the production database. The
 * cause was not carelessness at the call site: the script parsed `.env`
 * directly, while the dev server resolves `.env.local` first. Both were "the
 * database", and they were different databases. Anyone reading that script
 * would have believed it was local.
 *
 * So this module does two things, and both matter:
 *
 *   1. Resolves the database the same way Next.js does, using Next's own env
 *      loader rather than a hand-rolled parser that can drift from it.
 *   2. Refuses to hand back a connection unless the target is unmistakably a
 *      local file, and says plainly why when it refuses.
 *
 * It fails closed. Anything that is not a local file path is treated as
 * production, including a URL this module does not recognise, because the cost
 * of a false negative is writing junk into real customer data.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

export interface ResolvedDatabase {
  /** The resolved DATABASE_URL, exactly as the dev server would see it. */
  url: string;
  /** Which env files were consulted, nearest-first, for error messages. */
  loadedFiles: string[];
  /** True only when the target is a local file this process may safely rewrite. */
  isLocalFile: boolean;
  /** Set when the URL matches the deployed production configuration. */
  matchesProductionConfig: boolean;
}

export class ProductionDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionDatabaseError";
  }
}

/** A local file target: `file:` URLs and bare relative or absolute paths. */
export function isLocalFileUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("file:")) return true;
  // A bare path with no scheme is a local sqlite file.
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

/**
 * Read DATABASE_URL out of the deployed production env file, if it is present.
 *
 * This is belt and braces: even if a URL somehow looked local, matching the
 * deployed configuration is decisive evidence that it is not.
 */
export function readProductionUrl(cwd: string): string | null {
  const path = join(cwd, ".env.vercel.production");
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    if (line.slice(0, index).trim() !== "DATABASE_URL") continue;
    return line
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return null;
}

/**
 * Classify an already-resolved URL. Exported separately from the loader so the
 * decision can be tested without touching the real environment.
 */
export function classifyDatabase(
  url: string,
  productionUrl: string | null,
  loadedFiles: string[] = []
): ResolvedDatabase {
  const trimmed = (url ?? "").trim();
  return {
    url: trimmed,
    loadedFiles,
    isLocalFile: isLocalFileUrl(trimmed),
    matchesProductionConfig:
      Boolean(productionUrl) && trimmed !== "" && trimmed === productionUrl!.trim(),
  };
}

/** Hide credentials before a URL reaches a log line or an error message. */
export function redact(url: string): string {
  if (!url) return "(empty)";
  return url.replace(/\/\/[^@]*@/, "//<redacted>@").slice(0, 80);
}

/**
 * Resolve the database exactly as the Next.js dev server does.
 *
 * Uses Next's own loader, so `.env.local` takes precedence over `.env` here for
 * the same reason and by the same rules as it does when the app runs.
 */
export function resolveDatabase(cwd: string = process.cwd()): ResolvedDatabase {
  // Loaded through createRequire rather than a bare require, so this module
  // works whether it is imported as ESM (scripts, vitest) or CommonJS.
  const load = createRequire(import.meta.url);
  const { loadEnvConfig, resetEnv } = load("@next/env") as {
    loadEnvConfig: (
      dir: string,
      dev: boolean,
      logger: { info: (m: string) => void; error: (m: string) => void },
      forceReload: boolean
    ) => { loadedEnvFiles: { path: string }[] };
    resetEnv: () => void;
  };

  // Next memoises the loaded environment for the life of the process, so a
  // second call would otherwise report the first call's answer.
  resetEnv();

  // Next selects which env files to read from NODE_ENV, and under `test` it
  // skips `.env.local` entirely and falls through to `.env`. On this repository
  // `.env` points at production, so a seeder run with NODE_ENV=test would
  // resolve to production while looking perfectly ordinary. Resolution is
  // pinned to development here, which is what the dev server uses.
  const previousNodeEnv = process.env.NODE_ENV;
  if (previousNodeEnv === "test") delete (process.env as Record<string, string | undefined>).NODE_ENV;

  const silent = { info: () => {}, error: () => {} };
  let loadedFiles: string[] = [];
  try {
    // forceReload, because the memo above is keyed to the process, not the dir.
    const result = loadEnvConfig(cwd, true, silent, true);
    loadedFiles = result.loadedEnvFiles.map((file: { path: string }) => file.path);
  } finally {
    if (previousNodeEnv === "test") {
      (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
    }
  }

  return classifyDatabase(
    process.env.DATABASE_URL ?? "",
    readProductionUrl(cwd),
    loadedFiles
  );
}

/**
 * Throw unless the resolved database is a local file.
 *
 * Returns the resolution so a caller can log which file it is about to write.
 */
export function assertLocalDatabase(resolved: ResolvedDatabase): ResolvedDatabase {
  const where = resolved.loadedFiles.length
    ? `Resolved from: ${resolved.loadedFiles.join(", ")} (nearest first).`
    : "No env files were loaded.";

  if (resolved.matchesProductionConfig) {
    throw new ProductionDatabaseError(
      [
        "Refusing to run: this resolves to the PRODUCTION database.",
        `DATABASE_URL matches .env.vercel.production (${redact(resolved.url)}).`,
        where,
        "Point DATABASE_URL at a local file, for example file:./content.db in .env.local.",
      ].join("\n")
    );
  }

  if (!resolved.isLocalFile) {
    throw new ProductionDatabaseError(
      [
        "Refusing to run: this is not a local database.",
        `DATABASE_URL is ${redact(resolved.url) || "(empty)"}, which is remote or unrecognised.`,
        where,
        "Seed and test scripts may only write to a local file, for example file:./content.db.",
        "This check fails closed: an unrecognised target is treated as production.",
      ].join("\n")
    );
  }

  return resolved;
}

/** Resolve and assert in one step. Scripts should call this before writing. */
export function requireLocalDatabase(cwd: string = process.cwd()): ResolvedDatabase {
  return assertLocalDatabase(resolveDatabase(cwd));
}
