import { createHash } from "node:crypto";

import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-sqlite";
import { sql } from "@payloadcms/db-sqlite";

export function workingDocContentHash(contentMarkdown: string): string {
  return createHash("sha256").update(contentMarkdown, "utf8").digest("hex");
}

type ExistingWorkingDoc = {
  id: number;
  content_markdown: string;
  last_edited_by: string | null;
  last_saved_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

async function applyWorkingDocRevisionMigration(db: MigrateUpArgs["db"]): Promise<void> {
  await db.run(sql.raw(`ALTER TABLE shared_working_docs ADD COLUMN revision integer NOT NULL DEFAULT 1;`));
  await db.run(sql.raw(`
    CREATE TABLE shared_working_doc_revisions (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      working_doc_id integer NOT NULL,
      revision integer NOT NULL,
      content_markdown text NOT NULL,
      content_hash text NOT NULL,
      saved_by text NOT NULL,
      saved_at text NOT NULL,
      source text NOT NULL,
      updated_at text NOT NULL,
      created_at text NOT NULL,
      FOREIGN KEY (working_doc_id) REFERENCES shared_working_docs(id) ON UPDATE no action ON DELETE cascade
    );
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX shared_working_doc_revisions_doc_revision_idx ON shared_working_doc_revisions (working_doc_id, revision);`));
  await db.run(sql.raw(`CREATE INDEX shared_working_doc_revisions_working_doc_idx ON shared_working_doc_revisions (working_doc_id);`));
  await db.run(sql.raw(`CREATE INDEX shared_working_doc_revisions_content_hash_idx ON shared_working_doc_revisions (content_hash);`));
  await db.run(sql.raw(`CREATE INDEX shared_working_doc_revisions_saved_at_idx ON shared_working_doc_revisions (saved_at);`));

  const docs = await db.all<ExistingWorkingDoc>(sql.raw(`
    SELECT id, content_markdown, last_edited_by, last_saved_at, updated_at, created_at
    FROM shared_working_docs
  `));
  for (const doc of docs) {
    const savedAt = doc.last_saved_at ?? doc.updated_at ?? doc.created_at ?? new Date().toISOString();
    const hash = workingDocContentHash(doc.content_markdown);
    await db.run(sql`
      INSERT INTO shared_working_doc_revisions (
        working_doc_id, revision, content_markdown, content_hash, saved_by, saved_at, source, updated_at, created_at
      ) VALUES (
        ${doc.id}, 1, ${doc.content_markdown}, ${hash}, ${doc.last_edited_by ?? "Migration seed"},
        ${savedAt}, 'migration-seed', ${savedAt}, ${savedAt}
      )
    `);
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.transaction(async (transaction) => {
    await applyWorkingDocRevisionMigration(transaction as unknown as MigrateUpArgs["db"]);
  });
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw(`DROP TABLE IF EXISTS shared_working_doc_revisions;`));
  await db.run(sql.raw(`ALTER TABLE shared_working_docs DROP COLUMN revision;`));
}
