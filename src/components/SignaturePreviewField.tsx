'use client'

import { CodeField, useField } from '@payloadcms/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CodeFieldClient } from 'payload'

/**
 * Custom field for the `signatureHtml` field on the email-templates global.
 *
 * Renders the standard Payload code editor and adds a debounced live-preview
 * iframe below it. The iframe is sandboxed and renders the raw HTML exactly
 * as it would appear at the bottom of an outgoing email.
 */
const SignaturePreviewField: React.FC<{ field: CodeFieldClient; path: string }> = (props) => {
  const { value } = useField<string>({ path: props.path })
  const [debounced, setDebounced] = useState<string>(value ?? '')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value ?? ''), 300)
    return () => clearTimeout(t)
  }, [value])

  const srcDoc = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:16px;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#222;}</style></head><body>${debounced}</body></html>`,
    [debounced],
  )

  return (
    <div>
      <CodeField {...props} />
      <div
        style={{
          marginTop: 12,
          border: '1px solid var(--theme-elevation-100)',
          borderRadius: 6,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        <div
          style={{
            padding: '6px 12px',
            background: 'var(--theme-elevation-50)',
            fontSize: 12,
            color: 'var(--theme-elevation-600)',
            fontWeight: 600,
          }}
        >
          Live preview
        </div>
        <iframe
          ref={iframeRef}
          title="Signature preview"
          srcDoc={srcDoc}
          sandbox=""
          style={{ width: '100%', minHeight: 220, border: 0, background: '#fff' }}
        />
      </div>
    </div>
  )
}

export default SignaturePreviewField
