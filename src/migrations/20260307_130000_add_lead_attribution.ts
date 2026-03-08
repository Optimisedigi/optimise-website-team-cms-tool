import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Attribution fields for auto-captured UTM / click ID data
  const columns = [
    { name: 'utm_source', type: 'text' },
    { name: 'utm_medium', type: 'text' },
    { name: 'utm_campaign', type: 'text' },
    { name: 'utm_term', type: 'text' },
    { name: 'gclid', type: 'text' },
    { name: 'fbclid', type: 'text' },
    { name: 'landing_page', type: 'text' },
    { name: 'referrer_url', type: 'text' },
    { name: 'lead_source', type: 'text' },
    { name: 'heard_about', type: 'text' },
  ]

  for (const col of columns) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`sales_leads\` ADD \`${col.name}\` ${col.type};`))
    } catch {
      /* column may already exist */
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const columns = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
    'gclid', 'fbclid', 'landing_page', 'referrer_url',
    'lead_source', 'heard_about',
  ]

  for (const col of columns) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`sales_leads\` DROP COLUMN \`${col}\`;`))
    } catch {
      /* column may not exist */
    }
  }
}
