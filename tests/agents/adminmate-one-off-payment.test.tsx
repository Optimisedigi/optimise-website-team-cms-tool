import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminMateOneOffPaymentCard from '@/components/AdminMateOneOffPaymentCard'
import { extractLatestStagedOneOffPayment } from '@/lib/agents/adminmate'
import {
  createOneOffPaymentTool,
  validateStagedOneOffPayment,
  type StagedOneOffPayment,
} from '@/lib/agents/adminmate/one-off-payment-tool'
import type { AgentStep } from '@/lib/agents/_shared/types'

const clients = [
  { id: '8', name: 'We Can Quit', slug: 'we-can-quit', isActive: true },
  { id: '9', name: 'Acme', slug: 'acme', isActive: false },
]
const NOW = new Date('2026-10-03T02:00:00.000Z')

describe('stage_one_off_payment', () => {
  it('stages a payment for an existing client without creating or sending anything', async () => {
    const tool = createOneOffPaymentTool(clients)
    const input = tool.validate?.({
      clientId: '8',
      description: ' Backdated hosting ',
      amount: 297,
    })

    expect(input).toEqual({
      clientId: '8',
      clientName: 'We Can Quit',
      description: 'Backdated hosting',
      amount: 297,
    })
    expect(await tool.execute(input as StagedOneOffPayment, {} as never)).toEqual({
      ok: true,
      data: { staged: input },
    })
  })

  it.each([
    [
      { clientId: '99', description: 'Hosting', amount: 10 },
      'clientId does not match an existing client',
    ],
    [{ clientId: '8', description: '', amount: 10 }, 'Describe what the payment is for.'],
    [{ clientId: '8', description: 'Hosting', amount: 0 }, 'Enter an amount above $0.'],
    [{ clientId: '8', description: 'Hosting', amount: 10.005 }, 'Use at most two decimal places'],
    [
      { clientId: '8', description: 'Hosting', amount: 10, sendOn: '2026-10-03' },
      'Pick a send date after today',
    ],
  ])('rejects %j', (raw, message) => {
    expect(() => validateStagedOneOffPayment(raw, clients, NOW)).toThrow(message)
  })

  it('keeps a valid future send date', () => {
    expect(
      validateStagedOneOffPayment(
        { clientId: '9', description: 'Hosting', amount: 49.5, sendOn: '2026-10-10' },
        clients,
        NOW,
      ),
    ).toEqual({
      clientId: '9',
      clientName: 'Acme',
      description: 'Hosting',
      amount: 49.5,
      sendOn: '2026-10-10',
    })
  })

  it('only surfaces the latest valid staged payment to the chat', () => {
    const step = (input: unknown): AgentStep =>
      ({
        type: 'tool-call',
        toolName: 'stage_one_off_payment',
        output: { ok: true, data: { staged: input } },
      }) as never
    const steps = [
      step({ clientId: '8', description: 'First', amount: 10 }),
      step({ clientId: '8', description: 'Second', amount: 20 }),
      step({ clientId: '77', description: 'Unknown client', amount: 30 }),
    ]

    expect(extractLatestStagedOneOffPayment(steps, clients)).toMatchObject({
      description: 'Second',
      amount: 20,
    })
  })
})

describe('AdminMateOneOffPaymentCard', () => {
  const staged: StagedOneOffPayment = {
    clientId: '8',
    clientName: 'We Can Quit',
    description: 'Backdated hosting',
    amount: 297,
  }
  const preview = {
    recipientEmail: 'billing@example.com',
    currency: 'aud',
    surcharge: { percentage: 1.75, fixedCents: 30 },
  }
  const onConfirm = vi.fn()
  const onChange = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  const renderCard = (
    overrides: Partial<StagedOneOffPayment> = {},
    previewOverride: typeof preview | undefined = preview,
  ) =>
    render(
      <AdminMateOneOffPaymentCard
        staged={{ ...staged, ...overrides }}
        preview={previewOverride}
        sending={false}
        onChange={onChange}
        onConfirm={onConfirm}
        onDiscard={vi.fn()}
      />,
    )

  it('shows the real total and recipient before anything is sent', async () => {
    renderCard()

    expect(screen.getByRole('status')).toHaveTextContent(
      '$302.60 including card surcharge, emailed from accounts to billing@example.com as soon as you confirm.',
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Email payment link' })),
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('offers to schedule when a send date is set', () => {
    renderCard({ sendOn: '2026-10-10' })

    expect(screen.getByRole('status')).toHaveTextContent(
      /at 9am Sydney time on Sat,? 10 October 2026/,
    )
    expect(screen.getByRole('button', { name: 'Schedule payment email' })).toBeEnabled()
  })

  it('lets the admin change the send date on the card', () => {
    renderCard()

    fireEvent.change(screen.getByLabelText('Send email on'), { target: { value: '2026-10-12' } })

    expect(onChange).toHaveBeenCalledWith({ sendOn: '2026-10-12' })
  })

  it('will not send when the client has no billing email', () => {
    renderCard({}, { ...preview, recipientEmail: '' })

    expect(screen.getByRole('status')).toHaveTextContent(
      'This client has no hosting billing email.',
    )
    expect(screen.getByRole('button', { name: 'Email payment link' })).toBeDisabled()
  })

  it('will not send an invalid amount', () => {
    renderCard({ amount: 0 })

    expect(screen.getByRole('button', { name: 'Email payment link' })).toBeDisabled()
  })
})
