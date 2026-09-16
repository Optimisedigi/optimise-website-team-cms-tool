'use client'

import { useEffect, useState, useRef } from 'react'
import { buildBlogPrompt, findCategoryTone, parsePromptLines } from '@/lib/blog-prompter'
import VoiceField from './VoiceField'
import './BlogPrompterPage.css'

// ─── Types ────────────────────────────────────────────────

interface BlogCategoryTone {
  category?: string | null
  tone?: string | null
}

interface Client {
  id: string | number
  name: string
  blogCategories: string
  blogTags: string
  servicePages: string
  blogTone: string
  blogCategoryTones: BlogCategoryTone[]
}

interface BlogSettingsState {
  globalBlogRules: string
  globalMarkdownRules: string
}

interface BriefFields {
  blogIdea: string
  titleIdea: string
  category: string
  tag: string
  mainPoint: string
  keyPoints: string
  primaryKeywords: string
  secondaryKeywords: string
  pointsToAvoid: string
  targetAudience: string
  supportingContent: string
}

interface SavedBrief extends BriefFields {
  id: string | number
  client?: string | number | { id?: string | number } | null
  generatedPrompt?: string
  createdAt?: string
  archivedAt?: string
  source?: string
  workflowStatus?: 'idea_phase' | 'in_progress' | 'published' | null
  blogPost?: string | number | { id?: string | number } | null
}

// ─── Helpers ──────────────────────────────────────────────

function stripBlogPrefix(text: string): string {
  return text.replace(/^[A-Za-z][A-Za-z\s]{0,20}:\s*/, '')
}

function briefStatus(brief: SavedBrief): string {
  if (brief.workflowStatus === 'published') return 'Published'
  if (brief.workflowStatus === 'in_progress') return 'In progress'
  return 'Idea phase'
}

// ─── Compact prompt output box ────────────────────────────

function OutputBox({ label, value, footer, draftUrl }: { label: string; value: string; footer?: string; draftUrl?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="blog-prompter__prompt">
      <div className="blog-prompter__prompt-top">
        <span className="blog-prompter__prompt-label">{label}</span>
        <button className="blog-prompter__copy" type="button" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0} aria-label={label}>{value}</pre>
      {footer && <div className="blog-prompter__prompt-footer">{footer}</div>}
      {draftUrl && <a className="blog-prompter__prompt-link" href={draftUrl}>Open draft Blog Post</a>}
    </div>
  )
}

function PromptBox({ prompt }: { prompt: string }) {
  return <OutputBox label="Generated prompt" value={prompt} />
}

function MarkdownOutputBox({ markdown, draftUrl }: { markdown: string; draftUrl?: string }) {
  return (
    <OutputBox
      label="Generated blog markdown"
      value={markdown}
      footer="This markdown has been added to the Blog Post draft import box for the selected client."
      draftUrl={draftUrl}
    />
  )
}

// ─── Empty fields ─────────────────────────────────────────

const emptyFields: BriefFields = {
  blogIdea: '',
  titleIdea: '',
  category: '',
  tag: '',
  mainPoint: '',
  keyPoints: '',
  primaryKeywords: '',
  secondaryKeywords: '',
  pointsToAvoid: '',
  targetAudience: '',
  supportingContent: '',
}

// ─── Main component ───────────────────────────────────────

const BlogPrompterPage = () => {
  const [fields, setFields] = useState<BriefFields>(emptyFields)
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [briefs, setBriefs] = useState<SavedBrief[]>([])
  const [loadingBriefs, setLoadingBriefs] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedBrief, setSelectedBrief] = useState<SavedBrief | null>(null)
  const selectedBriefRef = useRef<HTMLDivElement>(null)
  const [deletingId, setDeletingId] = useState<string | number | null>(null)
  const [publishingId, setPublishingId] = useState<string | number | null>(null)
  const [showProposed, setShowProposed] = useState(false)
  const [showPublishedProposed, setShowPublishedProposed] = useState(false)
  const [proposedTagFilter, setProposedTagFilter] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestMsg, setSuggestMsg] = useState('')
  const [suggestElapsed, setSuggestElapsed] = useState(0)
  const suggestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [blogSettings, setBlogSettings] = useState<BlogSettingsState | null>(null)
  const [generatedBlogMarkdown, setGeneratedBlogMarkdown] = useState('')
  const [generatingBlog, setGeneratingBlog] = useState(false)
  const [generateBlogMsg, setGenerateBlogMsg] = useState('')
  const [generatedDraftUrl, setGeneratedDraftUrl] = useState('')

  const selectedClient = clients.find((c) => String(c.id) === selectedClientId) ?? null
  const clientCategories = selectedClient ? parsePromptLines(selectedClient.blogCategories) : []
  const clientTags = selectedClient ? parsePromptLines(selectedClient.blogTags) : []
  const categoryBlogTone = findCategoryTone(selectedClient?.blogCategoryTones, fields.category)

  const buildCurrentPrompt = (nextFields: BriefFields = fields) => buildBlogPrompt(nextFields, {
    clientName: selectedClient?.name,
    servicePages: selectedClient?.servicePages,
    globalBlogRules: blogSettings?.globalBlogRules,
    globalMarkdownRules: blogSettings?.globalMarkdownRules,
    clientBlogTone: selectedClient?.blogTone,
    categoryBlogTone: findCategoryTone(selectedClient?.blogCategoryTones, nextFields.category),
  })

  const activeBriefs = briefs.filter((b) => b.source !== 'topic-clusters' && !b.archivedAt && b.workflowStatus !== 'published')
  const blogIdeaProposedBriefs = briefs.filter((b) => b.source === 'topic-clusters' && b.workflowStatus !== 'published')
  const publishedProposedBriefs = briefs.filter((b) => b.source === 'topic-clusters' && b.workflowStatus === 'published')
  const proposedBaseBriefs = showPublishedProposed ? publishedProposedBriefs : blogIdeaProposedBriefs
  const proposedTagOptions = Array.from(new Set(proposedBaseBriefs.map((b) => b.tag?.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const proposedBriefs = proposedTagFilter
    ? proposedBaseBriefs.filter((b) => b.tag?.trim() === proposedTagFilter)
    : proposedBaseBriefs

  const set = (key: keyof BriefFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setFields((prev) => ({ ...prev, [key]: e.target.value }))

  const handleClientChange = (id: string) => {
    setSelectedClientId(id)
    setSelectedBrief(null)
    setShowPublishedProposed(false)
    setProposedTagFilter('')
    setBriefs([])
    setGeneratedBlogMarkdown('')
    setGeneratedDraftUrl('')
    const client = clients.find((c) => String(c.id) === id) ?? null
    const cats = client ? parsePromptLines(client.blogCategories) : []
    const tags = client ? parsePromptLines(client.blogTags) : []
    setFields((prev) => ({
      ...prev,
      category: cats.length > 0 ? (cats.includes(prev.category) ? prev.category : '') : prev.category,
      tag: tags.length > 0 ? (tags.includes(prev.tag) ? prev.tag : '') : prev.tag,
    }))
  }

  const handleGenerate = () => {
    setPrompt(buildCurrentPrompt())
  }

  // AI-populate every field except client and category, based on the Blog Idea.
  // Only fills fields that are currently empty so manual edits are never lost.
  const handleSuggest = async () => {
    if (!fields.blogIdea.trim()) {
      setSuggestMsg('Enter a blog idea first.')
      setTimeout(() => setSuggestMsg(''), 3000)
      return
    }
    setSuggesting(true)
    setSuggestMsg('')
    setSuggestElapsed(0)
    const startedAt = Date.now()
    if (suggestTimerRef.current) clearInterval(suggestTimerRef.current)
    suggestTimerRef.current = setInterval(() => {
      setSuggestElapsed(Math.round((Date.now() - startedAt) / 1000))
    }, 1000)
    let keepMessageLonger = false
    try {
      const res = await fetch('/api/blog-prompts/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogIdea: fields.blogIdea,
          clientName: selectedClient?.name,
          servicePages: selectedClient?.servicePages,
          existingTags: clientTags,
          globalBlogRules: blogSettings?.globalBlogRules,
          clientBlogTone: selectedClient?.blogTone,
          categoryBlogTone,
        }),
      })
      const secs = Math.round((Date.now() - startedAt) / 1000)
      const raw = await res.text()
      let data: any = null
      try { data = JSON.parse(raw) } catch { /* non-JSON (gateway timeout / HTML error page) */ }
      if (!data) {
        keepMessageLonger = true
        setSuggestMsg(
          res.status === 504 || res.status === 502
            ? `AI suggestion timed out after ${secs}s (HTTP ${res.status}). The model took too long — try again or pick a faster Blog Prompter model in OptiMate Settings.`
            : `AI suggestion failed after ${secs}s — HTTP ${res.status} ${res.statusText || ''} (non-JSON response).`.trim(),
        )
        return
      }
      if (!res.ok || !data.suggestion) {
        keepMessageLonger = true
        setSuggestMsg(`${data.error || 'AI suggestion failed.'} (HTTP ${res.status}, ${secs}s)`)
        return
      }
      const s = data.suggestion as Partial<BriefFields>
      // Never overwrite client or category. Only fill empty fields.
      setFields((prev) => {
        const next = { ...prev }
        const fillable: (keyof BriefFields)[] = [
          'titleIdea', 'tag', 'mainPoint', 'keyPoints', 'primaryKeywords',
          'secondaryKeywords', 'pointsToAvoid', 'targetAudience', 'supportingContent',
        ]
        for (const key of fillable) {
          const suggested = (s[key] || '').trim()
          if (!suggested) continue
          if (next[key]?.trim()) continue
          // Only accept a suggested tag if it matches the client's tag list (when one exists).
          if (key === 'tag' && clientTags.length > 0 && !clientTags.includes(suggested)) continue
          next[key] = suggested
        }
        return next
      })
      const warning = typeof data.warning === 'string' ? data.warning : ''
      keepMessageLonger = warning.length > 0
      setSuggestMsg(
        warning
          ? `Recommendations added using fallback in ${secs}s. ${warning}`
          : `Recommendations added to empty fields in ${secs}s.`,
      )
    } catch (err) {
      const secs = Math.round((Date.now() - startedAt) / 1000)
      keepMessageLonger = true
      setSuggestMsg(`AI suggestion failed after ${secs}s — ${(err as Error).message || 'network error'}.`)
    } finally {
      if (suggestTimerRef.current) {
        clearInterval(suggestTimerRef.current)
        suggestTimerRef.current = null
      }
      setSuggesting(false)
      if (!keepMessageLonger) setTimeout(() => setSuggestMsg(''), 4000)
    }
  }

  const handleGenerateBlog = async (brief?: SavedBrief) => {
    if (!selectedClient) {
      setGenerateBlogMsg('Select the client this saved brief belongs to first.')
      setTimeout(() => setGenerateBlogMsg(''), 4000)
      return
    }

    const generated = brief
      ? brief.generatedPrompt || buildCurrentPrompt(brief)
      : prompt || buildCurrentPrompt()
    setPrompt(generated)
    setGeneratingBlog(true)
    setGenerateBlogMsg('')
    setGeneratedDraftUrl('')
    try {
      const res = await fetch('/api/blog-prompts/generate-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: generated,
          clientId: selectedClient?.id,
          blogPromptId: brief?.id || selectedBrief?.id,
          createDraft: true,
          category: brief?.category || fields.category,
          tag: brief?.tag || fields.tag,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.markdown) {
        setGenerateBlogMsg(data.error || 'Blog generation failed.')
        return
      }
      setGeneratedBlogMarkdown(data.markdown)
      setGeneratedDraftUrl(typeof data.draft?.adminUrl === 'string' ? data.draft.adminUrl : '')
      const updatedPromptId = brief?.id || selectedBrief?.id
      if (updatedPromptId) {
        setBriefs((prev) => prev.map((item) => item.id === updatedPromptId ? { ...item, workflowStatus: 'in_progress', blogPost: data.draft?.id } : item))
        setSelectedBrief((prev) => prev && prev.id === updatedPromptId ? { ...prev, workflowStatus: 'in_progress', blogPost: data.draft?.id } : prev)
      }
      setGenerateBlogMsg(data.warning ? `Generated with fallback. ${data.warning}` : 'Blog draft created with markdown in the import box.')
    } catch {
      setGenerateBlogMsg('Blog generation failed.')
    } finally {
      setGeneratingBlog(false)
      setTimeout(() => setGenerateBlogMsg(''), 10000)
    }
  }

  const handleSave = async () => {
    if (!fields.blogIdea.trim()) {
      setSaveMsg('Blog Idea is required to save.')
      setTimeout(() => setSaveMsg(''), 3000)
      return
    }
    if (!selectedClient) {
      setSaveMsg('Select a client before saving.')
      setTimeout(() => setSaveMsg(''), 3000)
      return
    }
    setSaving(true)
    const generated = prompt || buildCurrentPrompt()
    try {
      const res = await fetch('/api/blog-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, client: selectedClient.id, generatedPrompt: generated }),
      })
      const data = await res.json()
      if (data.doc) {
        setBriefs((prev) => [data.doc, ...prev])
        setSaveMsg('Saved!')
      } else {
        setSaveMsg('Error saving brief.')
      }
    } catch {
      setSaveMsg('Error saving brief.')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  useEffect(() => () => {
    if (suggestTimerRef.current) clearInterval(suggestTimerRef.current)
  }, [])

  useEffect(() => {
    fetch('/api/clients/list')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d) })
      .catch(() => {})

    fetch('/api/blog-settings')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.globalBlogRules === 'string' && typeof d.globalMarkdownRules === 'string') {
          setBlogSettings(d)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setBriefs([])
      setLoadingBriefs(false)
      return
    }

    setLoadingBriefs(true)
    fetch(`/api/blog-prompts?clientId=${encodeURIComponent(selectedClientId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.docs) setBriefs(d.docs) })
      .catch(() => setBriefs([]))
      .finally(() => setLoadingBriefs(false))
  }, [selectedClientId])

  const handleSelectBrief = (brief: SavedBrief) => {
    setSelectedBrief(brief)
    setTimeout(() => selectedBriefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleLoadBrief = (brief: SavedBrief) => {
    setFields({
      blogIdea: stripBlogPrefix(brief.blogIdea || ''),
      titleIdea: brief.titleIdea || '',
      category: brief.category || '',
      tag: brief.tag || '',
      mainPoint: brief.mainPoint || '',
      keyPoints: brief.keyPoints || '',
      primaryKeywords: brief.primaryKeywords || '',
      secondaryKeywords: brief.secondaryKeywords || '',
      pointsToAvoid: brief.pointsToAvoid || '',
      targetAudience: brief.targetAudience || '',
      supportingContent: brief.supportingContent || '',
    })
    setPrompt(brief.generatedPrompt || buildCurrentPrompt(brief))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleMarkBriefPublished = async (id: string | number) => {
    setPublishingId(id)
    try {
      const res = await fetch(`/api/blog-prompts?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowStatus: 'published' }),
      })
      if (!res.ok) return
      setBriefs((prev) => prev.map((b) => b.id === id ? { ...b, workflowStatus: 'published' } : b))
      if (selectedBrief?.id === id) setSelectedBrief(null)
    } catch { /* ignore */ }
    finally { setPublishingId(null) }
  }

  const handleDeleteBrief = async (id: string | number) => {
    const typed = window.prompt('Type delete to permanently remove this blog prompt.')
    if (typed?.trim().toLowerCase() !== 'delete') return

    setDeletingId(id)
    try {
      await fetch(`/api/blog-prompts?id=${id}`, { method: 'DELETE' })
      setBriefs((prev) => prev.filter((b) => b.id !== id))
      if (selectedBrief?.id === id) setSelectedBrief(null)
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }

  return (
    <main className="blog-prompter">
      <div className="blog-prompter__wrap">
        <h1 className="blog-prompter__sr-only">Blog post prompter</h1>

        <section className="blog-prompter__card" aria-labelledby="idea-backlog-heading">
          <div className="blog-prompter__card-head">
            <div className="blog-prompter__card-head-group">
              <h2 id="idea-backlog-heading">Idea backlog</h2>
              <span className="blog-prompter__meta">{showProposed ? proposedBriefs.length : activeBriefs.length} queued</span>
            </div>
            <div className="blog-prompter__client-form">
              <label htmlFor="blog-prompter-client">Client</label>
              <select
                id="blog-prompter-client"
                value={selectedClientId}
                onChange={(e) => handleClientChange(e.target.value)}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={String(client.id)}>{client.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="blog-prompter__tabs" role="group" aria-label="Blog idea source">
            <button
              className="blog-prompter__tab"
              type="button"
              aria-pressed={!showProposed}
              onClick={() => { setShowProposed(false); setSelectedBrief(null) }}
            >
              Manual blog ideas ({activeBriefs.length})
            </button>
            <button
              className="blog-prompter__tab"
              type="button"
              aria-pressed={showProposed}
              onClick={() => { setShowProposed(true); setShowPublishedProposed(false); setProposedTagFilter(''); setSelectedBrief(null) }}
            >
              Proposed blog ideas ({blogIdeaProposedBriefs.length})
            </button>
          </div>

          {showProposed && (
            <div className="blog-prompter__filters">
              <span>Show</span>
              <select
                className="blog-prompter__filter-select"
                aria-label="Proposed blog status"
                value={showPublishedProposed ? 'published' : 'ideas'}
                onChange={(e) => { setShowPublishedProposed(e.target.value === 'published'); setProposedTagFilter(''); setSelectedBrief(null) }}
              >
                <option value="ideas">Blog ideas</option>
                <option value="published">Published</option>
              </select>
              <span>Tag</span>
              <select
                className="blog-prompter__filter-select blog-prompter__filter-select--tag"
                aria-label="Proposed blog tag"
                value={proposedTagFilter}
                onChange={(e) => { setProposedTagFilter(e.target.value); setSelectedBrief(null) }}
              >
                <option value="">All tags</option>
                {proposedTagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>
          )}

          <div className="blog-prompter__backlog">
            {(() => {
              const displayBriefs = showProposed ? proposedBriefs : activeBriefs
              if (!selectedClient) {
                return <div className="blog-prompter__empty">Select a client to see their saved blog prompts.</div>
              }
              if (loadingBriefs) {
                return <div className="blog-prompter__empty">Loading prompts for {selectedClient.name}...</div>
              }
              if (displayBriefs.length === 0) {
                const emptyMessage = showProposed
                  ? showPublishedProposed
                    ? `No published proposed blogs saved for ${selectedClient.name}.`
                    : `No proposed blog ideas saved for ${selectedClient.name}.`
                  : `No active blog prompts saved for ${selectedClient.name}.`
                return <div className="blog-prompter__empty">{emptyMessage}</div>
              }
              return displayBriefs.map((brief, index) => {
                const status = briefStatus(brief)
                const statusClass = status.toLowerCase().replaceAll(' ', '-')
                return (
                  <div
                    className={`blog-prompter__row${selectedBrief?.id === brief.id ? ' blog-prompter__row--active' : ''}`}
                    key={brief.id}
                  >
                    <span className="blog-prompter__rank">{index + 1}</span>
                    <button
                      className="blog-prompter__row-title"
                      type="button"
                      title={stripBlogPrefix(brief.blogIdea)}
                      onClick={() => handleSelectBrief(brief)}
                    >
                      {stripBlogPrefix(brief.blogIdea)}
                    </button>
                    <div className="blog-prompter__row-meta">
                      <span>{brief.category?.trim() || 'Uncategorised'}</span>
                      <span className="blog-prompter__row-sep">/</span>
                      <span>{brief.tag?.trim() || 'No tag'}</span>
                    </div>
                    <span className={`blog-prompter__pill blog-prompter__pill--${statusClass}`}>{status}</span>
                    <div className="blog-prompter__row-actions">
                      <button
                        className="blog-prompter__use"
                        type="button"
                        onClick={() => handleLoadBrief(brief)}
                      >
                        Use
                      </button>
                      {!showProposed && brief.workflowStatus !== 'published' && (
                        <button
                          className="blog-prompter__icon"
                          type="button"
                          aria-label={`Mark ${stripBlogPrefix(brief.blogIdea)} as published`}
                          title="Mark published"
                          disabled={publishingId === brief.id}
                          onClick={() => handleMarkBriefPublished(brief.id)}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="m4 10 3.4 3.4L16 5.8" />
                          </svg>
                        </button>
                      )}
                      <button
                        className="blog-prompter__icon blog-prompter__icon--danger"
                        type="button"
                        aria-label={`Delete ${stripBlogPrefix(brief.blogIdea)}`}
                        title="Delete prompt"
                        disabled={deletingId === brief.id}
                        onClick={() => handleDeleteBrief(brief.id)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7">
                          <path d="M4 5.5h12M8 3.5h4M6.5 5.5l.6 11h5.8l.6-11M8.5 8.5v5M11.5 8.5v5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </section>

        <section className="blog-prompter__card blog-prompter__card-pad" aria-labelledby="brief-details-heading">
          <div className="blog-prompter__form-head">
            <h2 id="brief-details-heading">Brief details</h2>
            <span className="blog-prompter__meta">{selectedClient ? selectedClient.name : 'Select a client before saving'}</span>
          </div>

          <div className="blog-prompter__form-body">
            <Field label="Blog idea" required>
              <div className="blog-prompter__idea-row">
                <div className="blog-prompter__idea-field">
                  <VoiceField
                    value={fields.blogIdea}
                    ariaLabel="Blog idea"
                    required
                    onChange={(value) => setFields((previous) => ({ ...previous, blogIdea: value }))}
                    placeholder="e.g. Why page speed matters for local SEO"
                    autoGrow
                  />
                </div>
                <button
                  className="blog-prompter__button blog-prompter__button--purple"
                  type="button"
                  onClick={handleSuggest}
                  disabled={suggesting}
                  title="Let AI recommend the rest of the brief from your blog idea"
                >
                  {suggesting ? `Thinking... ${suggestElapsed}s` : 'AI suggest'}
                </button>
              </div>
              {suggestMsg && (
                <span
                  className="blog-prompter__message"
                  role="status"
                  style={{ color: /fail|first|timed out|error/i.test(suggestMsg) ? '#b42318' : '#327766' }}
                >
                  {suggestMsg}
                </span>
              )}
            </Field>

            <div className="blog-prompter__grid-2">
              <Field label="Title idea">
                <VoiceField
                  value={fields.titleIdea}
                  ariaLabel="Title idea"
                  onChange={(value) => setFields((previous) => ({ ...previous, titleIdea: value }))}
                  placeholder="Optional working title"
                />
              </Field>
              <Field label="Category">
                {clientCategories.length > 0 ? (
                  <select className="blog-prompter__native-select" aria-label="Category" value={fields.category} onChange={set('category')}>
                    <option value="">Select category</option>
                    {clientCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                ) : (
                  <VoiceField
                    value={fields.category}
                    ariaLabel="Category"
                    onChange={(value) => setFields((previous) => ({ ...previous, category: value }))}
                    placeholder="e.g. SEO"
                  />
                )}
              </Field>
              <Field label="Tag">
                {clientTags.length > 0 ? (
                  <select className="blog-prompter__native-select" aria-label="Tag" value={fields.tag} onChange={set('tag')}>
                    <option value="">Select tag</option>
                    {clientTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                ) : (
                  <VoiceField
                    value={fields.tag}
                    ariaLabel="Tag"
                    onChange={(value) => setFields((previous) => ({ ...previous, tag: value }))}
                    placeholder="e.g. Technical SEO"
                  />
                )}
              </Field>
              <Field label="Target audience">
                <VoiceField
                  value={fields.targetAudience}
                  ariaLabel="Target audience"
                  onChange={(value) => setFields((previous) => ({ ...previous, targetAudience: value }))}
                  placeholder="e.g. Small business owners"
                />
              </Field>
            </div>

            <Field label="Main point of the content">
              <VoiceField
                value={fields.mainPoint}
                ariaLabel="Main point of the content"
                onChange={(value) => setFields((previous) => ({ ...previous, mainPoint: value }))}
                placeholder="The single most important takeaway the reader should get"
                multiline
              />
            </Field>
            <Field label="Key points that must be included">
              <VoiceField
                value={fields.keyPoints}
                ariaLabel="Key points that must be included"
                onChange={(value) => setFields((previous) => ({ ...previous, keyPoints: value }))}
                placeholder="Enter each key point on a new line"
                multiline
              />
            </Field>

            <div className="blog-prompter__grid-2">
              <Field label="Primary keywords" hint="one per line">
                <VoiceField
                  value={fields.primaryKeywords}
                  ariaLabel="Primary keywords, one per line"
                  onChange={(value) => setFields((previous) => ({ ...previous, primaryKeywords: value }))}
                  placeholder={'page speed SEO\ncore web vitals\nLCP optimisation'}
                  multiline
                />
              </Field>
              <Field label="Secondary keywords" hint="one per line">
                <VoiceField
                  value={fields.secondaryKeywords}
                  ariaLabel="Secondary keywords, one per line"
                  onChange={(value) => setFields((previous) => ({ ...previous, secondaryKeywords: value }))}
                  placeholder={'LCP\nFID\nCLS'}
                  multiline
                />
              </Field>
            </div>

            <Field label="Points to avoid">
              <VoiceField
                value={fields.pointsToAvoid}
                ariaLabel="Points to avoid"
                onChange={(value) => setFields((previous) => ({ ...previous, pointsToAvoid: value }))}
                placeholder="Topics, angles, or claims to exclude"
                multiline
              />
            </Field>
            <Field label="Content to support">
              <VoiceField
                value={fields.supportingContent}
                ariaLabel="Content to support"
                onChange={(value) => setFields((previous) => ({ ...previous, supportingContent: value }))}
                placeholder="Links, data, case studies, or existing content to reference"
                multiline
              />
            </Field>

            <div className="blog-prompter__actions">
              <button className="blog-prompter__button blog-prompter__button--dark" type="button" onClick={handleGenerate}>
                Generate prompt
              </button>
              <button className="blog-prompter__button blog-prompter__button--teal" type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save brief'}
              </button>
              <button
                className="blog-prompter__button blog-prompter__button--outline"
                type="button"
                onClick={() => handleGenerateBlog()}
                disabled={generatingBlog || !selectedClient}
                title={selectedClient ? 'Generate the blog and create a draft for review' : 'Select a client before generating a blog draft'}
              >
                {generatingBlog ? 'Generating blog...' : 'Generate blog draft'}
              </button>
              <button
                className="blog-prompter__button blog-prompter__button--ghost"
                type="button"
                onClick={() => { setFields(emptyFields); setPrompt(''); setGeneratedBlogMarkdown(''); setGeneratedDraftUrl('') }}
              >
                Clear
              </button>
              <div className="blog-prompter__action-status" aria-live="polite">
                {saveMsg && (
                  <span style={{ color: saveMsg.startsWith('Error') || saveMsg.startsWith('Blog') || saveMsg.startsWith('Select') ? '#b42318' : '#327766' }}>{saveMsg}</span>
                )}
                {generateBlogMsg && (
                  <span style={{ color: generateBlogMsg.toLowerCase().includes('fail') ? '#b42318' : '#327766' }}>{generateBlogMsg}</span>
                )}
              </div>
            </div>

            {prompt && <PromptBox prompt={prompt} />}
            {generatedBlogMarkdown && <MarkdownOutputBox markdown={generatedBlogMarkdown} draftUrl={generatedDraftUrl} />}
          </div>
        </section>

        {selectedBrief && (
          <section ref={selectedBriefRef} className="blog-prompter__card blog-prompter__detail" aria-labelledby="selected-brief-heading">
            <div className="blog-prompter__detail-head">
              <div>
                <h2 id="selected-brief-heading">{stripBlogPrefix(selectedBrief.blogIdea)}</h2>
                {selectedBrief.titleIdea && <p>{selectedBrief.titleIdea}</p>}
              </div>
              <button className="blog-prompter__button blog-prompter__button--ghost" type="button" onClick={() => setSelectedBrief(null)}>Close</button>
            </div>
            <PromptBox prompt={selectedBrief.generatedPrompt || buildCurrentPrompt(selectedBrief)} />
            <div className="blog-prompter__detail-actions">
              <button className="blog-prompter__button blog-prompter__button--dark" type="button" onClick={() => handleLoadBrief(selectedBrief)}>Load into form</button>
              <button
                className="blog-prompter__button blog-prompter__button--teal"
                type="button"
                onClick={() => handleGenerateBlog(selectedBrief)}
                disabled={generatingBlog || !selectedClient}
              >
                {generatingBlog ? 'Generating...' : 'Generate blog'}
              </button>
              <button
                className="blog-prompter__button blog-prompter__button--danger"
                type="button"
                onClick={() => handleDeleteBrief(selectedBrief.id)}
                disabled={deletingId === selectedBrief.id}
              >
                {deletingId === selectedBrief.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="blog-prompter__field">
      <span className="blog-prompter__field-label">
        {label} {required && <span className="blog-prompter__required" aria-hidden="true">*</span>}
        {hint && <span className="blog-prompter__hint"> ({hint})</span>}
      </span>
      {children}
    </div>
  )
}

export default BlogPrompterPage
