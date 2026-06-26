import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function tryRun(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch {
    // Column/index already exists or the optional Payload table is not present in this environment.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "client_proposal_keyword_research_jobs" (
      "id" integer PRIMARY KEY NOT NULL,
      "status" text DEFAULT 'running' NOT NULL,
      "completed_at" text,
      "result" text,
      "error" text,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    );
  `))

  await tryRun(db, 'ALTER TABLE `client_proposal_keyword_research_jobs` ADD `status` text DEFAULT \'running\' NOT NULL')
  await tryRun(db, 'ALTER TABLE `client_proposal_keyword_research_jobs` ADD `completed_at` text')
  await tryRun(db, 'ALTER TABLE `client_proposal_keyword_research_jobs` ADD `result` text')
  await tryRun(db, 'ALTER TABLE `client_proposal_keyword_research_jobs` ADD `error` text')
  await tryRun(db, 'ALTER TABLE `client_proposal_keyword_research_jobs` ADD `updated_at` text')
  await tryRun(db, 'ALTER TABLE `client_proposal_keyword_research_jobs` ADD `created_at` text')

  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_proposal_keyword_research_jobs_status_idx` ON `client_proposal_keyword_research_jobs` (`status`)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_proposal_keyword_research_jobs_updated_at_idx` ON `client_proposal_keyword_research_jobs` (`updated_at`)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_proposal_keyword_research_jobs_created_at_idx` ON `client_proposal_keyword_research_jobs` (`created_at`)'))

  await tryRun(
    db,
    'ALTER TABLE `payload_locked_documents_rels` ADD `client_proposal_keyword_research_jobs_id` integer REFERENCES `client_proposal_keyword_research_jobs`(`id`) ON UPDATE no action ON DELETE cascade;',
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP TABLE IF EXISTS `client_proposal_keyword_research_jobs`;'))
}
