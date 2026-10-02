import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HostingPay from '@/app/(frontend)/hosting-pay/[token]/page'
import styles from '@/app/(frontend)/hosting-pay/[token]/hosting-pay.module.css'

const find = vi.fn()

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/lib/hosting-billing', () => ({
  hashOfferToken: (token: string) => `hash:${token}`,
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}))

const snapshot = {
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

beforeEach(() => vi.clearAllMocks())

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
    expect(screen.getByText(/debited automatically on the 1st of every month/i)).toBeInTheDocument()

    fireEvent.click(annual)

    expect(annual).toBeChecked()
    expect(screen.getByText('Total charged each year')).toBeInTheDocument()
    expect(screen.getByText(/You pay \$1332\.29 today for 12 months/)).toBeInTheDocument()
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
