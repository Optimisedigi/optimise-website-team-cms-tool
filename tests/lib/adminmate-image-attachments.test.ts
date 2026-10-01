import { describe, expect, it } from 'vitest'
import {
  MAX_ADMINMATE_IMAGE_BYTES,
  parseAdminMateImageAttachments,
} from '@/lib/agents/adminmate/image-attachments'

const png = { name: 'contract.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }
/** Base64 of `length` chars that starts with a real PNG signature. */
const pngOf = (length: number) => `iVBORw0KGgoA${'A'.repeat(length - 12)}`

describe('parseAdminMateImageAttachments', () => {
  it('accepts no images', () => {
    expect(parseAdminMateImageAttachments(undefined)).toEqual({ ok: true, value: [] })
  })

  it.each([
    ['image/jpeg', '/9j/4AAQSkZJRgABAQ=='],
    ['image/gif', 'R0lGODlhAQABAAAAACw='],
    ['image/webp', 'UklGRgAAAABXRUJQVlA4IA=='],
  ])('accepts real %s data', (mediaType, data) => {
    expect(parseAdminMateImageAttachments([{ name: 'x', mediaType, data }]).ok).toBe(true)
  })

  it('keeps valid images and cleans the name', () => {
    expect(parseAdminMateImageAttachments([{ ...png, name: ' shot\n1.png ' }])).toEqual({
      ok: true,
      value: [{ name: 'shot 1.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
    })
  })

  it.each([
    ['not an array', { ...png }, /must be an array/],
    ['too many images', [png, png, png, png], /up to 3/],
    ['unsupported type', [{ ...png, mediaType: 'image/svg+xml' }], /Unsupported image type/],
    ['non-base64 data', [{ ...png, data: 'not base64!' }], /base64/],
    [
      'oversized image',
      [{ ...png, data: pngOf((Math.floor(MAX_ADMINMATE_IMAGE_BYTES / 3) + 1) * 4) }],
      /2 MB/,
    ],
    [
      'too large in total',
      [
        { ...png, data: pngOf(2_000_000) },
        { ...png, data: pngOf(2_000_000) },
        { ...png, data: pngOf(400) },
      ],
      /too large in total/,
    ],
    [
      'a type that does not match the bytes',
      [{ ...png, mediaType: 'image/jpeg' }],
      /does not match/,
    ],
    [
      'WebP header without the WEBP marker',
      [{ ...png, mediaType: 'image/webp', data: 'UklGRgAAAABBQkNE' }],
      /does not match/,
    ],
  ])('rejects %s', (_label, input, error) => {
    const result = parseAdminMateImageAttachments(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(error)
  })
})
