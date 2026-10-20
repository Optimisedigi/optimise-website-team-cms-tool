/**
 * Preview-then-apply ledger for live Google Ads changes made through OptiMate.
 *
 * The agent never changes a Google Ads account itself. `execute_google_ads_action`
 * stores the exact Growth Tools request here as a pending preview, and only a
 * signed-in admin tapping "Apply live" on that preview sends it. What is sent is
 * the stored request, so nothing the model says after the preview can alter it.
 *
 * Raw SQL (not the Payload local API) so the pending -> applying claim is one
 * conditional UPDATE: two taps, two tabs or a voice and a text session can never
 * both send the same change.
 */
import { sql } from "@payloadcms/db-sqlite";
import type { Payload } from "payload";
import type { GrowthToolsMethod, GrowthToolsResult } from "./tools/_growth-tools";

/** How long a preview can be applied for. Older previews must be prepared again. */
export const CHANGE_PREVIEW_TTL_MS = 60 * 60 * 1000;

export type ChangePreviewStatus = "pending" | "applying" | "applied" | "failed" | "cancelled";

type SqlResult = { rows?: unknown[]; rowsAffected?: number };
export type ChangePreviewDb = { run: (query: ReturnType<typeof sql>) => Promise<SqlResult> };

export function changePreviewDb(payload: Payload): ChangePreviewDb {
  return payload.db.drizzle as unknown as ChangePreviewDb;
}

/** Request metadata and flags the tools add; hidden from the change card. */
const METADATA_KEYS = new Set([
  "customerId",
  "validateOnly",
  "confirm",
  "action",
  "summary",
  "agentRunId",
  "clientId",
  "auditId",
  "userId",
  "source",
]);

export interface ChangePreviewSummary {
  id: number;
  status: ChangePreviewStatus;
  action: string;
  /** The agent's own description. Shown labelled as such; `details` is what is sent. */
  summary: string;
  /** Request fields that will be sent, excluding logging metadata. */
  details: Record<string, unknown>;
  expiresAt: string;
}

export type ApplyOutcome =
  | { status: "applied"; result: unknown }
  | { status: "failed"; error: string }
  | { status: "unavailable"; reason: string };

export interface ApplyDeps {
  now: () => Date;
  send: (request: {
    method: GrowthToolsMethod;
    path: string;
    body?: Record<string, unknown>;
  }) => Promise<GrowthToolsResult<unknown>>;
}

function rowsOf(result: SqlResult): Array<Record<string, unknown>> {
  return (result.rows ?? []) as Array<Record<string, unknown>>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseBody(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function isMethod(value: string): value is GrowthToolsMethod {
  return value === "GET" || value === "POST" || value === "PUT" || value === "PATCH" || value === "DELETE";
}

function toSummary(row: Record<string, unknown>): ChangePreviewSummary {
  const body = parseBody(row.request_body) ?? {};
  const details = Object.fromEntries(
    Object.entries(body)
      .filter(([key]) => !METADATA_KEYS.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    id: Number(row.id),
    status: text(row.status) as ChangePreviewStatus,
    action: text(row.action),
    summary: text(row.summary),
    details,
    expiresAt: text(row.expires_at),
  };
}

export async function createChangePreview(
  db: ChangePreviewDb,
  input: {
    ownerId: number;
    customerId: string;
    auditId?: number;
    clientId?: number;
    agentRunId: string;
    action: string;
    method: GrowthToolsMethod;
    path: string;
    requestBody?: Record<string, unknown>;
    summary?: string;
    now: Date;
  },
): Promise<{ id: number; expiresAt: string }> {
  const expiresAt = new Date(input.now.getTime() + CHANGE_PREVIEW_TTL_MS).toISOString();
  const at = input.now.toISOString();
  const result = await db.run(
    sql`insert into google_ads_change_previews
          (owner_id, status, customer_id, audit_id, client_id, agent_run_id, action, method, path,
           request_body, summary, expires_at, updated_at, created_at)
        values (${input.ownerId}, 'pending', ${input.customerId}, ${input.auditId ?? null}, ${input.clientId ?? null},
                ${input.agentRunId}, ${input.action}, ${input.method}, ${input.path},
                ${input.requestBody ? JSON.stringify(input.requestBody) : null}, ${input.summary ?? null},
                ${expiresAt}, ${at}, ${at})
        returning id`,
  );
  return { id: Number(rowsOf(result)[0]?.id), expiresAt };
}

/** Previews one chat run created for this user, oldest first, for the change cards. */
export async function listChangePreviewsForRun(
  db: ChangePreviewDb,
  agentRunId: string,
  ownerId: number,
): Promise<ChangePreviewSummary[]> {
  const result = await db.run(
    sql`select id, status, action, summary, request_body, expires_at
        from google_ads_change_previews
        where agent_run_id = ${agentRunId} and owner_id = ${ownerId}
        order by id asc
        limit 20`,
  );
  return rowsOf(result).map(toSummary);
}

async function explainUnavailable(db: ChangePreviewDb, id: number, ownerId: number, now: Date): Promise<string> {
  const row = rowsOf(
    await db.run(
      sql`select status, expires_at from google_ads_change_previews where id = ${id} and owner_id = ${ownerId}`,
    ),
  )[0];
  if (!row) return "This change was not found.";
  const status = text(row.status);
  if (status === "applied") return "This change was already applied.";
  if (status === "applying") return "This change is already being applied.";
  if (status === "cancelled") return "This change was cancelled.";
  if (status === "failed") return "This change already failed. Ask OptiMate to prepare it again.";
  if (text(row.expires_at) <= now.toISOString()) return "This preview expired. Ask OptiMate to prepare the change again.";
  return "This change can no longer be applied.";
}

/**
 * Claim a pending, unexpired preview owned by `ownerId`, send its stored
 * request once, and record the result.
 */
export async function applyChangePreview(
  db: ChangePreviewDb,
  id: number,
  ownerId: number,
  deps: ApplyDeps,
): Promise<ApplyOutcome> {
  const now = deps.now();
  const at = now.toISOString();
  const claimed = rowsOf(
    await db.run(
      sql`update google_ads_change_previews
          set status = 'applying', updated_at = ${at}
          where id = ${id} and owner_id = ${ownerId} and status = 'pending' and expires_at > ${at}
          returning method, path, request_body`,
    ),
  )[0];
  if (!claimed) return { status: "unavailable", reason: await explainUnavailable(db, id, ownerId, now) };

  const method = text(claimed.method);
  const path = text(claimed.path);
  const finishedAt = () => deps.now().toISOString();
  if (!isMethod(method) || !path.startsWith("/api/google-ads/")) {
    const error = "The stored change is invalid and was not sent.";
    await db.run(
      sql`update google_ads_change_previews set status = 'failed', last_error = ${error}, updated_at = ${finishedAt()} where id = ${id}`,
    );
    return { status: "failed", error };
  }

  const body = method === "GET" ? undefined : parseBody(claimed.request_body);
  let response: GrowthToolsResult<unknown>;
  try {
    response = await deps.send({ method, path, ...(body ? { body } : {}) });
  } catch (err) {
    response = { ok: false, error: err instanceof Error ? err.message : "Growth Tools request failed" };
  }

  if (response.ok) {
    await db.run(
      sql`update google_ads_change_previews
          set status = 'applied', applied_at = ${finishedAt()}, result = ${JSON.stringify(response.data ?? null)},
              updated_at = ${finishedAt()}
          where id = ${id}`,
    );
    return { status: "applied", result: response.data ?? null };
  }
  const error = response.error || "Growth Tools request failed";
  await db.run(
    sql`update google_ads_change_previews set status = 'failed', last_error = ${error}, updated_at = ${finishedAt()} where id = ${id}`,
  );
  return { status: "failed", error };
}

/** Cancel a pending preview. False when it is not this user's or no longer pending. */
export async function cancelChangePreview(
  db: ChangePreviewDb,
  id: number,
  ownerId: number,
  now: Date,
): Promise<boolean> {
  const result = await db.run(
    sql`update google_ads_change_previews set status = 'cancelled', updated_at = ${now.toISOString()}
        where id = ${id} and owner_id = ${ownerId} and status = 'pending'`,
  );
  return Number(result.rowsAffected ?? 0) > 0;
}
