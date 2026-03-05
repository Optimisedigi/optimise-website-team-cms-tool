/**
 * One-time migration script: converts plain text data in
 * flight_plan, mission_resources, and launch_requirements columns
 * from plain text strings to Lexical JSON format.
 *
 * Usage: node scripts/migrate-richtext.mjs
 */

import { createClient } from '@libsql/client'

function textToLexical(text) {
  if (!text || typeof text !== 'string') return null

  // Already JSON — skip
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && parsed.root) return null
  } catch {}

  const lines = text.split('\n')
  const children = []

  for (const line of lines) {
    const trimmed = line.trim()
    children.push({
      type: 'paragraph',
      version: 1,
      children: trimmed
        ? [{ type: 'text', text: trimmed, version: 1, format: 0, detail: 0, mode: 'normal', style: '' }]
        : [],
      direction: trimmed ? 'ltr' : null,
      format: '',
      indent: 0,
      textFormat: 0,
      textStyle: '',
    })
  }

  return JSON.stringify({
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  })
}

const db = createClient({ url: 'file:content.db' })

const result = await db.execute('SELECT id, flight_plan, mission_resources, launch_requirements FROM client_proposals')

let updated = 0
for (const row of result.rows) {
  const fpLexical = textToLexical(row.flight_plan)
  const mrLexical = textToLexical(row.mission_resources)
  const lrLexical = textToLexical(row.launch_requirements)

  const sets = []
  const params = []

  if (fpLexical) { sets.push('flight_plan = ?'); params.push(fpLexical) }
  if (mrLexical) { sets.push('mission_resources = ?'); params.push(mrLexical) }
  if (lrLexical) { sets.push('launch_requirements = ?'); params.push(lrLexical) }

  if (sets.length > 0) {
    params.push(row.id)
    await db.execute({ sql: `UPDATE client_proposals SET ${sets.join(', ')} WHERE id = ?`, args: params })
    updated++
    console.log(`Migrated row ${row.id}: ${sets.map(s => s.split(' =')[0]).join(', ')}`)
  }
}

console.log(`Done. ${updated} row(s) updated.`)
