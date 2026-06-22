import { sql } from "drizzle-orm";

export async function up({ db }: { db: any }) {
  await db.run(sql`ALTER TABLE \`optimate_settings\` ADD \`email_assistant_model\` text;`).catch(() => undefined);
}

export async function down({ db }: { db: any }) {
  await db.run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`email_assistant_model\`;`).catch(() => undefined);
}
