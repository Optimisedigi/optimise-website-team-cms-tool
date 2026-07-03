import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getValidGmailToken } from '@/lib/agents/_shared/user-gmail-tokens'
import { createGmailDraft } from '@/lib/gmail-service'
import { buildCampaignProposalEmailHtml } from '@/lib/campaign-proposal-email'

interface DraftCampaignProposalBody {
  htmlBody?: unknown
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const { user } = await payload.auth({ headers: req.headers })
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: DraftCampaignProposalBody = {}
  try {
    body = (await req.json()) as DraftCampaignProposalBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  let audit: any
  try {
    audit = await payload.findByID({
      collection: 'google-ads-audits',
      id,
    })
  } catch {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
  }

  const proposalHtml = audit.campaignProposal
    ? buildCampaignProposalEmailHtml(audit.campaignProposal)
    : ''
  const htmlBody =
    asString(body.htmlBody) || proposalHtml || asString(audit.campaignProposalEmailHtml)
  if (!htmlBody) {
    return NextResponse.json(
      { error: 'No campaign proposal email HTML available.' },
      { status: 400 },
    )
  }

  const clientName = asString(audit.businessName) || 'Client'
  const subject = `[${clientName}] campaign structure proposal`
  const to = asString(audit.contactEmail)

  const userId = typeof user.id === 'number' ? user.id : Number(user.id)
  const tokenResult = await getValidGmailToken(userId)
  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: 'gmail-not-connected', reason: tokenResult.reason },
      { status: 403 },
    )
  }

  try {
    const result = await createGmailDraft(tokenResult.accessToken, {
      to,
      subject,
      htmlBody,
    })

    return NextResponse.json({
      draftId: result.draftId,
      messageId: result.messageId,
      gmailUrl: `https://mail.google.com/mail/u/0/#drafts/${result.messageId}`,
      subject,
      to,
    })
  } catch (err) {
    const e = err as { code?: number; status?: number; message?: string }
    const status = e.code ?? e.status ?? 0
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          error: 'scope-insufficient',
          reason:
            'Gmail returned insufficient permissions. Reconnect Gmail to grant compose and settings/signature access.',
        },
        { status: 403 },
      )
    }
    return NextResponse.json(
      { error: e.message ?? 'Gmail draft creation failed.' },
      { status: 500 },
    )
  }
}
