import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { createHostingQuote, formatMoney } from '@/lib/hosting-billing'
import { sendBrevoEmail } from '@/lib/brevo-email'

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, () => String(value ?? '')),
    template,
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || !userHasFeature(user, 'hosting-billing-settings')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { id } = await params
  const client: any = await payload.findByID({
    collection: 'clients',
    id,
    overrideAccess: true,
  })
  const body = await req.json()
  const hosting = client.hostingSubscription || {}
  const settings: any = await payload.findGlobal({
    slug: 'hosting-billing-settings',
    overrideAccess: true,
  })
  if (!hosting.stripeSubscriptionId || !hosting.currentPeriodEnd) {
    return NextResponse.json(
      { error: 'An active hosting subscription is required.' },
      { status: 422 },
    )
  }

  const requested = new Date(body.effectiveAt)
  const minimum = new Date(Date.now() + Number(settings.minimumNoticeDays || 30) * 86_400_000)
  const renewal = new Date(hosting.currentPeriodEnd)
  if (requested < minimum || requested.getTime() !== renewal.getTime()) {
    return NextResponse.json(
      {
        error: 'Effective date must be the recorded renewal date and meet the notice period.',
      },
      { status: 422 },
    )
  }

  const surcharge = {
    percentage: Number(settings.cardSurchargePercentage),
    fixedCents: Number(settings.cardSurchargeFixedCents),
  }
  const shared = {
    currency: settings.currency || 'aud',
    allowance: body.allowance || hosting.allowance,
    clause: hosting.capacityClause || settings.capacityChangeClause,
    planName: hosting.planName,
    surcharge,
  }
  const quote =
    hosting.billingInterval === 'year'
      ? createHostingQuote({
          ...shared,
          baseCents: Number(body.annualBaseCents),
          interval: 'year',
        })
      : createHostingQuote({
          ...shared,
          baseCents: Number(body.monthlyBaseCents),
          interval: 'month',
        })
  const current =
    hosting.billingInterval === 'year'
      ? createHostingQuote({
          ...shared,
          baseCents: Number(hosting.annualBaseCents),
          interval: 'year',
        })
      : createHostingQuote({
          ...shared,
          baseCents: Number(hosting.monthlyBaseCents),
          interval: 'month',
        })

  const noticeValues = {
    clientName: client.name,
    currentPrice: formatMoney(current.totalCents, current.currency),
    newPrice: formatMoney(quote.totalCents, quote.currency),
    effectiveDate: renewal.toLocaleDateString('en-AU'),
    reason: String(body.reason || ''),
  }
  const noticeText = renderTemplate(String(settings.noticeEmailBody), noticeValues)
  const email = await sendBrevoEmail({
    to: [{ email: hosting.recipientEmail, name: hosting.recipientName }],
    subject: renderTemplate(String(settings.noticeEmailSubject), noticeValues),
    textContent: noticeText,
    htmlContent: noticeText
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
      .join(''),
  })
  if (!email.ok) {
    return NextResponse.json(
      { error: 'Notice email failed. Nothing was scheduled.' },
      { status: 502 },
    )
  }

  const changes = [
    ...(hosting.priceChanges || []),
    {
      status: 'pending',
      reason: body.reason,
      effectiveAt: renewal.toISOString(),
      oldQuote: current,
      newQuote: quote,
      noticeSentAt: new Date().toISOString(),
      noticeMessageId: email.messageId,
    },
  ]
  await payload.update({
    collection: 'clients',
    id,
    data: { hostingSubscription: { ...hosting, priceChanges: changes } },
    overrideAccess: true,
  })
  return NextResponse.json({ scheduled: true })
}
