import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ContentImageWarnings from '@/components/ContentImageWarnings'
import { markdownImages, mediaFilenameFromUrl } from '@/lib/web-image-warnings'

const form: { fields: Record<string, { value: unknown }> } = { fields: {} }
vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T,>(selector: (state: [Record<string, { value: unknown }>]) => T): T => selector([form.fields]),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  form.fields = {}
})

describe('content image warnings', () => {
  it('finds CMS media filenames from local, absolute and Blob image URLs', () => {
    expect(mediaFilenameFromUrl('/api/media/file/chart%201.png')).toBe('chart 1.png')
    expect(mediaFilenameFromUrl('https://cms.optimisedigital.online/api/media/file/a.webp')).toBe('a.webp')
    expect(mediaFilenameFromUrl('https://abc.public.blob.vercel-storage.com/b.jpg')).toBe('b.jpg')
    expect(mediaFilenameFromUrl('https://example.com/photo.jpg')).toBeNull()
    expect(markdownImages('Intro\n\n![](/api/media/file/x.png) and ![Chart](/api/media/file/y.png "t")')).toEqual([
      { line: 3, alt: '', url: '/api/media/file/x.png', filename: 'x.png' },
      { line: 3, alt: 'Chart', url: '/api/media/file/y.png', filename: 'y.png' },
    ])
  })

  it('warns per image about files over 100 KB and missing alt text, with line numbers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          docs: [
            { filename: 'big.png', filesize: 240 * 1024, mimeType: 'image/png' },
            { filename: 'small.webp', filesize: 40 * 1024, mimeType: 'image/webp' },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    form.fields = {
      markdownContent: {
        value: '## Chart\n\n![Income chart](/api/media/file/big.png)\n\n![ ](/api/media/file/small.webp)\n\n![Logo](https://example.com/logo.png)',
      },
    }

    render(<ContentImageWarnings />)

    const box = await screen.findByText(/Image on line 3 \(big\.png\) is 240 KB, over the 100 KB limit/)
    expect(box.closest('[role="status"]')).toHaveTextContent('Image on line 5 (small.webp) has no alt text')
    expect(box.closest('[role="status"]')).toHaveTextContent("Image on line 7 is not a CMS upload, so its file size can't be checked")
    expect(box.closest('[role="status"]')).not.toHaveTextContent('small.webp) is')
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://cms.test')
    expect(url.pathname).toBe('/api/media')
    expect(url.searchParams.getAll('where[filename][in][0]')).toEqual(['big.png'])
    expect(url.searchParams.getAll('where[filename][in][1]')).toEqual(['small.webp'])
  })

  it('shows nothing when the content has no images', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    form.fields = { markdownContent: { value: '## Heading\n\nJust text.' } }
    const { container } = render(<ContentImageWarnings />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says when sizes cannot be checked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    form.fields = { markdownContent: { value: '![Chart](/api/media/file/c.png)' } }
    render(<ContentImageWarnings />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Could not check the content images' file sizes"))
  })
})
