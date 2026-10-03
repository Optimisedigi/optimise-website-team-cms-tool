import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { parseOneOffRequest, type OneOffSnapshot } from '@/lib/hosting-one-off-payment'
import { issueOneOffPayment } from '@/lib/hosting-one-off-issue'
import { MAX_SCHEDULED_SEND_ATTEMPTS } from '@/lib/hosting-one-off-payment-status'

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
    scheduledSendAt: doc.scheduledSendAt ?? null,
    emailSentAt: doc.emailSentAt ?? null,
    /** A scheduled email that has stopped retrying; the admin must act. */
    sendFailed:
      doc.status === 'scheduled' && Number(doc.sendAttempts ?? 0) >= MAX_SCHEDULED_SEND_ATTEMPTS,
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
    // Cancelled links the admin removed stay in the database, not the list.
    where: { and: [{ client: { equals: Number(id) } }, { hiddenAt: { exists: false } }] },
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

  const issued = await issueOneOffPayment(payload, {
    clientId: Number(id),
    request: request.value,
    now: new Date(),
  })
  if (!issued.ok)
    return NextResponse.json({ error: issued.error.error }, { status: issued.error.status })

  return NextResponse.json({
    payment: summarise(issued.value.payment),
    url: issued.value.url,
    emailSent: issued.value.emailSent,
    emailedTo: issued.value.emailedTo,
  })
}
