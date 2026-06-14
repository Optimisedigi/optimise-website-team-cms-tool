import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    out[key.trim()] = value;
  }
  return out;
}

const prodEnv = loadEnvFile(path.resolve(".env.vercel"));
const prodUrl = prodEnv.DATABASE_URL;
const prodAuthToken = prodEnv.DATABASE_AUTH_TOKEN;

if (!prodUrl || prodUrl.startsWith("file:")) {
  throw new Error(".env.vercel DATABASE_URL is missing or is not a remote libSQL URL");
}

const prod = createClient({ url: prodUrl, authToken: prodAuthToken });
const local = createClient({ url: "file:./content.db" });

type DbValue = string | number | null;

async function ensureAgentMemorySchema(): Promise<void> {
  const columns = [
    ["status", "text"],
    ["confidence", "integer"],
    ["source", "text"],
    ["use_count", "integer"],
    ["last_matched_query", "text"],
    ["review_after", "text"],
    ["expires_at", "text"],
  ] as const;

  const existing = await local.execute("PRAGMA table_info(agent_memory)");
  const names = new Set(existing.rows.map((row) => String(row.name)));
  for (const [name, type] of columns) {
    if (!names.has(name)) {
      await local.execute(`ALTER TABLE agent_memory ADD ${name} ${type}`);
    }
  }
  await local.execute("UPDATE agent_memory SET status = 'active' WHERE status IS NULL");
  await local.execute("UPDATE agent_memory SET confidence = 80 WHERE confidence IS NULL");
  await local.execute("UPDATE agent_memory SET source = 'agent-inferred' WHERE source IS NULL");
  await local.execute("UPDATE agent_memory SET use_count = 0 WHERE use_count IS NULL");
  await local.execute("CREATE INDEX IF NOT EXISTS agent_memory_status_idx ON agent_memory (status)");
  await local.execute("CREATE INDEX IF NOT EXISTS agent_memory_review_after_idx ON agent_memory (review_after)");
  await local.execute("CREATE INDEX IF NOT EXISTS agent_memory_expires_at_idx ON agent_memory (expires_at)");
}

async function ensureAgentSoulSchema(): Promise<void> {
  const existing = await local.execute("PRAGMA table_info(agent_soul)");
  const names = new Set(existing.rows.map((row) => String(row.name)));
  if (!names.has("applies_to")) {
    await local.execute("ALTER TABLE agent_soul ADD applies_to text DEFAULT 'all'");
  }
  await local.execute("CREATE INDEX IF NOT EXISTS agent_soul_applies_to_idx ON agent_soul (applies_to)");
}

async function prodHasAgentSoulAppliesTo(): Promise<boolean> {
  const existing = await prod.execute("PRAGMA table_info(agent_soul)");
  return existing.rows.some((row) => String(row.name) === "applies_to");
}

function inferSoulAppliesTo(aspect: unknown, explicit: unknown): string {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const key = String(aspect ?? "").toLowerCase();
  if (key.startsWith("google-ads-")) return "google-ads";
  if (key.startsWith("email-")) return "email";
  if (key.startsWith("invoice-") || key.startsWith("invoicemate-") || key.startsWith("xero-")) return "invoice";
  return "all";
}

async function copyAgentSoul(): Promise<number> {
  await ensureAgentSoulSchema();
  const hasAppliesTo = await prodHasAgentSoulAppliesTo();
  const rows = await prod.execute(`SELECT id, aspect, content, updated_at, created_at${hasAppliesTo ? ", applies_to" : ""} FROM agent_soul ORDER BY id`);
  for (const row of rows.rows) {
    await local.execute({
      sql: `INSERT INTO agent_soul (id, aspect, content, applies_to, updated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              aspect = excluded.aspect,
              content = excluded.content,
              applies_to = excluded.applies_to,
              updated_at = excluded.updated_at,
              created_at = excluded.created_at`,
      args: [row.id, row.aspect, row.content, inferSoulAppliesTo(row.aspect, row.applies_to), row.updated_at, row.created_at] as DbValue[],
    });
  }
  return rows.rows.length;
}

async function copyAgentMemory(): Promise<number> {
  const rows = await prod.execute(`
    SELECT id, scope, client_id, category, subject, content, importance,
           last_accessed_at, created_by_id, agent_run_id, updated_at, created_at,
           status, confidence, source, use_count, last_matched_query, review_after, expires_at
    FROM agent_memory
    ORDER BY id
  `);
  for (const row of rows.rows) {
    await local.execute({
      sql: `INSERT INTO agent_memory (
              id, scope, client_id, category, subject, content, importance,
              last_accessed_at, created_by_id, agent_run_id, updated_at, created_at,
              status, confidence, source, use_count, last_matched_query, review_after, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              scope = excluded.scope,
              client_id = excluded.client_id,
              category = excluded.category,
              subject = excluded.subject,
              content = excluded.content,
              importance = excluded.importance,
              last_accessed_at = excluded.last_accessed_at,
              created_by_id = excluded.created_by_id,
              agent_run_id = excluded.agent_run_id,
              updated_at = excluded.updated_at,
              created_at = excluded.created_at,
              status = excluded.status,
              confidence = excluded.confidence,
              source = excluded.source,
              use_count = excluded.use_count,
              last_matched_query = excluded.last_matched_query,
              review_after = excluded.review_after,
              expires_at = excluded.expires_at`,
      args: [
        row.id,
        row.scope,
        row.client_id,
        row.category,
        row.subject,
        row.content,
        row.importance,
        row.last_accessed_at,
        row.created_by_id,
        row.agent_run_id,
        row.updated_at,
        row.created_at,
        row.status,
        row.confidence,
        row.source,
        row.use_count,
        row.last_matched_query,
        row.review_after,
        row.expires_at,
      ] as DbValue[],
    });
  }
  return rows.rows.length;
}

async function main(): Promise<void> {
  await ensureAgentMemorySchema();
  const soul = await copyAgentSoul();
  const memory = await copyAgentMemory();
  const localCounts = await local.execute("SELECT 'agent_soul' AS table_name, COUNT(*) AS count FROM agent_soul UNION ALL SELECT 'agent_memory', COUNT(*) FROM agent_memory");
  console.log(`Copied ${soul} agent_soul rows and ${memory} agent_memory rows from prod into local content.db.`);
  for (const row of localCounts.rows) console.log(`${row.table_name}: ${row.count}`);
}

main().finally(async () => {
  prod.close();
  local.close();
});
