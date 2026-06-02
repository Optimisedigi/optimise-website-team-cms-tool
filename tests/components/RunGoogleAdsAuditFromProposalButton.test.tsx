import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import RunGoogleAdsAuditFromProposalButton from '@/components/RunGoogleAdsAuditFromProposalButton'

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: vi.fn(),
  useAllFormFields: vi.fn(),
}))

const mockUseDocumentInfo = useDocumentInfo as Mock
const mockUseAllFormFields = useAllFormFields as Mock

function buildFields(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    businessName: 'Acme Corp',
    websiteUrl: 'https://acme.com',
    businessType: 'ecommerce',
    googleAdsCustomerId: '123-456-7890',
    contactEmail: 'test@acme.com',
  }
  const merged = { ...defaults, ...overrides }
  const fields: Record<string, { value: unknown }> = {}
  for (const [key, value] of Object.entries(merged)) {
    fields[key] = { value }
  }
  return fields
}

describe('RunGoogleAdsAuditFromProposalButton', () => {
  let fetchMock: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  it('returns null when no document id', () => {
    mockUseDocumentInfo.mockReturnValue({ id: undefined })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    const { container } = render(<RunGoogleAdsAuditFromProposalButton />)
    expect(container.innerHTML).toBe('')
  })

  it('disables button when googleAdsCustomerId is missing', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields({ googleAdsCustomerId: undefined })])

    render(<RunGoogleAdsAuditFromProposalButton />)

    const button = screen.getByRole('button', { name: /run google ads audit/i })
    expect(button).toBeDisabled()
  })

  it('disables button when googleAdsCustomerId is whitespace only', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields({ googleAdsCustomerId: '   ' })])

    render(<RunGoogleAdsAuditFromProposalButton />)

    expect(screen.getByRole('button', { name: /run google ads audit/i })).toBeDisabled()
  })

  it('shows "Enter Google Ads Customer ID first" when missing', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields({ googleAdsCustomerId: undefined })])

    render(<RunGoogleAdsAuditFromProposalButton />)

    expect(screen.getByText(/enter a google ads customer id/i)).toBeInTheDocument()
  })

  it('explains the Google Ads audit is separate from the client proposal audit', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    render(<RunGoogleAdsAuditFromProposalButton />)

    expect(screen.getByText(/separate from the main/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run google ads audit/i })).toHaveAttribute(
      'title',
      expect.stringContaining('separate Google Ads audit record'),
    )
  })

  it('enables button when googleAdsCustomerId is present', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    render(<RunGoogleAdsAuditFromProposalButton />)

    expect(screen.getByRole('button', { name: /run google ads audit/i })).not.toBeDisabled()
  })

  it('clicking creates audit, triggers run, and shows success link', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 7 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 200 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText(/audit created and running/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/view audit/i)).toHaveAttribute(
      'href',
      '/admin/collections/google-ads-audits/200'
    )

    // Verify create call has proposal field set to the document id
    const createBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(createBody.proposal).toBe(7)
    expect(createBody.customerId).toBe('123-456-7890')
  })

  it('passes client field when it is a numeric ID', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 7 })
    const fields = buildFields()
    fields.client = { value: 42 }
    mockUseAllFormFields.mockReturnValue([fields])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.client).toBe(42)
    })
  })

  it('extracts client id from populated object with id property', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 7 })
    const fields = buildFields()
    fields.client = { value: { id: 55, name: 'Some Client' } }
    mockUseAllFormFields.mockReturnValue([fields])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.client).toBe(55)
    })
  })

  it('extracts client id from populated object with value property', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 7 })
    const fields = buildFields()
    fields.client = { value: { value: 88 } }
    mockUseAllFormFields.mockReturnValue([fields])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.client).toBe(88)
    })
  })

  it('does not include client field when client is not set', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 7 })
    // No client field at all
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.client).toBeUndefined()
    })
  })

  it('does not include client field when client value is falsy', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 7 })
    const fields = buildFields()
    fields.client = { value: null }
    mockUseAllFormFields.mockReturnValue([fields])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.client).toBeUndefined()
    })
  })

  it('shows error message when create audit fails', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ errors: [{ message: 'Missing required field' }] }),
    })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText('Missing required field')).toBeInTheDocument()
    })
  })

  it('shows fallback error when create fails with non-parseable json', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bad json')),
    })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create audit (500)')).toBeInTheDocument()
    })
  })

  it('shows error message when run-audit fails', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 10 } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Timeout' }),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument()
    })
  })

  it('shows loading text while in progress', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText(/creating & running google ads audit/i)).toBeInTheDocument()
    })
  })

  it('uses audit.id fallback when doc.id is not present', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 77 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

    render(<RunGoogleAdsAuditFromProposalButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText(/view audit/i)).toHaveAttribute(
        'href',
        '/admin/collections/google-ads-audits/77'
      )
    })
  })
})
