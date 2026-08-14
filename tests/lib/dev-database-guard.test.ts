import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ProductionDatabaseError,
  assertLocalDatabase,
  classifyDatabase,
  isLocalFileUrl,
  readProductionUrl,
  redact,
  resolveDatabase,
} from "@/lib/dev-database-guard";

/**
 * A seed script wrote 9,915 fake rows into the production database because it
 * parsed `.env` directly while the dev server resolves `.env.local` first.
 *
 * These tests pin the two properties that stop that recurring: the guard must
 * resolve the database the same way the dev server does, and it must refuse
 * anything that is not unmistakably a local file.
 */

const PRODUCTION_URL = "libsql://content-cms-optimisedigi.aws-ap-northeast-1.turso.io";

let workspace: string;

function writeEnv(name: string, contents: string) {
  writeFileSync(join(workspace, name), contents);
}

/**
 * The test runner loads this repository's own `.env` before any test runs, so
 * DATABASE_URL is already present in the ambient environment and in the
 * snapshot Next captured from it. An ambient value legitimately wins over env
 * files — that is how the dev server behaves and the guard matches it — so both
 * have to be cleared for a test to observe file resolution at all.
 */
async function clearAmbientDatabaseUrl() {
  // The key has to be removed, not set to undefined: Next writes its snapshot
  // back onto process.env, and assigning undefined there yields the string
  // "undefined" rather than an absent variable.
  const nextEnv = (await import("@next/env")) as unknown as {
    initialEnv?: Record<string, string | undefined>;
  };
  delete process.env.DATABASE_URL;
  if (nextEnv.initialEnv) delete nextEnv.initialEnv.DATABASE_URL;
}

beforeEach(async () => {
  workspace = mkdtempSync(join(tmpdir(), "db-guard-"));
  await clearAmbientDatabaseUrl();
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  delete process.env.DATABASE_URL;
});

describe("target classification", () => {
  it("treats file URLs and bare paths as local", () => {
    expect(isLocalFileUrl("file:./content.db")).toBe(true);
    expect(isLocalFileUrl("file:/var/tmp/x.db")).toBe(true);
    expect(isLocalFileUrl("./content.db")).toBe(true);
    expect(isLocalFileUrl("/absolute/content.db")).toBe(true);
  });

  it("treats remote and unrecognised schemes as not local", () => {
    expect(isLocalFileUrl(PRODUCTION_URL)).toBe(false);
    expect(isLocalFileUrl("postgres://host/db")).toBe(false);
    expect(isLocalFileUrl("https://example.com/db")).toBe(false);
    // Fails closed: an empty target is not proof of a local one.
    expect(isLocalFileUrl("")).toBe(false);
    expect(isLocalFileUrl("   ")).toBe(false);
  });

  it("keeps credentials out of messages", () => {
    expect(redact("libsql://user:secret-token@host.turso.io")).not.toContain("secret-token");
    expect(redact("libsql://user:secret-token@host.turso.io")).toContain("<redacted>");
  });
});

describe("assertLocalDatabase", () => {
  it("allows a local file", () => {
    const resolved = classifyDatabase("file:./content.db", PRODUCTION_URL, [".env.local"]);
    expect(() => assertLocalDatabase(resolved)).not.toThrow();
  });

  it("refuses a remote database and names the offending files", () => {
    const resolved = classifyDatabase(PRODUCTION_URL, null, [".env"]);
    expect(() => assertLocalDatabase(resolved)).toThrow(ProductionDatabaseError);

    try {
      assertLocalDatabase(resolved);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/not a local database/i);
      expect(message).toContain(".env");
      // The message has to tell someone how to fix it, not just that it failed.
      expect(message).toContain("file:./content.db");
    }
  });

  it("refuses a URL matching the deployed production configuration by name", () => {
    const resolved = classifyDatabase(PRODUCTION_URL, PRODUCTION_URL, [".env"]);
    expect(resolved.matchesProductionConfig).toBe(true);
    expect(() => assertLocalDatabase(resolved)).toThrow(/PRODUCTION database/i);
  });

  it("refuses an empty DATABASE_URL rather than assuming a default", () => {
    expect(() => assertLocalDatabase(classifyDatabase("", null, []))).toThrow(
      ProductionDatabaseError
    );
  });
});

describe("resolution matches the dev server", () => {
  it("prefers .env.local over .env, which is the bug that caused the incident", () => {
    // Exactly the real situation: .env points at production, .env.local at a
    // local file. Reading .env alone is what wrote to production.
    writeEnv(".env", `DATABASE_URL=${PRODUCTION_URL}\n`);
    writeEnv(".env.local", "DATABASE_URL=file:./content.db\n");
    writeEnv(".env.vercel.production", `DATABASE_URL=${PRODUCTION_URL}\n`);

    const resolved = resolveDatabase(workspace);

    expect(resolved.url).toBe("file:./content.db");
    expect(resolved.isLocalFile).toBe(true);
    expect(resolved.loadedFiles.some((file) => file.includes(".env.local"))).toBe(true);
    expect(() => assertLocalDatabase(resolved)).not.toThrow();
  });

  it("refuses when no .env.local overrides a production .env", () => {
    writeEnv(".env", `DATABASE_URL=${PRODUCTION_URL}\n`);
    writeEnv(".env.vercel.production", `DATABASE_URL=${PRODUCTION_URL}\n`);

    const resolved = resolveDatabase(workspace);

    expect(resolved.url).toBe(PRODUCTION_URL);
    expect(resolved.matchesProductionConfig).toBe(true);
    expect(() => assertLocalDatabase(resolved)).toThrow(ProductionDatabaseError);
  });

  it("still reads .env.local when NODE_ENV is test", async () => {
    // Next picks its env files from NODE_ENV, and under `test` it skips
    // .env.local and falls through to .env. Since .env holds the production URL
    // on this repository, a seeder run under NODE_ENV=test would otherwise
    // resolve to production while looking entirely normal.
    writeEnv(".env", `DATABASE_URL=${PRODUCTION_URL}\n`);
    writeEnv(".env.local", "DATABASE_URL=file:./content.db\n");

    const previous = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    try {
      await clearAmbientDatabaseUrl();
      const resolved = resolveDatabase(workspace);
      expect(resolved.url).toBe("file:./content.db");
      expect(() => assertLocalDatabase(resolved)).not.toThrow();
    } finally {
      // Restore by deleting when it was absent: assigning undefined to
      // process.env stores the string "undefined".
      if (previous === undefined) delete (process.env as Record<string, unknown>).NODE_ENV;
      else (process.env as Record<string, string | undefined>).NODE_ENV = previous;
    }

    // The runner's own NODE_ENV must be left exactly as it was found.
    expect(process.env.NODE_ENV).toBe(previous);
  });

  it("reads the production URL from the deployed env file, ignoring comments", () => {
    writeEnv(".env.vercel.production", `# DATABASE_URL=decoy\nDATABASE_URL="${PRODUCTION_URL}"\n`);
    expect(readProductionUrl(workspace)).toBe(PRODUCTION_URL);
  });

  it("returns null when there is no deployed env file to compare against", () => {
    expect(readProductionUrl(workspace)).toBeNull();
  });
});

describe("the seed script itself", () => {
  /**
   * The unit tests above prove the decision. This proves the wiring: the real
   * script, run as a real process against a production-pointing config, exits
   * non-zero and writes nothing. A guard that exists but is never called is the
   * failure mode being prevented here.
   */
  it("exits non-zero and touches no database when the config points at production", () => {
    const repo = process.cwd();
    const sandbox = mkdtempSync(join(tmpdir(), "seed-guard-"));
    mkdirSync(join(sandbox, "scripts"), { recursive: true });

    // A production-only config: no .env.local to save it.
    writeFileSync(join(sandbox, ".env"), `DATABASE_URL=${PRODUCTION_URL}\nDATABASE_AUTH_TOKEN=fake\n`);
    writeFileSync(join(sandbox, ".env.vercel.production"), `DATABASE_URL=${PRODUCTION_URL}\n`);

    let stderr = "";
    let exitCode = 0;
    try {
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", join(repo, "scripts/seed-landing-demo.mjs")],
        { cwd: sandbox, encoding: "utf8", stdio: "pipe", timeout: 60000 }
      );
    } catch (error) {
      const failure = error as { status?: number; stderr?: string; stdout?: string };
      exitCode = failure.status ?? 1;
      stderr = `${failure.stderr ?? ""}${failure.stdout ?? ""}`;
    }

    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Refusing to run/i);
    expect(stderr).toMatch(/PRODUCTION database/i);
    // It must fail before announcing a connection, not after opening one.
    expect(stderr).not.toMatch(/local database confirmed/i);
    expect(stderr).not.toMatch(/inserting \d+ events/i);

    rmSync(sandbox, { recursive: true, force: true });
  }, 90000);
});
