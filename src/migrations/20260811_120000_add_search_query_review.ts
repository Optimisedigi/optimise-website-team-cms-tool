import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-sqlite";
import { sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`CREATE TABLE search_query_vocabulary (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, client_id integer NOT NULL, phrase text NOT NULL, normalized_phrase text NOT NULL, classification text NOT NULL, scope text NOT NULL, source text NOT NULL, enabled integer DEFAULT 1, expires_at text, review_note text, audit_decision_trail text, updated_at text NOT NULL, created_at text NOT NULL, FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade);`));
  await db.run(sql.raw(`CREATE UNIQUE INDEX search_query_vocabulary_client_phrase_idx ON search_query_vocabulary (client_id, normalized_phrase);`));
  await db.run(sql.raw(`CREATE TABLE search_query_review_groups (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, snapshot_id integer NOT NULL, client_id integer NOT NULL, fingerprint text NOT NULL, classification_state text NOT NULL DEFAULT 'review', representative_terms text NOT NULL, metrics text NOT NULL, source_rows text NOT NULL, contexts text, rationale text, reviewer_decision text, vocabulary_id integer, updated_at text NOT NULL, created_at text NOT NULL, FOREIGN KEY (snapshot_id) REFERENCES google_ads_audit_snapshots(id) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (vocabulary_id) REFERENCES search_query_vocabulary(id) ON UPDATE no action ON DELETE set null);`));
  await db.run(sql.raw(`CREATE UNIQUE INDEX search_query_review_groups_snapshot_fingerprint_idx ON search_query_review_groups (snapshot_id, fingerprint);`));
  await db.run(sql.raw(`CREATE INDEX search_query_review_groups_client_state_idx ON search_query_review_groups (client_id, classification_state);`));
  await db.run(sql.raw(`CREATE TABLE search_query_review_groups_negative_candidates (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, parent_id integer NOT NULL, negative_sweep_candidates_id integer NOT NULL, "order" integer NOT NULL, FOREIGN KEY (parent_id) REFERENCES search_query_review_groups(id) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (negative_sweep_candidates_id) REFERENCES negative_sweep_candidates(id) ON UPDATE no action ON DELETE cascade);`));
  await db.run(sql.raw(`ALTER TABLE payload_locked_documents_rels ADD COLUMN search_query_vocabulary_id integer REFERENCES search_query_vocabulary(id) ON UPDATE no action ON DELETE cascade;`));
  await db.run(sql.raw(`ALTER TABLE payload_locked_documents_rels ADD COLUMN search_query_review_groups_id integer REFERENCES search_query_review_groups(id) ON UPDATE no action ON DELETE cascade;`));
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw(`DROP TABLE IF EXISTS search_query_review_groups_negative_candidates;`));
  await db.run(sql.raw(`DROP TABLE IF EXISTS search_query_review_groups;`));
  await db.run(sql.raw(`DROP TABLE IF EXISTS search_query_vocabulary;`));
}
