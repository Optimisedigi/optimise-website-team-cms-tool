import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MediaPublicImageLink from '@/components/MediaPublicImageLink'

const documentData: Record<string, unknown> = {}
vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ data: documentData }),
}))

describe('MediaPublicImageLink', () => {
  it('shows a full copyable public URL for a saved local image', async () => {
    documentData.mimeType = 'image/png'
    documentData.url = '/api/media/file/photo.png'
    const copy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: copy },
    })

    render(<MediaPublicImageLink />)

    const expected = new URL('/api/media/file/photo.png', window.location.origin).href
    expect(screen.getByRole('textbox', { name: 'Public image URL' })).toHaveProperty(
      'value',
      expected,
    )
    expect(screen.getByRole('link', { name: 'Open image' })).toHaveAttribute('href', expected)
    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('URL copied'))
    expect(copy).toHaveBeenCalledWith(expected)
  })

  it('keeps the URL selectable and allows retry if copying fails', async () => {
    documentData.mimeType = 'image/png'
    documentData.url = '/api/media/file/photo.png'
    const copy = vi
      .fn()
      .mockRejectedValueOnce(new Error('clipboard unavailable'))
      .mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: copy },
    })

    render(<MediaPublicImageLink />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not copy'))
    expect(screen.getByRole('textbox', { name: 'Public image URL' })).toHaveProperty(
      'readOnly',
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('URL copied'))
    expect(copy).toHaveBeenCalledTimes(2)
  })

  it('uses the blob URL directly and never shows a public link for videos', () => {
    documentData.mimeType = 'image/jpeg'
    documentData.url = 'https://store.public.blob.vercel-storage.com/photo.jpg'
    const { rerender } = render(<MediaPublicImageLink />)
    expect(screen.getByRole('textbox', { name: 'Public image URL' })).toHaveProperty(
      'value',
      documentData.url,
    )

    documentData.mimeType = 'video/mp4'
    rerender(<MediaPublicImageLink />)
    expect(screen.queryByRole('textbox', { name: 'Public image URL' })).toBeNull()
  })

  it('does not expose an unsafe URL and waits until the image is saved', () => {
    documentData.mimeType = 'image/png'
    documentData.url = 'javascript:alert(1)'
    const { rerender } = render(<MediaPublicImageLink />)
    expect(screen.queryByRole('link', { name: 'Open image' })).toBeNull()

    documentData.url = '/\\example.com/photo.png'
    rerender(<MediaPublicImageLink />)
    expect(screen.queryByRole('link', { name: 'Open image' })).toBeNull()

    documentData.url = null
    rerender(<MediaPublicImageLink />)
    expect(screen.getByText('Save the image to get its public URL.')).toBeTruthy()
  })
})
