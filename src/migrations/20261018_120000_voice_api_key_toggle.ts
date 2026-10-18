import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

// "Use OpenAI API key for voice" toggle in OptiMate Settings. Additive only and
// off by default, so every voice call stays on the ChatGPT plan until an admin
// turns it on. Keep in sync with addOptiMateVoiceApiKeyToggle() in
// src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw('ALTER TABLE `optimate_settings` ADD `voice_api_key_enabled` integer DEFAULT false'))
  } catch (error) {
    // Local databases may already have this via schema push.
    if (error instanceof Error && /duplicate column name|already exists/i.test(error.message)) return
    throw error
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so the saved choice is not lost.
}
