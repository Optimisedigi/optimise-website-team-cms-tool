import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TeamTaskDetailPane from '@/components/TeamTaskDetailPane'

const screenshot = {
  id: 'shot-1',
  label: 'homepage-review.png',
  url: '/media/homepage-review.webp',
  thumbnailUrl: '/media/homepage-review-400x300.webp',
  mediaId: 91,
}

function detailResponse(screenshots = [screenshot]) {
  return {
    task: {
      id: 7,
      title: 'Review homepage',
      status: 'in_progress',
      instructions: '',
      relatedLinks: [],
      screenshots,
    },
    comments: [],
    users: [],
    currentUser: { id: 1, name: 'Tester' },
    canManage: true,
  }
}

describe('TeamTaskDetailPane screenshots', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows a large hover preview and links to the original image', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => detailResponse(),
    } as Response)

    render(<TeamTaskDetailPane taskId={7} onClose={() => undefined} />)

    const imageLink = await screen.findByRole('link', { name: 'homepage-review.png' })
    expect(imageLink).toHaveAttribute('href', screenshot.url)

    fireEvent.mouseEnter(imageLink.parentElement!.parentElement!)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('uploads a selected image and refreshes the task screenshots', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => detailResponse([]) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ screenshot, task: detailResponse().task }) } as Response)

    const { container } = render(<TeamTaskDetailPane taskId={7} onClose={() => undefined} />)
    await screen.findByText('Add PNG, JPEG, or WebP images up to 8 MB each.')

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['image'], 'homepage-review.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await screen.findByRole('link', { name: 'homepage-review.png' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/team-tasks/7/screenshots')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
  })

  it('permanently deletes the stored media after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => detailResponse() } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ task: detailResponse([]).task }) } as Response)

    render(<TeamTaskDetailPane taskId={7} onClose={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete homepage-review.png permanently' }))

    await screen.findByText('Add PNG, JPEG, or WebP images up to 8 MB each.')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/team-tasks/7/screenshots')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ mediaId: screenshot.mediaId }),
    })
  })
})
