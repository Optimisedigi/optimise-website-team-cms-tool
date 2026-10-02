import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { hashOfferToken } from '@/lib/hosting-billing'
import {
  buildOneOffPaymentEmail,
  createOneOffQuote,
  ONE_OFF_LINK_DAYS,
  parseOneOffRequest,
  type OneOffSnapshot,
} from '@/lib/hosting-one-off-payment'
import { sendBrevoEmail } from '@/lib/brevo-email'
import { loadStatementTemplates } from '@/lib/invoice-statement-templates'
import { getCmsUrl } from '@/lib/stripe'

type Params = { params: Promise<{ id: string }> }

/** Admin-facing summary; never includes the token or its hash. */
function summarise(doc: any) {
  const snapshot = (doc.snapshot ?? {}) as Partial<OneOffSnapshot>
  return {
    id: doc.id,
    status: doc.status,
    description: snapshot.description ?? '',
    totalCents: snapshot.quote?.totalCents ?? 0,
    currency: snapshot.quote?.currency ?? 'aud',
    recipientEmail: snapshot.recipientEmail ?? '',
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    paidAt: doc.paidAt ?? null,
  }
}

async function authorise(req: NextRequest) {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: req.headers })
  // Asking a client for money is a billing action, gated like price changes.
  return { payload, allowed: Boolean(user && userHasFeature(user, 'hosting-billing-settings')) }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { payload, allowed } = await authorise(req)
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { id } = await params
  const found = await payload.find({
    collection: 'hosting-one-off-payments',
    where: { client: { equals: Number(id) } },
    sort: '-createdAt',
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  return NextResponse.json({ payments: found.docs.map(summarise) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { payload, allowed } = await authorise(req)
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { id } = await params

  const request = parseOneOffRequest(await req.json().catch(() => null))
  if (!request.ok) return NextResponse.json({ error: request.error }, { status: 400 })

  const client: any = await payload.findByID({ collection: 'clients', id, overrideAccess: true })
  const hosting = client.hostingSubscription || {}
  if (!hosting.recipientEmail)
    return NextResponse.json(
      { error: 'Add a billing email in the hosting section first.' },
      { status: 422 },
    )

  const settings: any = await payload.findGlobal({
    slug: 'hosting-billing-settings',
    overrideAccess: true,
  })
  const surcharge = {
    percentage: Number(settings.cardSurchargePercentage),
    fixedCents: Number(settings.cardSurchargeFixedCents),
  }
  const snapshot: OneOffSnapshot = {
    description: request.value.description,
    quote: createOneOffQuote(request.value.baseCents, settings.currency || 'aud', surcharge),
    recipientEmail: hosting.recipientEmail,
    recipientName: hosting.recipientName || '',
  }

  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ONE_OFF_LINK_DAYS * 86_400_000).toISOString()
  const payment: any = await payload.create({
    collection: 'hosting-one-off-payments',
    data: {
      client: Number(id),
      tokenHash: hashOfferToken(token),
      status: 'active',
      expiresAt,
      snapshot: { ...snapshot, quote: { ...snapshot.quote } },
    },
    overrideAccess: true,
  })
  const url = `${getCmsUrl()}/hosting-pay/once/${token}`

  // The link is live once saved, so a failed email must not hide it: the
  // admin still gets the URL back and can send it by hand.
  let email: { ok: boolean; code?: string; status?: number }
  try {
    const accounts = await loadStatementTemplates(payload)
    email = await sendBrevoEmail({
      sender: { email: accounts.fromEmail, name: 'Optimise Digital' },
      replyTo: { email: accounts.replyToEmail },
      to: [
        {
          email: snapshot.recipientEmail,
          ...(snapshot.recipientName ? { name: snapshot.recipientName } : {}),
        },
      ],
      ...buildOneOffPaymentEmail({
        clientName: client.name,
        snapshot,
        url,
        expiresAt,
        signOff: {
          signOff: accounts.templates.signOff,
          senderName: accounts.templates.senderName,
          signatureHtml: accounts.signatureHtml,
        },
      }),
    })
  } catch {
    email = { ok: false, code: 'email-build-failed' }
  }
  if (!email.ok)
    console.error('[hosting-one-off-payments] payment email failed', {
      clientId: id,
      paymentId: payment.id,
      code: email.code,
      status: email.status,
    })

  return NextResponse.json({
    payment: summarise(payment),
    url,
    emailSent: email.ok,
    emailedTo: email.ok ? snapshot.recipientEmail : undefined,
  })
}
