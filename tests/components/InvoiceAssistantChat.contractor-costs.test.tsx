import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvoiceAssistantChat from '@/components/InvoiceAssistantChat'

vi.mock('@/components/OptiMateVoice', () => ({ default: () => null }))
vi.mock('@/components/OptiMateChatCore', () => ({ renderMarkdown: (text: string) => text }))

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('InvoiceAssistantChat popout handoff', () => {
  it('restores the handed-off conversation, including contractor payment cards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    localStorage.setItem('optimate:handoff:inv1', JSON.stringify({
      agent: 'invoices',
      createdAt: Date.now(),
      snapshot: {
        messages: [
          { role: 'user', content: 'What do I owe Ada?' },
          {
            role: 'assistant',
            content: 'Ada is owed one fortnight.',
            contractorPayments: [{
              contractorId: 1,
              contractorName: 'Ada Lovelace',
              fortnightStartDate: '2026-06-29',
              fortnightEndDate: '2026-07-12',
              amount: 354,
              currency: 'AUD',
              transferReference: '2906-1207 Optimise',
              status: 'unpaid',
            }, { contractorId: 'bad' }],
          },
        ],
        input: 'and Grace?',
      },
    }))

    render(<InvoiceAssistantChat handoffId="inv1" />)

    expect(await screen.findByText('What do I owe Ada?')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Feel free to ask')).toHaveValue('and Grace?')
    expect(localStorage.getItem('optimate:handoff:inv1')).toBeNull()
  })
})

describe('InvoiceAssistantChat contractor costs', () => {
  it('renders unpaid fortnights and marks them paid via the in-chat dropdown', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/xero/chat') {
        return {
          ok: true,
          json: async () => ({
            reply: 'Ada is owed one unpaid fortnight.',
            actions: [{
              tool: 'listContractorCosts',
              result: {
                payments: [{
                  contractorId: 1,
                  contractorName: 'Ada Lovelace',
                  fortnightStartDate: '2026-06-29',
                  fortnightEndDate: '2026-07-12',
                  amount: 354,
                  currency: 'AUD',
                  transferReference: '2906-1207 Optimise',
                  status: 'unpaid',
                }],
              },
            }],
          }),
        }
      }
      if (url === '/api/contractor-payments/mark-paid') {
        return { ok: true, json: async () => ({ ok: true, paymentId: 77 }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<InvoiceAssistantChat />)
    fireEvent.change(screen.getByPlaceholderText('Feel free to ask'), { target: { value: 'how much do I owe in contractor cost for Ada' } })
    fireEvent.click(screen.getByLabelText('Send'))

    await screen.findByText('Ada Lovelace')
    expect(screen.getByText('Transfer $354.00')).toBeInTheDocument()
    expect(screen.getByText('2906-1207 Optimise')).toBeInTheDocument()

    const status = screen.getByLabelText(/Payment status for Ada Lovelace/)
    fireEvent.change(status, { target: { value: 'paid' } })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/contractor-payments/mark-paid', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ contractorId: 1, fortnightStartDate: '2026-06-29' }),
      }))
    })
    await waitFor(() => expect((status as HTMLSelectElement).value).toBe('paid'))
  })
})
