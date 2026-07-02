import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const execute = vi.fn();
const payloadUpdate = vi.fn();
const sqlExecute = vi.fn();
const runMigrations = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(() =>
    Promise.resolve({
      db: { client: { execute } },
      update: payloadUpdate,
    }),
  ),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("@payload-config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("@/lib/run-migrations", () => ({
  runMigrations: (...args: unknown[]) => runMigrations(...args),
}));

vi.mock("@libsql/client", () => ({
  createClient: vi.fn(() => ({ execute: sqlExecute })),
}));

function request(path: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(`https://cms.test${path}`, init);
}

async function jsonOf(response: Response): Promise<unknown> {
  return response.json();
}

function expectNoSecretLeak(body: unknown): void {
  const text = JSON.stringify(body);
  expect(text).not.toContain("super-secret-key");
  expect(text).not.toContain("db-auth-token");
  expect(text).not.toContain("DATABASE_AUTH_TOKEN");
  expect(text).not.toContain("AUDIT_API_KEY");
}

describe("admin/internal migration endpoints regression", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.AUDIT_API_KEY = "super-secret-key";
    process.env.DATABASE_URL = "libsql://example.turso.io";
    process.env.DATABASE_AUTH_TOKEN = "db-auth-token";
    execute.mockResolvedValue({ rows: [] });
    runMigrations.mockResolvedValue([
      { status: "ok", label: "create contracts" },
      { status: "skip", label: "locked docs", message: "duplicate column" },
      { status: "error", label: "optional index", message: "boom" },
    ]);
  });

  it("rejects migration endpoints without the API key and does not touch Payload", async () => {
    const migrate = await import("@/app/(frontend)/api/migrate/route");
    const schemaMigrate = await import("@/app/(frontend)/api/schema-migrate/route");
    const fixLockedDocs = await import("@/app/(frontend)/api/fix-locked-docs/route");

    const responses = await Promise.all([
      migrate.POST(request("/api/migrate", { method: "POST" })),
      migrate.GET(request("/api/migrate")),
      schemaMigrate.POST(request("/api/schema-migrate", { method: "POST" })),
      schemaMigrate.GET(request("/api/schema-migrate")),
      fixLockedDocs.POST(request("/api/fix-locked-docs", { method: "POST" })),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      const body = await jsonOf(response);
      expect(body).toEqual({ error: "Unauthorized" });
      expectNoSecretLeak(body);
    }
    expect(execute).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it("runs /api/migrate POST idempotently and returns table names without row/secret data", async () => {
    execute.mockImplementation(async (sql: string) => {
      if (sql === "SELECT 1") return { rows: [] };
      if (sql.includes("sqlite_master")) {
        return { rows: [{ name: "clients" }, { name: "payload_locked_documents_rels" }] };
      }
      return { rows: [] };
    });
    const { POST } = await import("@/app/(frontend)/api/migrate/route");

    const response = await POST(
      request("/api/migrate", { method: "POST", headers: { "x-api-key": "super-secret-key" } }),
    );
    const body = (await jsonOf(response)) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dbReachable).toBe(true);
    expect(body.migrationsRun).toEqual([
      "OK: create contracts",
      "SKIP: locked docs (already exists)",
      "ERROR: optional index — boom",
    ]);
    expect(body.tables).toEqual(["clients", "payload_locked_documents_rels"]);
    expect(JSON.stringify(body)).not.toContain("alex@example.com");
    expect(JSON.stringify(body)).not.toContain("PRAGMA");
    expectNoSecretLeak(body);
  });

  it("includes the later monthly-negative schema steps in /api/migrate GET", async () => {
    execute.mockImplementation(async (sql: string) => {
      if (sql.includes("sqlite_master")) return { rows: [{ name: "clients" }, { name: "monthly_keyword_selection_rows" }] };
      return { rows: [] };
    });
    const { GET } = await import("@/app/(frontend)/api/migrate/route");

    const response = await GET(request("/api/migrate", { headers: { "x-api-key": "super-secret-key" } }));
    const body = (await jsonOf(response)) as { migrationsRun?: string[]; tables?: string[] };

    expect(response.status).toBe(200);
    expect(body.migrationsRun?.some((line) => line.startsWith("ERROR:"))).toBe(false);
    expect(body.migrationsRun).toEqual(expect.arrayContaining([
      "OK: clients.gads_auto_monthly_negative_keywords_enabled",
      "OK: monthly_keyword_selection_rows",
      "OK: selection_row_outcome_followups",
    ]));
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("gads_auto_monthly_negative_keywords_enabled"));
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS `monthly_keyword_selection_rows`"));
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS `selection_row_outcome_followups`"));
    expect(body.tables).toEqual(["clients", "monthly_keyword_selection_rows"]);
    expectNoSecretLeak(body);
  });

  it("treats duplicate column errors as safe skips in schema migration GET", async () => {
    execute.mockImplementation(async (sql: string) => {
      if (sql.includes("ADD")) throw new Error("duplicate column name: client_id");
      if (sql.includes("sqlite_master")) return { rows: [{ name: "clients" }] };
      return { rows: [] };
    });
    const { GET } = await import("@/app/(frontend)/api/schema-migrate/route");

    const response = await GET(request("/api/schema-migrate", { headers: { "x-api-key": "super-secret-key" } }));
    const body = (await jsonOf(response)) as { results?: string[] };

    expect(response.status).toBe(200);
    expect(body.results?.some((line) => line.startsWith("SKIP:") && line.includes("already exists"))).toBe(true);
    expectNoSecretLeak(body);
  });

  it("keeps locked-doc repair additive and reports duplicate repairs as skips", async () => {
    execute.mockImplementation(async (sql: string) => {
      expect(sql.toUpperCase()).not.toContain("DROP TABLE");
      expect(sql.toUpperCase()).not.toContain("DELETE FROM");
      if (sql.includes("ADD COLUMN google_ads_campaign_budgets_id")) {
        throw new Error("duplicate column name: google_ads_campaign_budgets_id");
      }
      return { rows: [] };
    });
    const { POST } = await import("@/app/(frontend)/api/fix-locked-docs/route");

    const response = await POST(
      request("/api/fix-locked-docs", { method: "POST", headers: { "x-api-key": "super-secret-key" } }),
    );
    const body = (await jsonOf(response)) as { success?: boolean; results?: string[] };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results?.[0]).toContain("SKIP:");
    expect(execute).toHaveBeenCalled();
    expectNoSecretLeak(body);
  });

  it("guards unlock-user by API key and uses parameterized SQL fallback without leaking secrets", async () => {
    const { POST } = await import("@/app/(frontend)/api/unlock-user/route");

    const unauthorized = await POST(request("/api/unlock-user", { method: "POST" }));
    expect(unauthorized.status).toBe(401);
    expectNoSecretLeak(await jsonOf(unauthorized));

    payloadUpdate.mockRejectedValueOnce(new Error("no such column: payload_locked_documents_rels.users_id"));
    sqlExecute
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await POST(
      request("/api/unlock-user", {
        method: "POST",
        headers: { "x-api-key": "super-secret-key", "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com" }),
      }),
    );
    const body = await jsonOf(response);

    expect(response.status).toBe(200);
    expect(sqlExecute).toHaveBeenNthCalledWith(1, {
      sql: "SELECT id FROM users WHERE email = ?",
      args: ["admin@example.com"],
    });
    expect(sqlExecute).toHaveBeenNthCalledWith(2, {
      sql: "UPDATE users SET failed_login_count = 0 WHERE id = ?",
      args: ["42"],
    });
    expectNoSecretLeak(body);
  });
});
