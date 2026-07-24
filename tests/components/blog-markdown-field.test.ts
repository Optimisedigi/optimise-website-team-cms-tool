import { afterEach, describe, expect, it, vi } from 'vitest'

import { readClipboardImageFiles } from '../../src/lib/read-clipboard-image-files'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

describe('readClipboardImageFiles', () => {
  it('turns clipboard image data into an uploadable file', async () => {
    const image = new Blob(['image-data'], { type: 'image/png' })
    const read = vi.fn().mockResolvedValue([
      {
        types: ['text/plain', 'image/png'],
        getType: vi.fn().mockResolvedValue(image),
      },
    ])
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read },
    })

    const files = await readClipboardImageFiles()

    expect(read).toHaveBeenCalledOnce()
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      name: 'pasted-blog-image.png',
      type: 'image/png',
    })
  })

  it('ignores clipboard content that is not an image', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: vi.fn().mockResolvedValue([{ types: ['text/plain'] }]),
      },
    })

    await expect(readClipboardImageFiles()).resolves.toEqual([])
  })
})
