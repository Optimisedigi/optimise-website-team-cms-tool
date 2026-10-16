import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import FeaturedImageWarnings from '@/components/FeaturedImageWarnings'

const form: { fields: Record<string, { value: unknown }> } = { fields: {} }
vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T,>(selector: (state: [Record<string, { value: unknown }>]) => T): T => selector([form.fields]),
}))

const mediaResponse = (body: Record<string, unknown>) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))

afterEach(() => {
  vi.unstubAllGlobals()
  form.fields = {}
})

describe('FeaturedImageWarnings', () => {
  it('warns to re-upload an image over 100 KB and to add missing alt text', async () => {
    const fetchMock = mediaResponse({ id: 7, filesize: 350 * 1024, mimeType: 'image/png' })
    vi.stubGlobal('fetch', fetchMock)
    form.fields = { featuredImage: { value: 7 }, featuredImageAlt: { value: '  ' } }

    render(<FeaturedImageWarnings />)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('This image is 350 KB, over the 100 KB limit'))
    expect(screen.getByRole('status')).toHaveTextContent('re-upload it')
    expect(screen.getByRole('status')).toHaveTextContent('No alt text')
    expect(fetchMock).toHaveBeenCalledWith('/api/media/7?depth=0', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('shows nothing for a web-sized image with alt text, or when no image is chosen', async () => {
    const fetchMock = mediaResponse({ id: 7, filesize: 100 * 1024, mimeType: 'image/webp' })
    vi.stubGlobal('fetch', fetchMock)
    form.fields = { featuredImage: { value: 7 }, featuredImageAlt: { value: 'Actor reviewing a tax return' } }
    const { container, rerender } = render(<FeaturedImageWarnings />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()

    form.fields = { featuredImage: { value: null }, featuredImageAlt: { value: '' } }
    rerender(<FeaturedImageWarnings />)
    expect(container).toBeEmptyDOMElement()
  })

  it('uses a populated upload value without fetching, and says when the size cannot be checked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    form.fields = { featuredImage: { value: { id: 3, filesize: 120 * 1024, mimeType: 'image/jpeg' } }, featuredImageAlt: { value: 'Alt' } }
    const { rerender } = render(<FeaturedImageWarnings />)
    expect(screen.getByRole('status')).toHaveTextContent('This image is 120 KB')
    expect(fetchMock).not.toHaveBeenCalled()

    form.fields = { featuredImage: { value: 4 }, featuredImageAlt: { value: 'Alt' } }
    rerender(<FeaturedImageWarnings />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not check this image'))
  })
})
