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
  const currentValue = typeof value === 'string' ? value : ''
  const isReadOnly = readOnly || disabled
  valueRef.current = currentValue

  const addImages = async (files: File[], selection = textareaSelectionRef.current) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (isReadOnly || imageFiles.length === 0 || uploading) return

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
          Paste a graph or screenshot directly into the editor, or choose an image. Maximum 800 KB.
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
