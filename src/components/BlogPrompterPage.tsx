'use client'

import { useEffect, useState, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────

interface Client {
  id: string | number
  name: string
  blogCategories: string
  blogTags: string
  servicePages: string
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
  generatedPrompt?: string
  createdAt?: string
  archivedAt?: string
}

// ─── Helpers ──────────────────────────────────────────────

function parseLines(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

// ─── Prompt generation ────────────────────────────────────
// Column order from Sheets formula: A, B, C, D, E, G, H, F, I, J, K

const DEFAULT_SERVICES = 'SEO, Google Ads, GEO, CRO, Meta Ads, Integrated digital growth strategy and AI automation'

function buildRequirements(servicePages?: string): string {
  const services = servicePages?.trim()
    ? parseLines(servicePages).join(', ')
    : DEFAULT_SERVICES

  return `## Requirements
- Use Australian English spelling.
- No em dashes or en dashes.
- Keep it clear, commercially grounded, and practical.
- Make sure the main point and required key points are clearly covered.
- Blog content exists to support SEO and topic authority.
- Blog content aligns with business services or products only where relevant and can link back to their service pages: ${services}.
- If there are clear internal links, make it clear where they should be added in the blog post.
- Do not add any internal links inside the TLDR section.
- Each unique URL should only be linked once in the entire blog post. Do not link multiple anchor texts to the same destination.
- If the blog mentions Facebook Ads, Instagram Ads, Meta Ads, and/or LinkedIn Ads and they all point to the same service page, only add one internal link using "Meta Ads" as the anchor text.
- Blog content answers real user questions, not generic filler.
- Include estimated reading time in minutes and a TLDR at the start.
- Make it easy and enjoyable to read.
- Support internal linking to service or product pages.
- Avoid thin or generic content.
- Write fully in markdown so it can be copied and pasted cleanly, including internal URLs.
- Add meta title (under 90 characters), meta description (under 160 characters) and excerpt (under 160 characters), clearly labelled.
- Add relevant, non overlapping FAQs that reflect real search behaviour.
- Consider all primary and secondary keywords.
- Do not include anything listed in 'What are points I don't want to add'.

- Make sure you stick to this markdown formatting:
Bold          **text**
Italic        *text*
Bold + Italic ***text***
H1 (Title)        # Heading
H2 (Section)      ## Heading
H3 (Subsection)   ### Heading
Link              [text](https://url.com)
Internal Link     [text](/page-path)
Bullet List       - Item
Numbered List     1. Item
Inline Code       \`code\`
Code Block        \`\`\` code \`\`\`
Blockquote        > Quote text
Line Break        Empty line between paragraphs
FAQ Section       ## FAQ **Q: Question?** A: Answer...

- Use these spacing rules consistently:
After every H2 (##) and H3 (###) heading, add one blank line.
Before every list, add one blank line.
Between paragraphs, add one blank line.
Before and after every code block, add one blank line.
If a line ends with a colon and a list follows, add one blank line after the colon line.
Keep paragraphs short. Aim for one to three sentences per paragraph block.

- Use this blog snippet example to match and maintain formatting consistency across the site:
>TL;DR If you want more high intent local customers, your Google Business Profile needs to be treated as a core growth channel, not an afterthought. Strong reviews, accurate information, regular updates, and geo-optimised landing pages build long term visibility that compounds.

Why this matters commercially

Content paragraph with **bold text** for emphasis and [internal links](/page-path) where relevant.

- Bullet points for key takeaways
- Keep them actionable

**Q: Example FAQ question?**
A: Example answer.

Meta Title: [Title] | Optimise Digital
Meta Description: [Description]
Excerpt: [Short excerpt]`
}

function buildPrompt(f: BriefFields, clientName?: string, servicePages?: string): string {
  const name = clientName || 'Optimise Digital'

  const section = (heading: string, value: string, note?: string) => {
    if (!value.trim()) return null
    return `## ${heading}\n${note ? note + '\n' : ''}${value.trim()}`
  }

  const parts = [
    `# Blog content brief for ${name}`,
    `Write a blog post for ${name} using the brief below.`,
    section('Blog Idea', f.blogIdea),
    section('Title idea', f.titleIdea),
    section('Category', f.category, '(for internal use only)'),
    section('Tag', f.tag),
    section('Main point of the content', f.mainPoint),
    section('Primary keywords to include', f.primaryKeywords),
    section('Secondary keywords to include', f.secondaryKeywords),
    section('Key points that must be included', f.keyPoints),
    section("What are points I don't want to add", f.pointsToAvoid),
    section('Who is the target audience', f.targetAudience),
    section('Content to support', f.supportingContent),
    buildRequirements(servicePages),
  ]

  return parts.filter(Boolean).join('\n\n')
}

// ─── Compact prompt output box ────────────────────────────

function PromptBox({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-400)' }}>Generated Prompt</span>
        <button type="button" onClick={handleCopy} style={smallBtnStyle}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        value={prompt}
        style={{
          width: '100%',
          height: 100,
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
    </div>
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
  const [archivingId, setArchivingId] = useState<string | number | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedBriefs, setArchivedBriefs] = useState<SavedBrief[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)

  const selectedClient = clients.find((c) => String(c.id) === selectedClientId) ?? null
  const clientCategories = selectedClient ? parseLines(selectedClient.blogCategories) : []
  const clientTags = selectedClient ? parseLines(selectedClient.blogTags) : []

  const set = (key: keyof BriefFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setFields((prev) => ({ ...prev, [key]: e.target.value }))

  const handleClientChange = (id: string) => {
    setSelectedClientId(id)
    const client = clients.find((c) => String(c.id) === id) ?? null
    const cats = client ? parseLines(client.blogCategories) : []
    const tags = client ? parseLines(client.blogTags) : []
    setFields((prev) => ({
      ...prev,
      category: cats.length > 0 ? (cats.includes(prev.category) ? prev.category : '') : prev.category,
      tag: tags.length > 0 ? (tags.includes(prev.tag) ? prev.tag : '') : prev.tag,
    }))
  }

  const handleGenerate = () => {
    setPrompt(buildPrompt(fields, selectedClient?.name, selectedClient?.servicePages))
  }

  const handleSave = async () => {
    if (!fields.blogIdea.trim()) {
      setSaveMsg('Blog Idea is required to save.')
      setTimeout(() => setSaveMsg(''), 3000)
      return
    }
    setSaving(true)
    const generated = prompt || buildPrompt(fields, selectedClient?.name, selectedClient?.servicePages)
    try {
      const res = await fetch('/api/blog-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, generatedPrompt: generated }),
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
    fetch('/api/blog-prompts')
      .then((r) => r.json())
      .then((d) => { if (d.docs) setBriefs(d.docs) })
      .catch(() => {})
      .finally(() => setLoadingBriefs(false))

    fetch('/api/clients/list')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d) })
      .catch(() => {})
  }, [])

  const handleSelectBrief = (brief: SavedBrief) => {
    setSelectedBrief(brief)
    setTimeout(() => selectedBriefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleLoadBrief = (brief: SavedBrief) => {
    setFields({
      blogIdea: brief.blogIdea || '',
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
    setPrompt(brief.generatedPrompt || buildPrompt(brief))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteBrief = async (id: string | number) => {
    if (!confirm('Delete this brief?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/blog-prompts?id=${id}`, { method: 'DELETE' })
      setBriefs((prev) => prev.filter((b) => b.id !== id))
      setArchivedBriefs((prev) => prev.filter((b) => b.id !== id))
      if (selectedBrief?.id === id) setSelectedBrief(null)
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }

  const handleArchiveBrief = async (id: string | number) => {
    setArchivingId(id)
    try {
      const res = await fetch(`/api/blog-prompts?id=${id}`, { method: 'PATCH' })
      const data = await res.json()
      if (data.doc) {
        setBriefs((prev) => prev.filter((b) => b.id !== id))
        setArchivedBriefs((prev) => [data.doc, ...prev])
        if (selectedBrief?.id === id) setSelectedBrief(null)
      }
    } catch { /* ignore */ }
    finally { setArchivingId(null) }
  }

  const handleToggleArchived = (archived: boolean) => {
    setShowArchived(archived)
    setSelectedBrief(null)
    if (archived && archivedBriefs.length === 0) {
      setLoadingArchived(true)
      fetch('/api/blog-prompts?archived=true')
        .then((r) => r.json())
        .then((d) => { if (d.docs) setArchivedBriefs(d.docs) })
        .catch(() => {})
        .finally(() => setLoadingArchived(false))
    }
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Blog Post Prompter</h1>

      {/* 2-column layout: form + saved briefs sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

        {/* ── Left: Form ── */}
        <div style={{ background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Brief Details</h2>

          {/* Client selector */}
          <div style={{ marginBottom: 16 }}>
            <Field label="Client">
              <select value={selectedClientId} onChange={(e) => handleClientChange(e.target.value)} style={selectStyle}>
                <option value="">— Select a client —</option>
                {clients.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* 2-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <Field label="Blog Idea *" hint="Required">
              <input type="text" value={fields.blogIdea} onChange={set('blogIdea')} style={inputStyle} placeholder="e.g. Why page speed matters for local SEO" />
            </Field>
            <Field label="Title Idea">
              <input type="text" value={fields.titleIdea} onChange={set('titleIdea')} style={inputStyle} placeholder="Optional working title" />
            </Field>

            <Field label="Category">
              {clientCategories.length > 0 ? (
                <select value={fields.category} onChange={set('category')} style={selectStyle}>
                  <option value="">— Select category —</option>
                  {clientCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input type="text" value={fields.category} onChange={set('category')} style={inputStyle} placeholder="e.g. SEO" />
              )}
            </Field>

            <Field label="Tag">
              {clientTags.length > 0 ? (
                <select value={fields.tag} onChange={set('tag')} style={selectStyle}>
                  <option value="">— Select tag —</option>
                  {clientTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input type="text" value={fields.tag} onChange={set('tag')} style={inputStyle} placeholder="e.g. Technical SEO" />
              )}
            </Field>

            <Field label="Primary Keywords" hint="one per line">
              <textarea value={fields.primaryKeywords} onChange={set('primaryKeywords')} rows={3} style={textareaStyle} placeholder={"page speed SEO\ncore web vitals\nLCP optimisation"} />
            </Field>
            <Field label="Secondary Keywords" hint="one per line">
              <textarea value={fields.secondaryKeywords} onChange={set('secondaryKeywords')} rows={3} style={textareaStyle} placeholder={"LCP\nFID\nCLS"} />
            </Field>

            <Field label="Target Audience">
              <input type="text" value={fields.targetAudience} onChange={set('targetAudience')} style={inputStyle} placeholder="e.g. Small business owners" />
            </Field>
          </div>

          {/* Full-width textareas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <Field label="Main Point of the Content">
              <textarea value={fields.mainPoint} onChange={set('mainPoint')} rows={3} style={textareaStyle} placeholder="The single most important takeaway the reader should get" />
            </Field>
            <Field label="Key Points That Must Be Included">
              <textarea value={fields.keyPoints} onChange={set('keyPoints')} rows={3} style={textareaStyle} placeholder="Enter each key point on a new line" />
            </Field>
            <Field label="Points to Avoid">
              <textarea value={fields.pointsToAvoid} onChange={set('pointsToAvoid')} rows={2} style={textareaStyle} placeholder="Topics, angles, or claims to exclude" />
            </Field>
            <Field label="Content to Support">
              <textarea value={fields.supportingContent} onChange={set('supportingContent')} rows={2} style={textareaStyle} placeholder="Links, data, case studies, or existing content to reference" />
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
            <button type="button" onClick={() => { setFields(emptyFields); setPrompt(''); setSelectedClientId('') }} style={{ ...btnStyle, color: 'var(--theme-elevation-400)' }}>
              Clear
            </button>
            {saveMsg && (
              <span style={{ fontSize: 13, color: saveMsg.startsWith('Error') || saveMsg.startsWith('Blog') ? '#ef4444' : '#22c55e', fontWeight: 500 }}>
                {saveMsg}
              </span>
            )}
          </div>

          {prompt && <PromptBox prompt={prompt} />}
        </div>

        {/* ── Right: Saved Briefs sidebar ── */}
        <div style={{ position: 'sticky', top: 20 }}>
          <div style={{ background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Tab toggle */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--theme-elevation-100)' }}>
              <button
                type="button"
                onClick={() => handleToggleArchived(false)}
                style={{
                  flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: showArchived ? 400 : 600,
                  background: showArchived ? 'transparent' : 'var(--theme-elevation-50)',
                  border: 'none', borderBottom: showArchived ? 'none' : '2px solid var(--theme-elevation-500)',
                  cursor: 'pointer', color: 'inherit',
                }}
              >
                Active {briefs.length > 0 && <span style={{ fontSize: 11, color: 'var(--theme-elevation-400)' }}>({briefs.length})</span>}
              </button>
              <button
                type="button"
                onClick={() => handleToggleArchived(true)}
                style={{
                  flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: showArchived ? 600 : 400,
                  background: showArchived ? 'var(--theme-elevation-50)' : 'transparent',
                  border: 'none', borderBottom: showArchived ? '2px solid var(--theme-elevation-500)' : 'none',
                  cursor: 'pointer', color: 'inherit',
                }}
              >
                Archived {archivedBriefs.length > 0 && <span style={{ fontSize: 11, color: 'var(--theme-elevation-400)' }}>({archivedBriefs.length})</span>}
              </button>
            </div>
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {(() => {
                const displayBriefs = showArchived ? archivedBriefs : briefs
                const isLoading = showArchived ? loadingArchived : loadingBriefs
                const emptyMsg = showArchived ? 'No archived briefs.' : 'No saved briefs yet.'

                if (isLoading) {
                  return <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--theme-elevation-400)' }}>Loading...</div>
                }
                if (displayBriefs.length === 0) {
                  return <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--theme-elevation-400)' }}>{emptyMsg}</div>
                }
                return displayBriefs.map((brief) => (
                  <div
                    key={String(brief.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      borderBottom: '1px solid var(--theme-elevation-50)',
                      background: selectedBrief?.id === brief.id ? 'var(--theme-elevation-100)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectBrief(brief)}
                      style={{
                        flex: 1, padding: '9px 14px', textAlign: 'left',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: selectedBrief?.id === brief.id ? 600 : 400,
                        color: showArchived ? 'var(--theme-elevation-400)' : 'inherit',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {brief.blogIdea}
                    </button>
                    {!showArchived && (
                      <button
                        type="button"
                        title="Mark as done"
                        onClick={(e) => { e.stopPropagation(); handleArchiveBrief(brief.id) }}
                        disabled={archivingId === brief.id}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: 13, padding: '4px 8px', color: 'var(--theme-elevation-400)',
                          flexShrink: 0, opacity: archivingId === brief.id ? 0.4 : 1,
                        }}
                      >
                        {archivingId === brief.id ? '...' : '\u2713'}
                      </button>
                    )}
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Selected Brief Detail ── */}
      {selectedBrief && (
        <div ref={selectedBriefRef} style={{ marginTop: 24, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedBrief.blogIdea}</div>
              {selectedBrief.titleIdea && (
                <div style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginTop: 2 }}>{selectedBrief.titleIdea}</div>
              )}
            </div>
            <button type="button" onClick={() => setSelectedBrief(null)} style={{ ...smallBtnStyle, flexShrink: 0 }}>✕ Close</button>
          </div>

          <PromptBox prompt={selectedBrief.generatedPrompt || buildPrompt(selectedBrief)} />

          {selectedBrief.archivedAt && (
            <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 8 }}>
              Archived {new Date(selectedBrief.archivedAt).toLocaleDateString()}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {!selectedBrief.archivedAt && (
              <>
                <button type="button" onClick={() => handleLoadBrief(selectedBrief)} style={smallBtnStyle}>
                  Load into form
                </button>
                <button
                  type="button"
                  onClick={() => handleArchiveBrief(selectedBrief.id)}
                  disabled={archivingId === selectedBrief.id}
                  style={{ ...smallBtnStyle, color: '#22c55e', borderColor: '#86efac' }}
                >
                  {archivingId === selectedBrief.id ? 'Archiving...' : 'Done'}
                </button>
              </>
            )}
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
