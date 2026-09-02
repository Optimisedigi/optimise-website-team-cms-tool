import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AdminMateChat from '@/components/AdminMateChat'

vi.mock('@/components/OptiMateTranscribe', () => ({
  default: ({ onTranscript }: { onTranscript: (text: string) => void }) => <button type="button" onClick={() => onTranscript('dictated client')}>Dictate</button>,
}))

const staged = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  websiteUrl: 'https://acmecorp.com',
  services: ['google_ads'],
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.com',
  clientType: 'recurring',
  monthlyRetainer: 2000,
  isActive: true,
}
const response = (body: unknown, ok = true) => ({ ok, json: async () => body })

describe('AdminMateChat', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('stages a client, applies edits, and creates it once', async () => {
    let resolveCreate: ((value: ReturnType<typeof response>) => void) | undefined
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/optimate/adminmate/chat') {
        return Promise.resolve(response({ reply: 'Review it.', stagedClient: staged, similarClients: [{ id: '9', name: 'Acme Pty Ltd', slug: 'acme-pty-ltd' }] }))
      }
      if (url === '/api/optimate/adminmate/create-client') return new Promise((resolve) => { resolveCreate = resolve })
      throw new Error(`Unexpected fetch ${url}`)
    })
    render(<AdminMateChat />)

    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
    expect(screen.getByLabelText('Message AdminMate')).toHaveValue('dictated client')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('button', { name: 'Create Acme Corp' })).toBeInTheDocument()
    expect(screen.getByText(/Possible duplicate: Acme Pty Ltd/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'acme-corp-au' } })
    fireEvent.change(screen.getByLabelText('Internal notes'), { target: { value: 'VIP — invoice via accounts@' } })
    fireEvent.change(screen.getByLabelText('Setup fee ($)'), { target: { value: '1500' } })
    fireEvent.click(screen.getByLabelText('SEO'))
    const createButton = screen.getByRole('button', { name: 'Create Acme Corp' })
    fireEvent.click(createButton)
    fireEvent.click(createButton)

    const createCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/optimate/adminmate/create-client')
    expect(createCalls).toHaveLength(1)
    expect(JSON.parse(createCalls[0][1].body as string)).toMatchObject({ slug: 'acme-corp-au', services: ['google_ads', 'seo'], notes: 'VIP — invoice via accounts@', setupFee: 1500 })

    resolveCreate?.(response({ id: 11, name: 'Acme Corp', slug: 'acme-corp-au' }))
    expect(await screen.findByText(/Created Acme Corp/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Acme Corp' })).not.toBeInTheDocument()
  })

  it('keeps the staged card when creation fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/optimate/adminmate/chat') return Promise.resolve(response({ reply: 'Review it.', stagedClient: staged }))
      return Promise.resolve(response({ error: 'Slug "acme-corp" is already used by Acme Corp.' }, false))
    })
    render(<AdminMateChat />)

    fireEvent.change(screen.getByLabelText('Message AdminMate'), { target: { value: 'create client Acme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create Acme Corp' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already used by Acme Corp')
    expect(screen.getByRole('button', { name: 'Create Acme Corp' })).toBeInTheDocument()
  })
})
