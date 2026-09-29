import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MediaPublicImageLinkCell from '@/components/MediaPublicImageLinkCell'

const image = {
  id: 173,
  filename: 'Profile.webp',
  mimeType: 'image/webp',
  url: '/api/media/file/Profile.webp',
}

describe('MediaPublicImageLinkCell', () => {
  it('shows and copies an absolute URL for a saved image with a relative Payload URL', async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: copy },
    })
    render(<MediaPublicImageLinkCell rowData={image} />)

    const expected = `${window.location.origin}/api/media/file/Profile.webp`
    const link = await screen.findByRole('link', { name: expected })
    expect(link).toHaveAttribute('href', expected)
    fireEvent.click(screen.getByRole('button', { name: 'Copy public URL for Profile.webp' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied'))
    expect(copy).toHaveBeenCalledWith(expected)
  })

  it('keeps public blob URLs and does not claim videos have image links', () => {
    const blob = 'https://store.public.blob.vercel-storage.com/profile.webp'
    const { rerender } = render(<MediaPublicImageLinkCell rowData={{ ...image, url: blob }} />)
    expect(screen.getByRole('link', { name: blob })).toHaveAttribute('href', blob)

    rerender(<MediaPublicImageLinkCell rowData={{ ...image, mimeType: 'video/mp4' }} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
