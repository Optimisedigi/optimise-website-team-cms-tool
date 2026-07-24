export async function readClipboardImageFiles(): Promise<File[]> {
  if (typeof navigator.clipboard?.read !== 'function') return []

  const clipboardItems = await navigator.clipboard.read()
  const files: File[] = []

  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (!imageType) continue

    const blob = await item.getType(imageType)
    const extension = imageType === 'image/jpeg' ? 'jpg' : imageType.split('/')[1] || 'png'
    files.push(new File([blob], `pasted-blog-image.${extension}`, { type: imageType }))
  }

  return files
}
