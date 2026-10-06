import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import config from '@/payload.config'
import { validateStagedProposal } from '@/lib/agents/adminmate'
import {
  ProposalSlugConflictError,
  createProposalFromStaged,
} from '@/lib/agents/adminmate/create-proposal'

/**
 * Creates the client proposal the admin confirmed in the AdminMate review card.
 *
 * The staged payload arrives from the browser, so it is re-validated through the
 * same field allowlist the agent used — an edited card can never introduce a
 * field (PIN, audits, Google Ads IDs, keyword jobs) the agent was not allowed to set.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  let staged
  try {
    staged = validateStagedProposal(body)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid client proposal' },
      { status: 400 },
    )
  }

  try {
    const created = await createProposalFromStaged(
      payload,
      staged,
      await createLocalReq({ user }, payload),
    )
    return NextResponse.json({
      ...created,
      adminUrl: `/admin/collections/client-proposals/${created.id}`,
    })
  } catch (error) {
    if (error instanceof ProposalSlugConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[adminmate/create-proposal] create failed:', error)
    return NextResponse.json({ error: 'The client proposal could not be created' }, { status: 500 })
  }
}
