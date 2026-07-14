import { sql } from "drizzle-orm";

export async function up({ db }: { db: any }) {
  await db.run(sql`ALTER TABLE \`optimate_settings\` ADD \`search_term_research_model\` text;`).catch(() => undefined);
  await db.run(sql`ALTER TABLE \`optimate_settings\` ADD \`negative_sweep_model\` text;`).catch(() => undefined);
  await db.run(sql`ALTER TABLE \`optimate_settings\` ADD \`voice_transcription_model\` text;`).catch(() => undefined);
  await db.run(sql`ALTER TABLE \`optimate_settings\` ADD \`blog_image_generation_model\` text;`).catch(() => undefined);
}

export async function down({ db }: { db: any }) {
  await db.run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`search_term_research_model\`;`).catch(() => undefined);
  await db.run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`negative_sweep_model\`;`).catch(() => undefined);
  await db.run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`voice_transcription_model\`;`).catch(() => undefined);
  await db.run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`blog_image_generation_model\`;`).catch(() => undefined);
}
