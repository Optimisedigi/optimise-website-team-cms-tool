import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds review/usage metadata to agent_memory so OptiMate memories can stay
 * search-only by default and be periodically audited for token bloat/staleness.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns: Array<{ name: string; type: "text" | "integer" }> = [
    { name: "status", type: "text" },
    { name: "confidence", type: "integer" },
    { name: "source", type: "text" },
    { name: "use_count", type: "integer" },
    { name: "last_matched_query", type: "text" },
    { name: "review_after", type: "text" },
    { name: "expires_at", type: "text" },
  ];

  for (const column of columns) {
    try {
      await db.run(
        sql.raw(`ALTER TABLE \`agent_memory\` ADD \`${column.name}\` ${column.type};`),
      );
    } catch {
      // Column may already exist on freshly-pushed dev databases.
    }
  }

  await db.run(sql`UPDATE \`agent_memory\` SET \`status\` = 'active' WHERE \`status\` IS NULL;`);
  await db.run(sql`UPDATE \`agent_memory\` SET \`confidence\` = 80 WHERE \`confidence\` IS NULL;`);
  await db.run(sql`UPDATE \`agent_memory\` SET \`source\` = 'agent-inferred' WHERE \`source\` IS NULL;`);
  await db.run(sql`UPDATE \`agent_memory\` SET \`use_count\` = 0 WHERE \`use_count\` IS NULL;`);

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`agent_memory_status_idx\` ON \`agent_memory\` (\`status\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`agent_memory_review_after_idx\` ON \`agent_memory\` (\`review_after\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`agent_memory_expires_at_idx\` ON \`agent_memory\` (\`expires_at\`);`);
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: SQLite column drops require table rebuilds, and nullable review
  // metadata is harmless to keep on rollback.
}
