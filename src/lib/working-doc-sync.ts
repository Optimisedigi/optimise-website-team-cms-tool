import { createHash, randomUUID } from "node:crypto";

import { createClient, type Client, type Transaction } from "@libsql/client";

export const MAX_WORKING_DOC_BYTES = 2_000_000;
export const LEGACY_HANDOFF_ENV = "WORKING_DOC_LEGACY_HANDOFF_ENABLED";

export type WorkingDocSaveSource =
  | "public-editor"
  | "cms-editor"
  | "legacy-handoff"
  | "migration-seed";

export type WorkingDocState = {
  id: number;
  slug: string;
  title: string;
  contentMarkdown: string;
  contentHash: string;
  revision: number;
  lastEditedBy: string | null;
  lastSavedAt: string | null;
  updatedAt: string | null;
};

export type WorkingDocSaveResult =
  | { ok: true; doc: WorkingDocState; source: WorkingDocSaveSource }
  | { ok: false; conflict: true; doc: WorkingDocState; localSubmissionId: string };

type DatabaseExecutor = Pick<Client, "execute"> | Pick<Transaction, "execute">;

export class WorkingDocValidationError extends Error {
  readonly status = 400;
}

export function hashWorkingDocContent(contentMarkdown: string): string {
  return createHash("sha256").update(contentMarkdown, "utf8").digest("hex");
}

function requiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new WorkingDocValidationError(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new WorkingDocValidationError(`${label} is too long.`);
  }
  return normalized;
}

function validateSlug(slug: string): string {
  const safeSlug = requiredText(slug, "Document slug", 240);
  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(safeSlug) || !safeSlug.includes("/")) {
    throw new WorkingDocValidationError("Document slug is invalid.");
  }
  return safeSlug;
}

function validateMarkdown(contentMarkdown: string): void {
  if (!contentMarkdown.trim()) {
    throw new WorkingDocValidationError("Document content is required.");
  }
  if (Buffer.byteLength(contentMarkdown, "utf8") > MAX_WORKING_DOC_BYTES) {
    throw new WorkingDocValidationError("Document content is too large.");
  }
}

function isDatabaseBusy(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "SQLITE_BUSY",
  );
}

async function beginWriteTransaction(client: Client): Promise<Transaction> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.transaction("write");
    } catch (error) {
      if (!isDatabaseBusy(error) || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }
}

function databaseClient(): Client {
  return createClient({
    url: process.env.DATABASE_URL || "file:./content.db",
    ...(process.env.DATABASE_AUTH_TOKEN
      ? { authToken: process.env.DATABASE_AUTH_TOKEN }
      : {}),
  });
}

function rowValue(row: Record<string, unknown>, snake: string, camel: string): unknown {
  return row[snake] ?? row[camel];
}

function stateFromRow(row: Record<string, unknown>): WorkingDocState {
  const contentMarkdown = String(rowValue(row, "content_markdown", "contentMarkdown") ?? "");
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    contentMarkdown,
    contentHash: hashWorkingDocContent(contentMarkdown),
    revision: Number(row.revision),
    lastEditedBy: rowValue(row, "last_edited_by", "lastEditedBy")
      ? String(rowValue(row, "last_edited_by", "lastEditedBy"))
      : null,
    lastSavedAt: rowValue(row, "last_saved_at", "lastSavedAt")
      ? String(rowValue(row, "last_saved_at", "lastSavedAt"))
      : null,
    updatedAt: rowValue(row, "updated_at", "updatedAt")
      ? String(rowValue(row, "updated_at", "updatedAt"))
      : null,
  };
}

async function selectBySlug(
  executor: DatabaseExecutor,
  slug: string,
): Promise<WorkingDocState | null> {
  const result = await executor.execute({
    sql: `SELECT id, slug, title, content_markdown, revision, last_edited_by, last_saved_at, updated_at
          FROM shared_working_docs WHERE slug = ? LIMIT 1`,
    args: [slug],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? stateFromRow(row) : null;
}

async function ensureSnapshot(
  transaction: Transaction,
  doc: WorkingDocState,
  savedBy: string,
  savedAt: string,
  source: WorkingDocSaveSource,
): Promise<void> {
  await transaction.execute({
    sql: `INSERT OR IGNORE INTO shared_working_doc_revisions
      (working_doc_id, revision, content_markdown, content_hash, saved_by, saved_at, source, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      doc.id,
      doc.revision,
      doc.contentMarkdown,
      doc.contentHash,
      savedBy,
      savedAt,
      source,
      savedAt,
      savedAt,
    ],
  });
}

export async function loadWorkingDoc(options: {
  slug: string;
  seed?: { title: string; clientSlug: string; deckSlug: string; contentMarkdown: string };
  client?: Client;
}): Promise<WorkingDocState> {
  const { slug, seed } = options;
  const client = options.client ?? databaseClient();
  const safeSlug = validateSlug(slug);
  try {
    const existing = await selectBySlug(client, safeSlug);
    if (existing) return existing;
    if (!seed) throw new WorkingDocValidationError("Working document was not found.");
    validateMarkdown(seed.contentMarkdown);

    const transaction = await beginWriteTransaction(client);
    try {
      const concurrent = await selectBySlug(transaction, safeSlug);
      if (concurrent) {
        await transaction.commit();
        return concurrent;
      }
      const now = new Date().toISOString();
      await transaction.execute({
        sql: `INSERT INTO shared_working_docs
          (slug, title, client_slug, deck_slug, content_markdown, revision, last_edited_by, last_saved_at, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, 1, 'Seed', ?, ?, ?)`,
        args: [
          safeSlug,
          requiredText(seed.title, "Document title", 240),
          requiredText(seed.clientSlug, "Client slug", 120),
          requiredText(seed.deckSlug, "Document name", 120),
          seed.contentMarkdown,
          now,
          now,
          now,
        ],
      });
      const created = await selectBySlug(transaction, safeSlug);
      if (!created) throw new Error("Working document creation did not return a row.");
      await ensureSnapshot(transaction, created, "Seed", now, "migration-seed");
      await transaction.execute({
        sql: `INSERT INTO shared_working_docs_change_log (_order, _parent_id, id, saved_at, saved_by, summary)
              VALUES (1, ?, ?, ?, 'Seed', 'Initial working document created from approved journey review.')`,
        args: [created.id, randomUUID(), now],
      });
      await transaction.commit();
      return created;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  } finally {
    if (!options.client) client.close();
  }
}

export async function saveWorkingDoc(options: {
  slug: string;
  contentMarkdown: string;
  savedBy: string;
  baseRevision?: number;
  localSubmissionId: string;
  source: Exclude<WorkingDocSaveSource, "legacy-handoff" | "migration-seed">;
  legacyHandoffEnabled?: boolean;
  client?: Client;
  now?: Date;
}): Promise<WorkingDocSaveResult> {
  const {
    slug,
    contentMarkdown,
    savedBy,
    baseRevision,
    localSubmissionId,
    source,
  } = options;
  const legacyHandoffEnabled =
    options.legacyHandoffEnabled ?? process.env[LEGACY_HANDOFF_ENV] === "1";
  const client = options.client ?? databaseClient();
  const now = options.now ?? new Date();
  const safeSlug = validateSlug(slug);
  const safeSavedBy = requiredText(savedBy, "Reviewer name", 160);
  const safeSubmissionId = requiredText(localSubmissionId, "Submission identifier", 160);
  validateMarkdown(contentMarkdown);
  if (baseRevision !== undefined && (!Number.isInteger(baseRevision) || baseRevision < 1)) {
    throw new WorkingDocValidationError("Base revision must be a positive integer.");
  }
  if (baseRevision === undefined && !legacyHandoffEnabled) {
    throw new WorkingDocValidationError("Base revision is required. Reload the shared document.");
  }

  const acceptedSource: WorkingDocSaveSource =
    baseRevision === undefined ? "legacy-handoff" : source;
  const savedAt = now.toISOString();
  try {
    const transaction = await beginWriteTransaction(client);
    try {
      const current = await selectBySlug(transaction, safeSlug);
      if (!current) throw new WorkingDocValidationError("Working document was not found.");
      const expectedRevision = baseRevision ?? current.revision;

      if (baseRevision === undefined) {
        await ensureSnapshot(transaction, current, current.lastEditedBy ?? "Unknown", current.lastSavedAt ?? savedAt, "legacy-handoff");
      }

      const update = await transaction.execute({
        sql: `UPDATE shared_working_docs
              SET content_markdown = ?, revision = revision + 1, last_edited_by = ?, last_saved_at = ?, updated_at = ?
              WHERE id = ? AND revision = ?`,
        args: [contentMarkdown, safeSavedBy, savedAt, savedAt, current.id, expectedRevision],
      });

      if (update.rowsAffected !== 1) {
        const latest = await selectBySlug(transaction, safeSlug);
        if (!latest) throw new Error("Working document disappeared during save.");
        await transaction.rollback();
        return { ok: false, conflict: true, doc: latest, localSubmissionId: safeSubmissionId };
      }

      const updated = await selectBySlug(transaction, safeSlug);
      if (!updated) throw new Error("Accepted working document save could not be read.");
      await ensureSnapshot(transaction, updated, safeSavedBy, savedAt, acceptedSource);
      await transaction.execute({
        sql: `UPDATE shared_working_docs_change_log SET _order = _order + 1 WHERE _parent_id = ?`,
        args: [updated.id],
      });
      await transaction.execute({
        sql: `INSERT INTO shared_working_docs_change_log (_order, _parent_id, id, saved_at, saved_by, summary)
              VALUES (1, ?, ?, ?, ?, ?)`,
        args: [
          updated.id,
          randomUUID(),
          savedAt,
          safeSavedBy,
          acceptedSource === "cms-editor"
            ? "Saved from the client profile Working Docs tab."
            : "Saved document edits and reviewer notes.",
        ],
      });
      await transaction.execute({
        sql: `DELETE FROM shared_working_docs_change_log
              WHERE _parent_id = ? AND _order > 50`,
        args: [updated.id],
      });
      await transaction.commit();
      return { ok: true, doc: updated, source: acceptedSource };
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  } finally {
    if (!options.client) client.close();
  }
}
