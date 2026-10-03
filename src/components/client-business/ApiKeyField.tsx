'use client'

import { useField } from '@payloadcms/ui'
import type { TextFieldClientProps } from 'payload'
import { useEffect, useRef, useState } from 'react'
import type React from 'react'

type CopyState = 'idle' | 'copied' | 'failed'

/** Read-only `apiKey` box with a Copy button. */
export default function ApiKeyField(props: TextFieldClientProps): React.ReactElement {
  const path = props.path || 'apiKey'
  const { value } = useField<string>({ path })
  const apiKey = typeof value === 'string' ? value : ''
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = `field-${path.replace(/\./g, '__')}`

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const flash = (next: CopyState): void => {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1500)
  }

  const copy = async (): Promise<void> => {
    if (!apiKey) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(apiKey)
      flash('copied')
    } catch {
      // Fall back to selecting the text so the user can copy manually.
      inputRef.current?.select()
      flash('failed')
    }
  }

  return (
    <div className="od-biz-field od-biz-apikey">
      <label className="od-biz-subhead" htmlFor={inputId}>
        API key <small>· auto-generated, read-only</small>
      </label>
      <div className="od-biz-apikey__row">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="od-biz-input od-biz-mono od-biz-apikey__value"
          value={apiKey}
          placeholder="Generated when the client is saved"
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="od-biz-btn od-biz-apikey__copy"
          disabled={!apiKey}
          aria-label={state === 'copied' ? 'API key copied' : 'Copy API key'}
          onClick={() => void copy()}
        >
          {state === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="od-biz-sr-only" aria-live="polite">
        {state === 'copied' ? 'API key copied to clipboard' : state === 'failed' ? 'Copy failed. The key is selected, press Ctrl+C or Cmd+C to copy.' : ''}
      </span>
      {state === 'failed' && <p className="od-biz-error">Couldn’t copy automatically. The key is selected — copy it manually.</p>}
    </div>
  )
}
