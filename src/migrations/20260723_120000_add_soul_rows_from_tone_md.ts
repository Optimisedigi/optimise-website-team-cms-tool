import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Moves the unique guidance from src/lib/agents/_shared/tone-of-voice.md into
 * agent_soul so soul is the single source of truth. Only rows NOT already
 * covered by existing soul aspects are added (no duplicate dash/tone/plain-
 * English rules). `aspect` is uniquely indexed, so INSERT OR IGNORE keeps this
 * safe to re-run.
 *
 *   - spelling        (all)        Australian English.
 *   - punctuation     (all)        No smart/curly quotes (dashes already in `formatting`).
 *   - data-integrity  (all)        Only use provided data; respect labelled date ranges.
 *   - google-ads-jargon (google-ads) Ban Google Ads jargon unless defined inline.
 *
 * Also cleans the existing `google-ads-summary-tone` row, which contained en
 * dashes and curly quotes that conflict with the absolute no-dash `formatting`
 * rule.
 */

const ROWS: Array<{ aspect: string; content: string; appliesTo: string }> = [
  {
    aspect: 'spelling',
    appliesTo: 'all',
    content:
      'Use Australian English spelling everywhere: optimisation, behaviour, colour, organisation, analyse. Never use American variants.',
  },
  {
    aspect: 'punctuation',
    appliesTo: 'all',
    content:
      'Use straight quotes only, never smart or curly quotes. Use straight apostrophes. This sits alongside the absolute no en/em dash rule in formatting.',
  },
  {
    aspect: 'data-integrity',
    appliesTo: 'all',
    content:
      'Only use data explicitly provided. Never extrapolate, estimate, or infer numbers for date ranges not covered by the data. Each data section is labelled with its exact date range; if asked about a period not covered, say you do not have data for that period rather than substituting another period. Never present a monthly total as if it represents a shorter period within that month. When a custom range is provided, use only those numbers for that comparison.',
  },
  {
    aspect: 'google-ads-jargon',
    appliesTo: 'google-ads',
    content:
      'In client-facing Google Ads text, avoid technical jargon unless you define it in the same sentence. Do not use raw terms like GCLID, google/cpc, MoM, attribution gap, or impression share without a plain-English explanation beside them.',
  },
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const row of ROWS) {
    try {
      await db.run(sql`
        INSERT OR IGNORE INTO \`agent_soul\` (\`aspect\`, \`content\`, \`applies_to\`)
        VALUES (${row.aspect}, ${row.content}, ${row.appliesTo});
      `)
    } catch {
      /* aspect already present */
    }
  }

  // Clean the existing google-ads-summary-tone row: replace en dashes and curly
  // quotes with dash/quote-safe equivalents so it stops conflicting with the
  // absolute no-dash formatting rule.
  try {
    await db.run(sql`
      UPDATE \`agent_soul\`
      SET \`content\` = 'For Google Ads client summaries, write in a casual but professional, story-led style. Keep it short and clear: main story first, key numbers only where useful, then the bigger-picture takeaway. Avoid dense report language, over-analysis, or listing every metric. Use plain phrases like "started well", "slowed down", "early signs are stronger", and "if this pace continues". Aim for 2 to 3 short paragraphs.',
      \`updated_at\` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE \`aspect\` = 'google-ads-summary-tone';
    `)
  } catch {
    /* row may not exist on fresh installs */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const row of ROWS) {
    try {
      await db.run(sql`DELETE FROM \`agent_soul\` WHERE \`aspect\` = ${row.aspect};`)
    } catch {
      /* ignore */
    }
  }
}
