import { sql } from "drizzle-orm";

export async function up({ db }: { db: any }) {
  await db.run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`voice_transcription_model\`;`).catch(() => undefined);
  await db.run(
    sql`UPDATE \`optimate_settings\`
        SET \`blog_image_generation_model\` = 'imagen-4.0-fast-generate-001'
        WHERE \`blog_image_generation_model\` IS NULL
          OR TRIM(\`blog_image_generation_model\`) = '';`,
  ).catch(() => undefined);
}

export async function down({ db }: { db: any }) {
  await db.run(sql`ALTER TABLE \`optimate_settings\` ADD \`voice_transcription_model\` text;`).catch(() => undefined);
}
