import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-sqlite";
import { sql } from "@payloadcms/db-sqlite";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`CREATE TABLE search_query_review_groups_rels (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, "order" integer, parent_id integer NOT NULL, path text NOT NULL, negative_sweep_candidates_id integer, FOREIGN KEY (parent_id) REFERENCES search_query_review_groups(id) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (negative_sweep_candidates_id) REFERENCES negative_sweep_candidates(id) ON UPDATE no action ON DELETE cascade);`));
  await db.run(sql.raw(`CREATE INDEX search_query_review_groups_rels_parent_idx ON search_query_review_groups_rels (parent_id, path);`));
}
export async function down({ db }: MigrateDownArgs): Promise<void> { await db.run(sql.raw(`DROP TABLE IF EXISTS search_query_review_groups_rels;`)); }
