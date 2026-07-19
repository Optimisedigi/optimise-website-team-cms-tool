import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import RunGoogleAdsAuditFromClientButton from '@/components/RunGoogleAdsAuditFromClientButton'

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: vi.fn(),
  useAllFormFields: vi.fn(),
}))

const mockUseDocumentInfo = useDocumentInfo as Mock
const mockUseAllFormFields = useAllFormFields as Mock
const originalFetch = globalThis.fetch

function buildFields(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    name: 'Acme Corp',
    websiteUrl: 'https://acme.com',
    googleAdsCustomerId: '123-456-7890',
    contactEmail: 'test@acme.com',
  }
  return Object.fromEntries(
    Object.entries({ ...defaults, ...overrides }).map(([key, value]) => [key, { value }]),
  )
}

const response = (body: unknown, ok = true) => ({
  ok,
  json: () => Promise.resolve(body),
})

const findNone = () => response({ docs: [] })
const createdAudit = (id = 99) => response({ doc: { id, snapshotState: 'not_started' } })
const startedSnapshot = () =>
  response({
    status: 'running',
    periodStart: '2026-06-01T00:00:00.000Z',
    periodEnd: '2026-06-30T23:59:59.999Z',
  })

describe('RunGoogleAdsAuditFromClientButton', () => {
  let fetchMock: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    mockUseDocumentInfo.mockReturnValue({ id: 1 })
    mockUseAllFormFields.mockReturnValue([buildFields()])
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns null when no document id', () => {
    mockUseDocumentInfo.mockReturnValue({ id: undefined })
    const { container } = render(<RunGoogleAdsAuditFromClientButton />)
    expect(container.innerHTML).toBe('')
  })

  it.each([undefined, '', '   '])('disables snapshots when customer ID is %s', (customerId) => {
    mockUseAllFormFields.mockReturnValue([
      buildFields({ googleAdsCustomerId: customerId }),
    ])

    render(<RunGoogleAdsAuditFromClientButton />)

    expect(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    ).toBeDisabled()
    expect(screen.getByText(/enter a google ads customer id first/i)).toBeInTheDocument()
  })

  it('enables snapshots when the customer ID is present', () => {
    fetchMock.mockResolvedValue(findNone())
    render(<RunGoogleAdsAuditFromClientButton />)
    expect(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    ).not.toBeDisabled()
  })

  it('finds or creates an audit, starts a snapshot, and links the audit', async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 42 })
    fetchMock
      .mockResolvedValueOnce(findNone())
      .mockResolvedValueOnce(findNone())
      .mockResolvedValueOnce(createdAudit())
      .mockResolvedValueOnce(startedSnapshot())

    render(<RunGoogleAdsAuditFromClientButton />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    )

    await waitFor(() => {
      expect(screen.getByText(/snapshot running/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /review audit/i })).toHaveAttribute(
      'href',
      '/admin/collections/google-ads-audits/99',
    )
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/google-ads-audits?')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/google-ads-audits?')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/google-ads-audits')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(
      expect.objectContaining({
        client: 42,
        customerId: '123-456-7890',
        businessName: 'Acme Corp',
      }),
    )
    expect(fetchMock.mock.calls[3][0]).toBe('/api/google-ads-audits/99/snapshot')
  })

  it('resumes an existing incomplete snapshot without creating another audit', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ docs: [{ id: 55, snapshotState: 'collecting' }] }),
      )
      .mockResolvedValueOnce(
        response({ docs: [{ id: 55, snapshotState: 'collecting' }] }),
      )
      .mockResolvedValueOnce(startedSnapshot())

    render(<RunGoogleAdsAuditFromClientButton />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /review audit/i })).toHaveAttribute(
        'href',
        '/admin/collections/google-ads-audits/55',
      )
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('shows lookup, creation, and snapshot errors', async () => {
    fetchMock
      .mockResolvedValueOnce(findNone())
      .mockResolvedValueOnce(response({}, false))

    const { rerender } = render(<RunGoogleAdsAuditFromClientButton />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check for an existing audit',
    )

    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(findNone())
      .mockResolvedValueOnce(response({ errors: [{ message: 'Duplicate record' }] }, false))
    rerender(<RunGoogleAdsAuditFromClientButton />)
    fireEvent.click(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Duplicate record'))

    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(response({ docs: [{ id: 10, snapshotState: 'collecting' }] }))
      .mockResolvedValueOnce(response({ error: 'Service unavailable' }, false))
    fireEvent.click(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    )
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable'),
    )
  })

  it('shows loading state while checking the snapshot', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RunGoogleAdsAuditFromClientButton />)
    fireEvent.click(
      screen.getByRole('button', { name: /create or resume audit snapshot/i }),
    )
    expect(await screen.findByText(/checking snapshot/i)).toBeInTheDocument()
  })
})
