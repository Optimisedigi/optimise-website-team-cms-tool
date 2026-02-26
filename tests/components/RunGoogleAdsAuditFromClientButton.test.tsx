import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import RunGoogleAdsAuditFromClientButton from '@/components/RunGoogleAdsAuditFromClientButton'

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: vi.fn(),
  useAllFormFields: vi.fn(),
}))

const mockUseDocumentInfo = useDocumentInfo as Mock
const mockUseAllFormFields = useAllFormFields as Mock

function buildFields(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    name: 'Acme Corp',
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

describe('RunGoogleAdsAuditFromClientButton', () => {
  let fetchMock: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  it('returns null when no document id', () => {
    mockUseDocumentInfo.mockReturnValue({ id: undefined })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    const { container } = render(<RunGoogleAdsAuditFromClientButton />)
    expect(container.innerHTML).toBe('')
  })

  it('disables button when googleAdsCustomerId is missing', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields({ googleAdsCustomerId: undefined })])

    render(<RunGoogleAdsAuditFromClientButton />)

    const button = screen.getByRole('button', { name: /run google ads audit/i })
    expect(button).toBeDisabled()
  })

  it('disables button when googleAdsCustomerId is empty string', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields({ googleAdsCustomerId: '' })])

    render(<RunGoogleAdsAuditFromClientButton />)

    const button = screen.getByRole('button', { name: /run google ads audit/i })
    expect(button).toBeDisabled()
  })

  it('disables button when googleAdsCustomerId is whitespace only', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields({ googleAdsCustomerId: '   ' })])

    render(<RunGoogleAdsAuditFromClientButton />)

    const button = screen.getByRole('button', { name: /run google ads audit/i })
    expect(button).toBeDisabled()
  })

  it('shows "Enter Google Ads Customer ID first" message when missing', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields({ googleAdsCustomerId: undefined })])

    render(<RunGoogleAdsAuditFromClientButton />)

    expect(screen.getByText(/enter a google ads customer id first/i)).toBeInTheDocument()
  })

  it('enables button when googleAdsCustomerId is present', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    render(<RunGoogleAdsAuditFromClientButton />)

    const button = screen.getByRole('button', { name: /run google ads audit/i })
    expect(button).not.toBeDisabled()
  })

  it('does not show "Enter Google Ads Customer ID" message when ID is present', () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    render(<RunGoogleAdsAuditFromClientButton />)

    expect(screen.queryByText(/enter a google ads customer id first/i)).not.toBeInTheDocument()
  })

  it('clicking creates audit and triggers run, then shows success link', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 42 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 99 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

    render(<RunGoogleAdsAuditFromClientButton />)

    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText(/audit created and running/i)).toBeInTheDocument()
    })

    const link = screen.getByText(/view audit/i)
    expect(link).toHaveAttribute('href', '/admin/collections/google-ads-audits/99')

    // Verify fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [createUrl, createOpts] = fetchMock.mock.calls[0]
    expect(createUrl).toBe('/api/google-ads-audits')
    expect(createOpts.method).toBe('POST')
    const createBody = JSON.parse(createOpts.body)
    expect(createBody.client).toBe(42)
    expect(createBody.customerId).toBe('123-456-7890')
    expect(createBody.businessName).toBe('Acme Corp')

    const [runUrl, runOpts] = fetchMock.mock.calls[1]
    expect(runUrl).toBe('/api/google-ads-audits/99/run-audit')
    expect(runOpts.method).toBe('POST')
  })

  it('uses audit.id fallback when doc.id is not present', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 55 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

    render(<RunGoogleAdsAuditFromClientButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText(/view audit/i)).toHaveAttribute(
        'href',
        '/admin/collections/google-ads-audits/55'
      )
    })
  })

  it('shows error message when create audit fails', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ errors: [{ message: 'Duplicate record' }] }),
    })

    render(<RunGoogleAdsAuditFromClientButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText('Duplicate record')).toBeInTheDocument()
    })
  })

  it('shows generic error message when create fails and json parsing fails', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse error')),
    })

    render(<RunGoogleAdsAuditFromClientButton />)
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
        status: 502,
        json: () => Promise.resolve({ error: 'Service unavailable' }),
      })

    render(<RunGoogleAdsAuditFromClientButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument()
    })
  })

  it('shows loading text while in progress', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])

    // Never-resolving promise to keep loading state
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<RunGoogleAdsAuditFromClientButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      expect(screen.getByText(/creating & running audit/i)).toBeInTheDocument()
    })
  })

  it('sends optional fields as undefined when empty', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([
      buildFields({ businessType: undefined, contactEmail: undefined, name: undefined }),
    ])

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ doc: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

    render(<RunGoogleAdsAuditFromClientButton />)
    fireEvent.click(screen.getByRole('button', { name: /run google ads audit/i }))

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.businessName).toBe('')
      expect(body.businessType).toBeUndefined()
      expect(body.contactEmail).toBeUndefined()
    })
  })
})
