import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS shared_working_docs (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      slug text NOT NULL,
      title text NOT NULL,
      client_slug text NOT NULL,
      deck_slug text NOT NULL,
      content_markdown text NOT NULL,
      last_edited_by text,
      last_saved_at text,
      updated_at text,
      created_at text DEFAULT (datetime('now'))
    );
  `))
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS shared_working_docs_slug_idx ON shared_working_docs (slug);`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS shared_working_docs_client_slug_idx ON shared_working_docs (client_slug);`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS shared_working_docs_deck_slug_idx ON shared_working_docs (deck_slug);`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS shared_working_docs_updated_at_idx ON shared_working_docs (updated_at);`))

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS shared_working_docs_change_log (
      _order integer NOT NULL,
      _parent_id integer NOT NULL,
      id text PRIMARY KEY NOT NULL,
      saved_at text NOT NULL,
      saved_by text,
      summary text,
      FOREIGN KEY (_parent_id) REFERENCES shared_working_docs(id) ON UPDATE no action ON DELETE cascade
    );
  `))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS shared_working_docs_change_log_order_idx ON shared_working_docs_change_log (_order);`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS shared_working_docs_change_log_parent_id_idx ON shared_working_docs_change_log (_parent_id);`))
  await db.run(sql.raw(`ALTER TABLE payload_locked_documents_rels ADD shared_working_docs_id integer REFERENCES shared_working_docs(id) ON DELETE cascade;`))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw(`ALTER TABLE payload_locked_documents_rels DROP COLUMN shared_working_docs_id;`))
  await db.run(sql.raw(`DROP TABLE IF EXISTS shared_working_docs_change_log;`))
  await db.run(sql.raw(`DROP TABLE IF EXISTS shared_working_docs;`))
}
