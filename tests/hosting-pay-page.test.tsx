import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HostingPay from '@/app/(frontend)/hosting-pay/[token]/page'
import styles from '@/app/(frontend)/hosting-pay/[token]/hosting-pay.module.css'

const find = vi.fn()

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/lib/hosting-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hosting-billing')>()
  return {
    annualSavingCents: actual.annualSavingCents,
    HOSTING_RENEWAL_NOTE_DEFAULT: actual.HOSTING_RENEWAL_NOTE_DEFAULT,
    hashOfferToken: (token: string) => `hash:${token}`,
    formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  }
})

const snapshot: Record<string, any> = {
  selectedInterval: 'month',
  recipientName: 'Saved billing contact',
  monthly: {
    currency: 'aud',
    baseCents: 10900,
    surchargeCents: 231,
    totalCents: 11131,
    interval: 'month',
    allowance: '10GB storage',
    clause: 'Capacity terms.',
    planName: 'Website Hosting',
  },
  annual: {
    currency: 'aud',
    baseCents: 130800,
    surchargeCents: 2429,
    totalCents: 133229,
    interval: 'year',
    allowance: '10GB storage',
    clause: 'Capacity terms.',
    planName: 'Website Hosting',
  },
}

async function renderOffer(client: unknown) {
  find.mockResolvedValue({
    docs: [{ status: 'active', expiresAt: '2027-01-01T00:00:00.000Z', client, snapshot }],
  })
  render(await HostingPay({ params: Promise.resolve({ token: 'test-token' }) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // 2 Oct 2026, 10:00 in Sydney. Only Date is faked; timers stay real.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  delete snapshot.billingStartDate
  delete snapshot.renewalNote
})

describe('HostingPay payment review', () => {
  it('places the linked client name inside the payment card', async () => {
    await renderOffer({ id: 42, name: 'Cipher Health' })

    expect(screen.getByText('Cipher Health')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ depth: 1 }))
  })

  it('uses the offer recipient name inside the payment card when its client relation is unavailable', async () => {
    await renderOffer(42)

    expect(screen.getByText('Saved billing contact')).toBeInTheDocument()
  })

  it('lets the client choose monthly or annual, preselecting the admin default', async () => {
    await renderOffer({ id: 42, name: 'Cipher Health' })

    const monthly = screen.getByRole('radio', { name: /Monthly/ })
    const annual = screen.getByRole('radio', { name: /Annual/ })
    expect(monthly).toBeChecked()
    expect(annual).not.toBeChecked()
    expect(
      screen.getByText('It renews automatically on the 2nd of each month, charged to the same card, until cancelled.'),
    ).toBeInTheDocument()

    fireEvent.click(annual)

    expect(annual).toBeChecked()
    expect(screen.getByText('Total charged each year')).toBeInTheDocument()
    expect(screen.getByText(/You pay \$1332\.29 today for 12 months/)).toBeInTheDocument()
  })

  it('tells the client nothing is charged until a future billing start date', async () => {
    snapshot.billingStartDate = '2026-11-15'
    await renderOffer({ id: 42, name: 'Cipher Health' })

    expect(
      screen.getByText('Nothing is charged today. Your first payment of $111.31 is on 15 November 2026.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/charged automatically on the 15th of each month/)).toBeInTheDocument()
  })

  it('tells the client the full price is charged today when the start date has passed', async () => {
    // Today is 2 Oct; the monthly plan started on 14 September and renews on the 14th.
    snapshot.billingStartDate = '2026-09-14'
    await renderOffer({ id: 42, name: 'Cipher Health' })

    expect(
      screen.getByText('Today you pay $111.31 for hosting up to 14 October 2026.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/pro-rata/)).not.toBeInTheDocument()
  })

  it('shows the renewal and cancellation note from settings, or the standard wording', async () => {
    await renderOffer({ id: 42, name: 'Cipher Health' })
    expect(screen.getByText(/If you want to stop renting your website, just let us know/)).toBeInTheDocument()
    cleanup()

    snapshot.renewalNote = 'Custom renewal wording.'
    await renderOffer({ id: 42, name: 'Cipher Health' })
    expect(screen.getByText('Custom renewal wording.')).toBeInTheDocument()
  })

  it('shows no annual saving when the plan has no annual discount', async () => {
    // The fixture's annual fee is exactly 12 x the monthly fee.
    await renderOffer({ id: 42, name: 'Cipher Health' })

    expect(screen.queryByText(/Save/)).not.toBeInTheDocument()
  })

  it('shows the annual discount on the hosting fee as the saving', async () => {
    // 10% off 12 x $109 = $130.80 off; surcharge differences are not counted.
    const fullAnnual = snapshot.annual
    snapshot.annual = { ...fullAnnual, baseCents: 117720, surchargeCents: 2189, totalCents: 119909 }
    try {
      await renderOffer({ id: 42, name: 'Cipher Health' })

      expect(screen.getByText('Save $130.80 a year')).toBeInTheDocument()
    } finally {
      snapshot.annual = fullAnnual
    }
  })

  it('renders the plan allowance as a bulleted list with exclusions separated', async () => {
    snapshot.monthly.allowance =
      '• Website management • Uptime monitoring • Daily backups Not included: new features.'
    await renderOffer({ id: 42, name: 'Cipher Health' })

    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Website management',
      'Uptime monitoring',
      'Daily backups',
    ])
    expect(screen.getByText('Not included:')).toBeInTheDocument()
    snapshot.monthly.allowance = '10GB storage'
  })

  it('removes the recurring-payment copy and renders the light-grey payment card', async () => {
    await renderOffer({ id: 42, name: 'Cipher Health' })

    expect(
      screen.queryByText(/Please review your recurring card payment before continuing/i),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveClass(styles.reviewCard)
  })
})
