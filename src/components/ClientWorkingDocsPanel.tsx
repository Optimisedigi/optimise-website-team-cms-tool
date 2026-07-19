'use client'

import { useAuth, useFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

type ChangeLogEntry = {
  id?: string | null
  savedAt: string
  savedBy?: string | null
  summary?: string | null
}

type WorkingDoc = {
  id: string | number
  slug: string
  title: string
  contentMarkdown: string
  lastEditedBy?: string | null
  lastSavedAt?: string | null
  updatedAt: string
  changeLog?: ChangeLogEntry[] | null
}

function editorName(user: unknown): string {
  if (!user || typeof user !== 'object') return 'CMS user'
  const record = user as { name?: string | null; email?: string | null }
  return record.name?.trim() || record.email?.trim() || 'CMS user'
}

function readableDate(value?: string | null): string {
  if (!value) return 'Not saved yet'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ClientWorkingDocsPanel() {
  const clientSlug = useFormFields(([fields]) => String(fields.slug?.value ?? '').trim())
  const { user } = useAuth()
  const [docs, setDocs] = useState<WorkingDoc[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const loadDocs = useCallback(
    async (signal?: AbortSignal) => {
      if (!clientSlug) {
        setDocs([])
        setDrafts({})
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const response = await fetch(
          `/api/shared-working-docs?where[clientSlug][equals]=${encodeURIComponent(clientSlug)}&sort=-updatedAt&limit=50&depth=0`,
          { signal },
        )
        if (!response.ok) throw new Error('Could not load this client’s working documents.')
        const result = (await response.json()) as { docs?: WorkingDoc[] }
        const nextDocs = result.docs ?? []
        setDocs(nextDocs)
        setDrafts(Object.fromEntries(nextDocs.map((doc) => [String(doc.id), doc.contentMarkdown])))
      } catch (loadError) {
        if ((loadError as Error).name !== 'AbortError') {
          setError(
            loadError instanceof Error ? loadError.message : 'Could not load working documents.',
          )
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [clientSlug],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadDocs(controller.signal)
    return () => controller.abort()
  }, [loadDocs])

  async function saveDoc(doc: WorkingDoc) {
    const id = String(doc.id)
    const contentMarkdown = drafts[id]?.trim()
    if (!contentMarkdown) {
      setError('Document content cannot be empty.')
      return
    }
    setSavingId(id)
    setSavedId(null)
    setError('')
    const now = new Date().toISOString()
    const savedBy = editorName(user)
    try {
      const response = await fetch(`/api/shared-working-docs/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentMarkdown,
          lastEditedBy: savedBy,
          lastSavedAt: now,
          changeLog: [
            {
              savedAt: now,
              savedBy,
              summary: 'Saved from the client profile Working Docs tab.',
            },
            ...(doc.changeLog ?? []),
          ].slice(0, 50),
        }),
      })
      if (!response.ok) throw new Error('Could not save the working document.')
      const result = (await response.json()) as { doc: WorkingDoc } | WorkingDoc
      const updated = 'doc' in result ? result.doc : result
      setDocs((current) => current.map((item) => (String(item.id) === id ? updated : item)))
      setDrafts((current) => ({ ...current, [id]: updated.contentMarkdown }))
      setSavedId(id)
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Could not save the working document.',
      )
    } finally {
      setSavingId(null)
    }
  }

  if (!clientSlug) {
    return (
      <div className="working-docs-state">
        Save the client profile before adding working documents.
      </div>
    )
  }

  return (
    <section className="working-docs-panel" aria-labelledby="working-docs-heading">
      <div className="working-docs-heading-row">
        <div>
          <h2 id="working-docs-heading">Shared working documents</h2>
          <p>
            Edit client-facing Markdown here. The PIN-protected client view uses the same saved
            document.
          </p>
        </div>
        <button className="working-docs-refresh" type="button" onClick={() => void loadDocs()}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="working-docs-error" role="alert">
          {error}
        </div>
      ) : null}
      {loading ? <div className="working-docs-state">Loading working documents…</div> : null}

      {!loading && docs.length === 0 ? (
        <div className="working-docs-empty">
          <h3>No working documents yet</h3>
          <p>
            A document appears here after its PIN-protected client view is opened for the first
            time.
          </p>
          {clientSlug === 'cipher' ? (
            <a href="/cipher/patient-journey-review" target="_blank" rel="noreferrer">
              Open Cipher working document
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="working-docs-list">
        {docs.map((doc) => {
          const id = String(doc.id)
          const dirty = drafts[id] !== doc.contentMarkdown
          return (
            <article className="working-doc-card" key={id}>
              <div className="working-doc-meta">
                <div>
                  <h3>{doc.title}</h3>
                  <p>
                    Last saved {readableDate(doc.lastSavedAt ?? doc.updatedAt)}
                    {doc.lastEditedBy ? ` by ${doc.lastEditedBy}` : ''}
                  </p>
                </div>
                <a href={`/${doc.slug}`} target="_blank" rel="noreferrer">
                  Open client view
                </a>
              </div>
              <label htmlFor={`working-doc-${id}`}>Markdown content</label>
              <textarea
                id={`working-doc-${id}`}
                value={drafts[id] ?? ''}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [id]: event.target.value }))
                }
                spellCheck
              />
              <div className="working-doc-actions">
                <span aria-live="polite">
                  {savedId === id ? 'Saved' : dirty ? 'Unsaved changes' : 'Up to date'}
                </span>
                <button
                  type="button"
                  disabled={!dirty || savingId === id}
                  onClick={() => void saveDoc(doc)}
                >
                  {savingId === id ? 'Saving…' : 'Save document'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <style>{`
        .working-docs-panel { display: grid; gap: 20px; padding-block: 8px 32px; }
        .working-docs-heading-row, .working-doc-meta, .working-doc-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .working-docs-panel h2, .working-docs-panel h3, .working-docs-panel p { margin: 0; }
        .working-docs-panel h2 { color: var(--theme-text); font-size: 22px; }
        .working-docs-heading-row p, .working-doc-meta p, .working-docs-empty p { color: var(--theme-elevation-600); margin-top: 6px; }
        .working-docs-refresh, .working-doc-card button, .working-docs-panel a { border: 1px solid var(--theme-elevation-300); border-radius: 6px; background: var(--theme-elevation-0); color: var(--theme-text); cursor: pointer; font: inherit; font-weight: 600; padding: 9px 13px; text-decoration: none; transition: background-color 120ms ease, border-color 120ms ease; }
        .working-docs-refresh:hover, .working-docs-panel a:hover { background: var(--theme-elevation-50); border-color: var(--theme-elevation-500); }
        .working-docs-state, .working-docs-empty, .working-docs-error { border: 1px solid var(--theme-elevation-200); border-radius: 8px; padding: 20px; }
        .working-docs-error { border-color: var(--theme-error-400); color: var(--theme-error-700); }
        .working-docs-empty { display: grid; justify-items: start; gap: 12px; }
        .working-docs-list { display: grid; gap: 20px; }
        .working-doc-card { display: grid; gap: 12px; border: 1px solid var(--theme-elevation-200); border-radius: 8px; background: var(--theme-elevation-0); padding: 20px; }
        .working-doc-card label { color: var(--theme-elevation-700); font-size: 13px; font-weight: 600; }
        .working-doc-card textarea { box-sizing: border-box; min-height: 420px; width: 100%; resize: vertical; border: 1px solid var(--theme-elevation-300); border-radius: 6px; background: var(--theme-input-bg); color: var(--theme-text); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; line-height: 1.55; padding: 14px; }
        .working-doc-card textarea:focus-visible, .working-docs-panel button:focus-visible, .working-docs-panel a:focus-visible { outline: 2px solid var(--theme-success-500); outline-offset: 2px; }
        .working-doc-actions span { color: var(--theme-elevation-600); font-size: 13px; }
        .working-doc-card button { background: var(--theme-success-600); border-color: var(--theme-success-600); color: white; }
        .working-doc-card button:disabled { cursor: not-allowed; opacity: .5; }
        @media (max-width: 768px) { .working-docs-heading-row, .working-doc-meta { align-items: flex-start; flex-direction: column; } .working-doc-card textarea { min-height: 320px; } }
        @media (prefers-reduced-motion: reduce) { .working-docs-panel button, .working-docs-panel a { transition-duration: 0ms; } }
      `}</style>
    </section>
  )
}
