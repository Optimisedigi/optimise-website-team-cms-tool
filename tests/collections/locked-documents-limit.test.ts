import { describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import config from '@/payload.config'

/**
 * Opening any record runs Payload's "is someone editing this?" check: one
 * query with a condition per lockable collection. SQLite caps a query's
 * expression depth at 100. Measured against production on 2026-10-03:
 * 95 lockable collections works, 96 fails with "Expression tree is too large",
 * which blanked every client page. Keep well under the ceiling by setting
 * `lockDocuments: false` on collections that are never edited by hand.
 */
const MEASURED_CEILING = 95
const SAFE_MAXIMUM = MEASURED_CEILING - 3

describe('locked documents query size', () => {
  it(`keeps lockable collections at or below ${SAFE_MAXIMUM}`, async () => {
    const { collections } = await config
    const lockable = collections.filter(
      (collection: CollectionConfig) =>
        collection.lockDocuments !== false && collection.slug !== 'payload-locked-documents',
    )

    expect(
      lockable.length,
      `${lockable.length} lockable collections. Above ${MEASURED_CEILING}, opening any record fails in production. ` +
        'Set lockDocuments: false on collections that are never edited in the admin.',
    ).toBeLessThanOrEqual(SAFE_MAXIMUM)
  })
})
