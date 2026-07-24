'use client'

import type { TextareaFieldClientProps } from 'payload'

import { TextareaInput, useField } from '@payloadcms/ui'
import React, { useRef, useState } from 'react'

function imageAltFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function uploadBlogImage(file: File): Promise<{ alt: string; url: string }> {
  const alt = imageAltFromFilename(file.name) || 'Blog image'
  const formData = new FormData()
  formData.append('file', file)
  formData.append('_payload', JSON.stringify({ alt, caption: '' }))

  const response = await fetch('/api/media', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  })
  const result = await response.json().catch(() => null)

  if (!response.ok) {
    const message = result?.errors?.[0]?.message || result?.message || 'Image upload failed.'
    throw new Error(message)
  }

  const document = result?.doc ?? result
  if (typeof document?.url !== 'string' || !document.url) {
    throw new Error('The image uploaded, but no image URL was returned.')
  }

  return { alt, url: document.url }
}

function insertAtSelection(value: string, markdown: string, start: number, end: number): string {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const leadingBreak = before.length > 0 && !before.endsWith('\n') ? '\n\n' : ''
  const trailingBreak = after.length > 0 && !after.startsWith('\n') ? '\n\n' : ''
  return `${before}${leadingBreak}${markdown}${trailingBreak}${after}`
}

export function BlogMarkdownField(props: TextareaFieldClientProps): React.ReactElement {
  const { field, path: pathFromProps, readOnly } = props
  const {
    customComponents: { Description, Error: ErrorComponent, Label } = {},
    disabled,
    path,
    setValue,
    showError,
    value,
  } = useField<string>({ potentiallyStalePath: pathFromProps })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaSelectionRef = useRef({ start: 0, end: 0 })
  const valueRef = useRef('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState<string[]>([])
  const currentValue = typeof value === 'string' ? value : ''
  const markdownImages = Array.from(
    currentValue.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g),
    (match) => ({ alt: match[1] || 'Blog image', url: match[2] }),
  )
  const isReadOnly = readOnly || disabled
  valueRef.current = currentValue

  const addImages = async (files: File[], selection = textareaSelectionRef.current) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (isReadOnly || imageFiles.length === 0 || uploading) return

    const localPreviewUrls = imageFiles.map((file) => URL.createObjectURL(file))
    setPendingPreviewUrls((existing) => [...existing, ...localPreviewUrls])
    setUploading(true)
    setMessage(`Uploading ${imageFiles.length === 1 ? 'image' : `${imageFiles.length} images`}...`)
    try {
      const images = await Promise.all(imageFiles.map(uploadBlogImage))
      const markdown = images.map((image) => `![${image.alt}](${image.url})`).join('\n\n')
      setValue(insertAtSelection(valueRef.current, markdown, selection.start, selection.end))
      setMessage(
        `${imageFiles.length === 1 ? 'Image' : 'Images'} added. Update the alt text between [ ] if needed.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Image upload failed.')
    } finally {
      setPendingPreviewUrls((existing) => existing.filter((url) => !localPreviewUrls.includes(url)))
      localPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div
      onPasteCapture={(event) => {
        const clipboardFiles = Array.from(event.clipboardData.files)
        const itemFiles = Array.from(event.clipboardData.items)
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
        const files = (clipboardFiles.length > 0 ? clipboardFiles : itemFiles).filter((file) =>
          file.type.startsWith('image/'),
        )
        if (files.length === 0) return
        event.preventDefault()
        const target = event.target as HTMLTextAreaElement
        void addImages(files, {
          start:
            typeof target.selectionStart === 'number' ? target.selectionStart : currentValue.length,
          end: typeof target.selectionEnd === 'number' ? target.selectionEnd : currentValue.length,
        })
      }}
      onSelectCapture={(event) => {
        const target = event.target as HTMLTextAreaElement
        if (target.tagName !== 'TEXTAREA') return
        textareaSelectionRef.current = {
          start: target.selectionStart,
          end: target.selectionEnd,
        }
      }}
    >
      <TextareaInput
        Description={Description}
        Error={ErrorComponent}
        Label={Label}
        description={field.admin?.description}
        label={field.label}
        localized={field.localized}
        onChange={(event) => setValue(event.target.value)}
        path={path}
        placeholder={
          typeof field.admin?.placeholder === 'string' ? field.admin.placeholder : undefined
        }
        readOnly={isReadOnly}
        required={field.required}
        rows={field.admin?.rows ?? 24}
        showError={showError}
        value={currentValue}
      />
      {(markdownImages.length > 0 || pendingPreviewUrls.length > 0) && (
        <div
          aria-label="Images in this blog post"
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            marginTop: 12,
          }}
        >
          {pendingPreviewUrls.map((url) => (
            <div key={url} style={{ position: 'relative' }}>
              <img
                src={url}
                alt="Uploading preview"
                style={{
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 4,
                  display: 'block',
                  height: 'auto',
                  maxHeight: 420,
                  objectFit: 'contain',
                  width: '100%',
                }}
              />
              <span
                style={{
                  background: 'var(--theme-elevation-900)',
                  borderRadius: 3,
                  color: 'var(--theme-elevation-0)',
                  fontSize: 12,
                  insetBlockStart: 8,
                  insetInlineEnd: 8,
                  padding: '4px 7px',
                  position: 'absolute',
                }}
              >
                Uploading...
              </span>
            </div>
          ))}
          {markdownImages.map((image, index) => (
            <img
              key={`${image.url}-${index}`}
              src={image.url}
              alt={image.alt}
              style={{
                border: '1px solid var(--theme-elevation-150)',
                borderRadius: 4,
                display: 'block',
                height: 'auto',
                maxHeight: 420,
                objectFit: 'contain',
                width: '100%',
              }}
            />
          ))}
        </div>
      )}
      <div
        style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 }}
      >
        <button
          type="button"
          className="btn btn--size-small btn--style-secondary"
          disabled={isReadOnly || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Uploading...' : 'Add image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void addImages(Array.from(event.target.files ?? []))}
        />
        <span style={{ color: 'var(--theme-elevation-600)', fontSize: 13 }}>
          Paste a graph or screenshot directly into the editor, or choose an image. It will appear
          above after pasting. Maximum 800 KB.
        </span>
      </div>
      <div
        aria-live="polite"
        style={{ minHeight: 20, marginTop: 4, fontSize: 13, color: 'var(--theme-elevation-700)' }}
      >
        {message}
      </div>
    </div>
  )
}
