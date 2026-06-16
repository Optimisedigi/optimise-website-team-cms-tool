import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Stores a list-view snapshot of how many campaigns matched the NKL regex during
 * the last preview. The preview already saves matched campaigns into the hidden
 * `negative_keyword_lists_campaigns` rows; this denormalised count makes it
 * visible/sortable in the Payload collection table.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`negative_keyword_lists\` ADD \`campaign_count\` numeric DEFAULT 0;`)
    .catch(() => undefined);

  await db
    .run(sql`
      UPDATE \`negative_keyword_lists\`
      SET \`campaign_count\` = COALESCE((
        SELECT COUNT(*)
        FROM \`negative_keyword_lists_campaigns\`
        WHERE \`negative_keyword_lists_campaigns\`.\`_parent_id\` = \`negative_keyword_lists\`.\`id\`
      ), 0)
      WHERE COALESCE(TRIM(\`campaign_regex\`), '') != '';
    `)
    .catch(() => undefined);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`negative_keyword_lists\` DROP COLUMN \`campaign_count\`;`)
    .catch(() => undefined);
}
