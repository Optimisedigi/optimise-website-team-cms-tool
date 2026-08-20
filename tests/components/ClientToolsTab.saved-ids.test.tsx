import { render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClientToolsTab from '@/components/ClientToolsTab'

/**
 * The Integrations panel must describe the SAVED document, because that is what
 * Test connection checks server-side.
 *
 * Reported symptom: the panel read live form state, so it printed
 * "Customer ID: 4894896666" directly above the server's reply
 * "No Google Ads customer ID set." — two contradictory claims in one card, with
 * no hint that the value simply had not been saved.
 */

type FormField = { value?: unknown; initialValue?: unknown }

let formFields: Record<string, FormField> = {}

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: 13 }),
  // The component calls useFormFields(selector) with [fields, dispatch].
  useFormFields: (selector: (args: [Record<string, FormField>, () => void]) => unknown) =>
    selector([formFields, vi.fn()]),
}))

/** `saved` is what's on the document; `draft` is what's typed but unsaved. */
function setField(path: string, saved: string, draft?: string) {
  formFields[path] = { initialValue: saved, value: draft ?? saved }
}

function renderPanel() {
  return render(<ClientToolsTab />)
}

beforeEach(() => {
  vi.clearAllMocks()
  formFields = {}
  setField('ga4PropertyId', '')
  setField('gscPropertyUrl', '')
  setField('googleAdsCustomerId', '')
  setField('metaAdAccountId', '')
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  }) as unknown as typeof fetch
})

describe('Integrations panel ID display', () => {
  it('shows a saved Google Ads customer ID', async () => {
    setField('googleAdsCustomerId', '4894896666')

    renderPanel()

    await waitFor(() => expect(screen.getByText(/Customer ID: 4894896666/)).toBeTruthy())
  })

  it('does not claim an ID is present when it has only been typed, not saved', async () => {
    // The exact reported case: nothing saved, a value sitting in the form.
    setField('googleAdsCustomerId', '', '4894896666')

    renderPanel()

    await waitFor(() => expect(screen.getByText(/Set the Google Ads customer ID/)).toBeTruthy())
    expect(screen.queryByText(/Customer ID: 4894896666/)).toBeNull()
  })

  it('warns about the pending edit and blocks the test while it is unsaved', async () => {
    // A SAVED id that has been edited. Using an empty saved id would prove
    // nothing: the button is already disabled by the pre-existing `!hasId`,
    // so the assertion would pass even without the unsaved gating.
    setField('googleAdsCustomerId', '3425353766', '4894896666')

    renderPanel()

    await waitFor(() => expect(screen.getByText(/Unsaved change above/)).toBeTruthy())
    // Scope to the Google Ads row — the one showing the saved value.
    const row = screen.getByText(/Customer ID: 3425353766/).closest('div')?.parentElement
      ?.parentElement
    expect(row).toBeTruthy()
    const testButton = Array.from(row!.querySelectorAll('button')).find((b) =>
      /test connection/i.test(b.textContent || ''),
    )
    expect(testButton).toBeTruthy()
    expect((testButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the test enabled and shows no warning once the value is saved', async () => {
    setField('googleAdsCustomerId', '4894896666')

    renderPanel()

    await waitFor(() => expect(screen.getByText(/Customer ID: 4894896666/)).toBeTruthy())
    expect(screen.queryByText(/Unsaved change above/)).toBeNull()
  })

  it('still allows Disconnect while an ID edit is pending', async () => {
    // Disconnect acts on the stored OAuth grant, not the field being typed.
    // Gating it on `unsaved` would trap a user who merely touched the input.
    setField('gscPropertyUrl', 'https://example.com/', 'https://edited.example/')
    formFields.gscConnected = { initialValue: true, value: true }

    renderPanel()

    await waitFor(() => expect(screen.getByText(/Unsaved change above/)).toBeTruthy())
    const disconnect = screen
      .getAllByRole('button')
      .find((b) => /disconnect/i.test(b.textContent || ''))
    expect(disconnect).toBeTruthy()
    expect((disconnect as HTMLButtonElement).disabled).toBe(false)
  })

  it('treats clearing a saved ID as an unsaved change too', async () => {
    // Removing the ID and not saving must not keep advertising it as configured.
    setField('googleAdsCustomerId', '4894896666', '')

    renderPanel()

    await waitFor(() => expect(screen.getByText(/Unsaved change above/)).toBeTruthy())
  })
})
