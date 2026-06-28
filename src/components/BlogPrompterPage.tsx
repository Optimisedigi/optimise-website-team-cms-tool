'use client'

import { useEffect, useState, useRef } from 'react'
import { buildBlogPrompt, findCategoryTone, parsePromptLines } from '@/lib/blog-prompter'
import VoiceField from './VoiceField'

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

function briefStatus(brief: SavedBrief): { label: string; color: string; background: string } {
  if (brief.workflowStatus === 'published') return { label: 'Published', color: '#166534', background: '#dcfce7' }
  if (brief.workflowStatus === 'in_progress') return { label: 'In progress', color: '#92400e', background: '#fef3c7' }
  return { label: 'Idea phase', color: '#3730a3', background: '#e0e7ff' }
}

// ─── Compact prompt output box ────────────────────────────

function OutputBox({ label, value, height = 100, footer }: { label: string; value: string; height?: number; footer?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-400)' }}>{label}</span>
        <button type="button" onClick={handleCopy} style={smallBtnStyle}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        style={{
          width: '100%',
          height,
          overflowY: 'auto',
          resize: 'vertical',
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-200)',
          borderRadius: 4,
          padding: '8px 10px',
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'inherit',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      />
      {footer && <div style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginTop: 6 }}>{footer}</div>}
    </div>
  )
}

function PromptBox({ prompt }: { prompt: string }) {
  return <OutputBox label="Generated Prompt" value={prompt} />
}

function MarkdownOutputBox({ markdown, draftUrl }: { markdown: string; draftUrl?: string }) {
  return (
    <>
      <OutputBox
        label="Generated Blog Markdown"
        value={markdown}
        height={320}
        footer="This markdown has been added to the Blog Post draft import box for the selected client."
      />
      {draftUrl && (
        <a href={draftUrl} style={{ display: 'inline-block', marginTop: 8, fontSize: 13, color: '#2563eb', fontWeight: 600 }}>
          Open draft Blog Post →
        </a>
      )}
    </>
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
  const [showProposed, setShowProposed] = useState(true)
  const [showPublishedProposed, setShowPublishedProposed] = useState(false)
  const [proposedTagFilter, setProposedTagFilter] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestMsg, setSuggestMsg] = useState('')
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

  const activeBriefs = briefs.filter((b) => b.source !== 'topic-clusters' && !b.archivedAt)
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
      const data = await res.json()
      if (!res.ok || !data.suggestion) {
        setSuggestMsg(data.error || 'AI suggestion failed.')
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
          ? `Recommendations added using fallback. ${warning}`
          : 'Recommendations added to empty fields.',
      )
    } catch {
      setSuggestMsg('AI suggestion failed.')
    } finally {
      setSuggesting(false)
      setTimeout(() => setSuggestMsg(''), keepMessageLonger ? 10000 : 4000)
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
    <div style={{ padding: '20px 0' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Blog Post Prompter</h1>

      {/* ── Top: Client-scoped saved briefs ── */}
      <div style={{ background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--theme-elevation-100)' }}>
          <Field label="Client">
            <select value={selectedClientId} onChange={(e) => handleClientChange(e.target.value)} style={selectStyle}>
              <option value="">— Select a client —</option>
              {clients.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--theme-elevation-100)' }}>
          <button
            type="button"
            onClick={() => { setShowProposed(false); setSelectedBrief(null) }}
            style={{
              flex: 1, padding: '12px 16px', fontSize: 13, fontWeight: showProposed ? 400 : 700,
              background: showProposed ? 'transparent' : 'var(--theme-elevation-50)',
              border: 'none', borderBottom: showProposed ? 'none' : '2px solid var(--theme-elevation-500)',
              cursor: 'pointer', color: 'inherit',
            }}
          >
            Active blogs {activeBriefs.length > 0 && <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>({activeBriefs.length})</span>}
          </button>
          <button
            type="button"
            onClick={() => { setShowProposed(true); setShowPublishedProposed(false); setProposedTagFilter(''); setSelectedBrief(null) }}
            style={{
              flex: 1, padding: '12px 16px', fontSize: 13, fontWeight: showProposed ? 700 : 400,
              background: showProposed ? 'var(--theme-elevation-50)' : 'transparent',
              border: 'none', borderBottom: showProposed ? '2px solid var(--theme-elevation-500)' : 'none',
              cursor: 'pointer', color: 'inherit',
            }}
          >
            Proposed {blogIdeaProposedBriefs.length > 0 && <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>({blogIdeaProposedBriefs.length})</span>}
          </button>
        </div>
        {showProposed && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--theme-elevation-100)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>Show</span>
            <select
              value={showPublishedProposed ? 'published' : 'ideas'}
              onChange={(e) => { setShowPublishedProposed(e.target.value === 'published'); setProposedTagFilter(''); setSelectedBrief(null) }}
              style={{ ...selectStyle, width: 170, padding: '6px 8px', fontSize: 12 }}
            >
              <option value="ideas">Blog ideas</option>
              <option value="published">Published</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>Tag</span>
            <select
              value={proposedTagFilter}
              onChange={(e) => { setProposedTagFilter(e.target.value); setSelectedBrief(null) }}
              style={{ ...selectStyle, width: 220, padding: '6px 8px', fontSize: 12 }}
            >
              <option value="">All tags</option>
              {proposedTagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
            {publishedProposedBriefs.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>({publishedProposedBriefs.length} published)</span>
            )}
          </div>
        )}
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {(() => {
            const displayBriefs = showProposed ? proposedBriefs : activeBriefs

            if (!selectedClient) {
              return <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--theme-elevation-400)' }}>Select a client to see their saved blog prompts.</div>
            }
            if (loadingBriefs) {
              return <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--theme-elevation-400)' }}>Loading prompts for {selectedClient.name}...</div>
            }
            if (displayBriefs.length === 0) {
              const emptyMessage = showProposed
                ? showPublishedProposed
                  ? `No published proposed blogs saved for ${selectedClient.name}.`
                  : `No blog ideas saved for ${selectedClient.name}.`
                : `No active blog prompts saved for ${selectedClient.name}.`
              return <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--theme-elevation-400)' }}>{emptyMessage}</div>
            }
            return displayBriefs.map((brief) => {
              const status = briefStatus(brief)
              return (
                <div
                  key={String(brief.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: showProposed ? 'minmax(0, 1fr) minmax(120px, 180px) auto' : 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 10,
                    borderBottom: '1px solid var(--theme-elevation-50)',
                    background: selectedBrief?.id === brief.id ? 'var(--theme-elevation-100)' : 'transparent',
                    paddingRight: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectBrief(brief)}
                    style={{
                      padding: '11px 16px', textAlign: 'left',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: selectedBrief?.id === brief.id ? 700 : 500,
                      color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    title={stripBlogPrefix(brief.blogIdea)}
                  >
                    {stripBlogPrefix(brief.blogIdea)}
                  </button>
                  {showProposed && (
                    <span
                      title={brief.tag || 'No tag'}
                      style={{ fontSize: 12, color: 'var(--theme-elevation-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {brief.tag?.trim() || 'No tag'}
                    </span>
                  )}
                  {!showProposed && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: status.color, background: status.background, borderRadius: 999, padding: '4px 9px', whiteSpace: 'nowrap' }}>
                      {status.label}
                    </span>
                  )}
                  <button
                    type="button"
                    title="Delete prompt"
                    onClick={(e) => { e.stopPropagation(); handleDeleteBrief(brief.id) }}
                    disabled={deletingId === brief.id}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 13, padding: '4px 6px', color: 'var(--theme-elevation-400)',
                      flexShrink: 0, opacity: deletingId === brief.id ? 0.4 : 1,
                    }}
                  >
                    {deletingId === brief.id ? '...' : '\u2715'}
                  </button>
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* ── Brief form ── */}
      <div style={{ background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Brief Details</h2>

          {/* Blog Idea — full width, auto-growing, with AI Suggest button */}
          <div style={{ marginBottom: 16 }}>
            <Field label="Blog Idea *" hint="Required">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <VoiceField
                    value={fields.blogIdea}
                    onChange={(v) => setFields((prev) => ({ ...prev, blogIdea: v }))}
                    placeholder="e.g. Why page speed matters for local SEO"
                    autoGrow
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSuggest}
                  disabled={suggesting}
                  title="Let AI recommend the rest of the brief from your blog idea"
                  style={{
                    ...btnStyle,
                    background: '#7c3aed',
                    color: '#fff',
                    borderColor: '#7c3aed',
                    whiteSpace: 'nowrap',
                    opacity: suggesting ? 0.7 : 1,
                    cursor: suggesting ? 'wait' : 'pointer',
                  }}
                >
                  {suggesting ? 'Thinking…' : '\u2728 AI Suggest'}
                </button>
              </div>
            </Field>
            {suggestMsg && (
              <span style={{ fontSize: 12, marginTop: 6, display: 'inline-block', color: suggestMsg.toLowerCase().includes('fail') || suggestMsg.toLowerCase().includes('first') ? '#ef4444' : '#22c55e', fontWeight: 500 }}>
                {suggestMsg}
              </span>
            )}
          </div>

          {/* 2-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <Field label="Title Idea">
              <VoiceField
                value={fields.titleIdea}
                onChange={(v) => setFields((prev) => ({ ...prev, titleIdea: v }))}
                placeholder="Optional working title"
              />
            </Field>

            <Field label="Category">
              {clientCategories.length > 0 ? (
                <select value={fields.category} onChange={set('category')} style={selectStyle}>
                  <option value="">— Select category —</option>
                  {clientCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <VoiceField
                  value={fields.category}
                  onChange={(v) => setFields((prev) => ({ ...prev, category: v }))}
                  placeholder="e.g. SEO"
                />
              )}
            </Field>

            <Field label="Tag">
              {clientTags.length > 0 ? (
                <select value={fields.tag} onChange={set('tag')} style={selectStyle}>
                  <option value="">— Select tag —</option>
                  {clientTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <VoiceField
                  value={fields.tag}
                  onChange={(v) => setFields((prev) => ({ ...prev, tag: v }))}
                  placeholder="e.g. Technical SEO"
                />
              )}
            </Field>

            <Field label="Primary Keywords" hint="one per line">
              <VoiceField
                value={fields.primaryKeywords}
                onChange={(v) => setFields((prev) => ({ ...prev, primaryKeywords: v }))}
                placeholder={"page speed SEO\ncore web vitals\nLCP optimisation"}
                multiline
              />
            </Field>
            <Field label="Secondary Keywords" hint="one per line">
              <VoiceField
                value={fields.secondaryKeywords}
                onChange={(v) => setFields((prev) => ({ ...prev, secondaryKeywords: v }))}
                placeholder={"LCP\nFID\nCLS"}
                multiline
              />
            </Field>

            <Field label="Target Audience">
              <VoiceField
                value={fields.targetAudience}
                onChange={(v) => setFields((prev) => ({ ...prev, targetAudience: v }))}
                placeholder="e.g. Small business owners"
              />
            </Field>
          </div>

          {/* Full-width textareas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <Field label="Main Point of the Content">
              <VoiceField
                value={fields.mainPoint}
                onChange={(v) => setFields((prev) => ({ ...prev, mainPoint: v }))}
                placeholder="The single most important takeaway the reader should get"
                multiline
              />
            </Field>
            <Field label="Key Points That Must Be Included">
              <VoiceField
                value={fields.keyPoints}
                onChange={(v) => setFields((prev) => ({ ...prev, keyPoints: v }))}
                placeholder="Enter each key point on a new line"
                multiline
              />
            </Field>
            <Field label="Points to Avoid">
              <VoiceField
                value={fields.pointsToAvoid}
                onChange={(v) => setFields((prev) => ({ ...prev, pointsToAvoid: v }))}
                placeholder="Topics, angles, or claims to exclude"
                multiline
              />
            </Field>
            <Field label="Content to Support">
              <VoiceField
                value={fields.supportingContent}
                onChange={(v) => setFields((prev) => ({ ...prev, supportingContent: v }))}
                placeholder="Links, data, case studies, or existing content to reference"
                multiline
              />
            </Field>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={handleGenerate} style={{ ...btnStyle, background: '#213843', color: '#fff', borderColor: '#213843' }}>
              Generate Prompt
            </button>
            <button type="button" onClick={handleSave} disabled={saving} style={btnStyle}>
              {saving ? 'Saving...' : 'Save Brief'}
            </button>
            <button
              type="button"
              onClick={() => handleGenerateBlog()}
              disabled={generatingBlog || !selectedClient}
              title={selectedClient ? 'Generate the blog and create a draft for review' : 'Select a client before generating a blog draft'}
              style={{ ...btnStyle, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: generatingBlog || !selectedClient ? 0.65 : 1, cursor: generatingBlog || !selectedClient ? 'not-allowed' : 'pointer' }}
            >
              {generatingBlog ? 'Generating Blog…' : 'Generate Blog Draft'}
            </button>
            <button type="button" onClick={() => { setFields(emptyFields); setPrompt(''); setGeneratedBlogMarkdown(''); setGeneratedDraftUrl(''); setSelectedClientId('') }} style={{ ...btnStyle, color: 'var(--theme-elevation-400)' }}>
              Clear
            </button>
            {saveMsg && (
              <span style={{ fontSize: 13, color: saveMsg.startsWith('Error') || saveMsg.startsWith('Blog') ? '#ef4444' : '#22c55e', fontWeight: 500 }}>
                {saveMsg}
              </span>
            )}
            {generateBlogMsg && (
              <span style={{ fontSize: 13, color: generateBlogMsg.toLowerCase().includes('fail') ? '#ef4444' : '#22c55e', fontWeight: 500 }}>
                {generateBlogMsg}
              </span>
            )}
          </div>

          {prompt && <PromptBox prompt={prompt} />}
          {generatedBlogMarkdown && <MarkdownOutputBox markdown={generatedBlogMarkdown} draftUrl={generatedDraftUrl} />}
        </div>

      {/* ── Selected Brief Detail ── */}
      {selectedBrief && (
        <div ref={selectedBriefRef} style={{ marginTop: 24, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{stripBlogPrefix(selectedBrief.blogIdea)}</div>
              {selectedBrief.titleIdea && (
                <div style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginTop: 2 }}>{selectedBrief.titleIdea}</div>
              )}
            </div>
            <button type="button" onClick={() => setSelectedBrief(null)} style={{ ...smallBtnStyle, flexShrink: 0 }}>✕ Close</button>
          </div>

          <PromptBox prompt={selectedBrief.generatedPrompt || buildCurrentPrompt(selectedBrief)} />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => handleLoadBrief(selectedBrief)} style={smallBtnStyle}>
              Load into form
            </button>
            <button
              type="button"
              onClick={() => handleGenerateBlog(selectedBrief)}
              disabled={generatingBlog || !selectedClient}
              title={selectedClient ? 'Generate the blog and create a client draft' : 'Select the client this saved brief belongs to first'}
              style={{ ...smallBtnStyle, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: generatingBlog || !selectedClient ? 0.65 : 1 }}
            >
              {generatingBlog ? 'Generating…' : 'Generate Blog'}
            </button>
            <button
              type="button"
              onClick={() => handleDeleteBrief(selectedBrief.id)}
              disabled={deletingId === selectedBrief.id}
              style={{ ...smallBtnStyle, color: '#ef4444', borderColor: '#fca5a5' }}
            >
              {deletingId === selectedBrief.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-500)' }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: 'var(--theme-elevation-400)', marginLeft: 4 }}>({hint})</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--theme-input-bg, var(--theme-elevation-0))',
  border: '1px solid var(--theme-elevation-200)',
  padding: '8px 10px',
  borderRadius: 4,
  fontSize: 13,
  color: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: 1.5,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
}

const btnStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  color: 'inherit',
  flexShrink: 0,
}

const smallBtnStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-200)',
  padding: '5px 12px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  color: 'inherit',
}

export default BlogPrompterPage
