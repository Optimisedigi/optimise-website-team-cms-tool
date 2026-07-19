/** Generate Custom Fluid Power's deck exclusively from its completed immutable snapshot. */
import { getPayload } from 'payload'
import configPromise from '../payload.config'
import { generateAuditDeck } from '../lib/google-ads-audit-snapshots/deck'

async function main() {
  const payload = await getPayload({ config: configPromise })
  const audits = await payload.find({
    collection: 'google-ads-audits' as any,
    where: { businessName: { equals: 'Custom Fluid Power' } },
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const audit = audits.docs[0]
  if (!audit) throw new Error('Custom Fluid Power needs a Google Ads audit with a completed evidence snapshot before a deck can be generated.')
  const deck = await generateAuditDeck(payload, String(audit.id))
  console.log(`Generated ${deck.publicPath} from snapshot ${deck.snapshotId} using rubric ${deck.analysis.scoring.rubricVersion}.`)
}
main().catch((error) => { console.error(error); process.exit(1) })
