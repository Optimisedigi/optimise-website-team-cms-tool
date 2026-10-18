import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.hoisted(() => ({ user: null as unknown }))
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))

vi.mock('@payloadcms/ui', () => ({
  useAuth: () => mockAuth,
  toast: mockToast,
}))

import CostCsvDropImport, { COSTS_IMPORTED_EVENT } from '@/components/CostCsvDropImport'

const csv = () => new File(['01/10/2026,"-31.00","VERCEL","+1000.00"'], 'statement.csv', { type: 'text/csv' })
const png = () => new File(['x'], 'photo.png', { type: 'image/png' })

function dropOn(target: Element | Document, files: File[]) {
  fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files } })
  fireEvent.dragOver(target, { dataTransfer: { types: ['Files'], files } })
  fireEvent.drop(target, { dataTransfer: { types: ['Files'], files } })
}

const okResponse = { total: 3, categorised: 2, uncategorised: 1, receipts: 2, duplicatesSkipped: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.user = { id: 1, role: 'admin' }
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => okResponse })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CostCsvDropImport', () => {
  it('uploads a CSV dropped anywhere in the window to the costs import endpoint', async () => {
    const imported = vi.fn()
    window.addEventListener(COSTS_IMPORTED_EVENT, imported)
    render(<CostCsvDropImport><main>Any admin page</main></CostCsvDropImport>)

    dropOn(screen.getByText('Any admin page'), [csv()])

    await waitFor(() => expect(mockToast.success).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/costs/upload')
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
    expect(mockToast.success.mock.calls[0]?.[0]).toContain('imported 3 costs')
    expect(mockToast.success.mock.calls[0]?.[0]).toContain('2 payments received')
    expect(imported).toHaveBeenCalledTimes(1)
    window.removeEventListener(COSTS_IMPORTED_EVENT, imported)
  })

  it('leaves drops handled by another drop zone alone', () => {
    render(
      <CostCsvDropImport>
        <div data-testid="upload-field" onDrop={(event) => event.preventDefault()}>Upload field</div>
      </CostCsvDropImport>,
    )

    dropOn(screen.getByTestId('upload-field'), [csv()])

    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects non-CSV files without uploading', () => {
    render(<CostCsvDropImport><main>Page</main></CostCsvDropImport>)

    dropOn(screen.getByText('Page'), [png()])

    expect(fetch).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith('Only CSV bank statements can be dropped here to import costs.')
  })

  it('does nothing for users without business-costs access', () => {
    mockAuth.user = { id: 2, role: 'specialist', featureAccess: [] }
    render(<CostCsvDropImport><main>Page</main></CostCsvDropImport>)

    dropOn(screen.getByText('Page'), [csv()])

    expect(fetch).not.toHaveBeenCalled()
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  it('shows a non-blocking hint while a file is dragged over the window', () => {
    render(<CostCsvDropImport><main>Page</main></CostCsvDropImport>)

    act(() => {
      fireEvent.dragEnter(screen.getByText('Page'), { dataTransfer: { types: ['Files'], files: [] } })
    })

    expect(screen.getByTestId('cost-csv-drop-hint')).toHaveStyle({ pointerEvents: 'none' })
  })

  it('reports a server error instead of a success', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) })))
    render(<CostCsvDropImport><main>Page</main></CostCsvDropImport>)

    dropOn(screen.getByText('Page'), [csv()])

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('statement.csv: Forbidden'))
    expect(mockToast.success).not.toHaveBeenCalled()
  })
})
