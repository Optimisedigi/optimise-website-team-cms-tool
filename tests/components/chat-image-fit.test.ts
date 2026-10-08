import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitImageForChat } from '@/components/chat-image-fit'

const FIT = { maxBytes: 1_000_000, maxEdge: 1568 }

function fileOfSize(bytes: number, type = 'image/png', name = 'big.png'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

/** jsdom has no image decoding or canvas; fake both. Encoded size scales with pixel count. */
function stubImagePipeline(width: number, height: number, bytesPerPixel: number) {
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close })),
  )
  const drawn: Array<{ width: number; height: number; quality: number }> = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    _type?: string,
    quality?: number,
  ) {
    drawn.push({ width: this.width, height: this.height, quality: quality ?? 1 })
    callback(
      new Blob([new Uint8Array(Math.round(this.width * this.height * bytesPerPixel))], {
        type: 'image/jpeg',
      }),
    )
  })
  return { drawn, close }
}

describe('fitImageForChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('accepts a huge image by shrinking it under the byte cap instead of rejecting it', async () => {
    const { drawn, close } = stubImagePipeline(6000, 4000, 0.2)

    const result = await fitImageForChat(fileOfSize(12 * 1024 * 1024), 'big.png', FIT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mediaType).toBe('image/jpeg')
    expect(result.value.size).toBeLessThanOrEqual(FIT.maxBytes)
    expect(drawn[0]).toMatchObject({ width: 1568, height: 1045 })
    expect(close).toHaveBeenCalled()
  })

  it('steps the size down until it fits when the first pass is still too big', async () => {
    const { drawn } = stubImagePipeline(4000, 4000, 1)

    const result = await fitImageForChat(fileOfSize(8 * 1024 * 1024), 'photo.png', FIT)

    expect(result.ok).toBe(true)
    expect(drawn.length).toBeGreaterThan(1)
    expect(drawn[1]?.width).toBeLessThan(drawn[0]?.width ?? 0)
  })

  it('sends small images untouched in their original format', async () => {
    const { drawn } = stubImagePipeline(800, 600, 0.2)

    const result = await fitImageForChat(fileOfSize(200_000), 'small.png', FIT)

    expect(result).toMatchObject({ ok: true, value: { mediaType: 'image/png', size: 200_000 } })
    expect(drawn).toHaveLength(0)
  })

  it('rejects unsupported file types', async () => {
    const result = await fitImageForChat(fileOfSize(10, 'image/svg+xml', 'x.svg'), 'x.svg', FIT)

    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/not a supported image type/),
    })
  })
})
