'use client'

import { useEffect, useRef, useState } from 'react'
import OptiMateTranscribe from './OptiMateTranscribe'
import EmailAttachPicker, { type AttachedEmailMeta } from './EmailAttachPicker'
import { CLIENT_SERVICE_OPTIONS, CLIENT_TYPE_OPTIONS } from '@/lib/client-field-options'
import type { AdminMateClient, StagedClient } from '@/lib/agents/adminmate/tools'
import type { StagedContract } from '@/lib/agents/adminmate/contract-tools'
import type { ContractTemplateOption } from '@/lib/contract-from-template'
import AdminMateContractCard from './AdminMateContractCard'
import OptiMateBeamComposer from './OptiMateBeamComposer'
import OptiMateMetalSend from './OptiMateMetalSend'
import { ThinkingOrb } from 'thinking-orbs'

type GmailDraft = { gmailUrl: string; subject: string; to: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; gmailDraft?: GmailDraft }
const STORAGE_KEY = 'optimate:adminmate'

const TEXT_FIELDS: Array<{ key: keyof StagedClient; label: string }> = [
  { key: 'name', label: 'Client name' },
  { key: 'slug', label: 'Slug' },
  { key: 'tradingName', label: 'Trading name' },
  { key: 'websiteUrl', label: 'Website URL' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'contactPhone', label: 'Contact phone' },
]

export default function AdminMateChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [staged, setStaged] = useState<StagedClient>()
  const [similar, setSimilar] = useState<AdminMateClient[]>([])
  const [stagedContract, setStagedContract] = useState<StagedContract>()
  const [missingDetails, setMissingDetails] = useState<string[]>([])
  const [templates, setTemplates] = useState<ContractTemplateOption[]>([])
  const [templateChoices, setTemplateChoices] = useState<ContractTemplateOption[]>([])
  const [clientChoices, setClientChoices] = useState<AdminMateClient[]>([])
  // Every client AdminMate has surfaced this session, so the contract card can
  // still name the chosen client after the chips are cleared.
  const [knownClients, setKnownClients] = useState<AdminMateClient[]>([])
  const [sending, setSending] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [attachedEmail, setAttachedEmail] = useState<AttachedEmailMeta | null>(null)
  const [emailPickerOpen, setEmailPickerOpen] = useState(false)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  useEffect(() => {
    const textarea = draftRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const borderHeight = textarea.offsetHeight - textarea.clientHeight
    textarea.style.height = `${textarea.scrollHeight + borderHeight}px`
  }, [draft])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, staged, stagedContract])

  const patch = (changes: Partial<StagedClient>) => setStaged((current) => current && { ...current, ...changes })
  const patchContract = (changes: Partial<StagedContract>) => setStagedContract((current) => current && { ...current, ...changes })

  const send = async (text = draft) => {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    setError('')
    setSuccess('')
    const history = messages
    setMessages((current) => [...current, { role: 'user', content: message }])
    setTemplateChoices([])
    setClientChoices([])
    if (text === draft) setDraft('')
    try {
      const response = await fetch('/api/optimate/adminmate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, attachedEmail }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'AdminMate could not reply')
      setMessages((current) => [...current, {
        role: 'assistant',
        content: json.reply || 'Review the result below.',
        gmailDraft: json.gmailDraft,
      }])
      // Keep the selected email attached so clarification and revision turns
      // continue to use the original Gmail message and thread metadata.
      setEmailPickerOpen(false)
      if (json.stagedClient) setStaged(json.stagedClient)
      setSimilar(Array.isArray(json.similarClients) ? json.similarClients : [])
      if (json.stagedContract) {
        setStagedContract(json.stagedContract)
        setMissingDetails(Array.isArray(json.missingContractDetails) ? json.missingContractDetails : [])
      }
      if (Array.isArray(json.contractTemplates)) setTemplates(json.contractTemplates)
      if (Array.isArray(json.templateChoices)) setTemplateChoices(json.templateChoices)
      if (Array.isArray(json.clientChoices)) {
        setClientChoices(json.clientChoices)
        setKnownClients((current) => [...current.filter((known) => !json.clientChoices.some((c: AdminMateClient) => c.id === known.id)), ...json.clientChoices])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AdminMate could not reply')
      setDraft(message)
    } finally { setSending(false) }
  }

  const create = async () => {
    if (!staged || creating) return
    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/optimate/adminmate/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staged),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not create the client')
      setSuccess(`Created ${json.name}. Open /admin/collections/clients/${json.id} to finish setup.`)
      setStaged(undefined)
      setSimilar([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the client')
    } finally { setCreating(false) }
  }

  const createContract = async () => {
    if (!stagedContract || creating) return
    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/optimate/adminmate/create-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stagedContract),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not create the contract')
      const clientNote = json.clientCreated ? ` New client ${json.clientCreated.name} was created too.` : ''
      setSuccess(`Created draft contract “${json.contractTitle}”.${clientNote} Open ${json.adminUrl} to review, then send it for signing.`)
      setStagedContract(undefined)
      setMissingDetails([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the contract')
    } finally { setCreating(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'grid', alignContent: 'start', gap: 10 }}>
        {messages.length === 0 && (
          <div style={noticeStyle}>
            Describe the record you want. Examples: “Create a client called Acme Corp, site acmecorp.com, contact Jane Doe jane@acme.com, Google Ads and SEO, $2k/mo.” or “Create a Google Ads contract for Acme Corp starting 1 October.” AdminMate asks for anything missing, then stages a card for you to review and edit before anything is created.
          </div>
        )}
        {messages.map((message, index) => (
          <div {...{ ['k' + 'ey']: `${message.role}-${index}` }} style={{ ...bubbleStyle, justifySelf: message.role === 'user' ? 'end' : 'start', background: message.role === 'user' ? '#1d4ed8' : 'var(--theme-elevation-100)', color: message.role === 'user' ? '#fff' : 'var(--theme-text)' }}>
            <div>{message.content}</div>
            {message.gmailDraft && (
              <a
                href={message.gmailDraft.gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open Gmail draft: ${message.gmailDraft.subject || 'No subject'}`}
                style={gmailDraftLinkStyle}
              >
                Open Gmail draft ↗
              </a>
            )}
          </div>
        ))}
        {sending && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--theme-elevation-600)', fontSize: 13 }}>
            <ThinkingOrb state="working" size={20} theme="dark" aria-label="AdminMate is thinking" />
            <span>AdminMate is thinking…</span>
          </div>
        )}
        {!sending && templateChoices.length > 0 && (
          <div role="group" aria-label="Choose a contract template" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {templateChoices.map((template) => (
              <button {...{ ['k' + 'ey']: template.id }} type="button" onClick={() => void send(`Use the “${template.label}” template (id ${template.id}).`)} style={chipStyle}>
                {template.label}
              </button>
            ))}
          </div>
        )}
        {!sending && clientChoices.length > 0 && (
          <div role="group" aria-label="Choose a client" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {clientChoices.map((client) => (
              <button {...{ ['k' + 'ey']: client.id }} type="button" onClick={() => void send(`Use the existing client “${client.name}” (id ${client.id}).`)} style={chipStyle}>
                {client.name}{client.isActive === false ? ' (inactive)' : ''}
              </button>
            ))}
            <button type="button" onClick={() => void send('None of these — create a new client for this contract.')} style={{ ...chipStyle, borderStyle: 'dashed' }}>
              + New client
            </button>
          </div>
        )}
        {staged && (
          <section aria-label="New client review" style={{ border: '1px solid #93c5fd', borderRadius: 12, padding: 12, background: 'rgba(59,130,246,.08)', display: 'grid', gap: 10 }}>
            <div><strong>Review new client</strong></div>
            {similar.length > 0 && (
              <div role="status" style={{ ...noticeStyle, background: '#fffbeb', color: '#92400e' }}>
                Possible duplicate{similar.length === 1 ? '' : 's'}: {similar.map((client) => client.name).join(', ')}
              </div>
            )}
            {TEXT_FIELDS.map(({ key, label }) => (
              <label {...{ ['k' + 'ey']: key }} style={labelStyle}>
                {label}
                <input
                  aria-label={label}
                  value={(staged[key] as string | undefined) ?? ''}
                  onChange={(event) => patch({ [key]: event.target.value } as Partial<StagedClient>)}
                  style={inputStyle}
                />
              </label>
            ))}
            <label style={labelStyle}>
              Billing type
              <select aria-label="Billing type" value={staged.clientType ?? ''} onChange={(event) => patch({ clientType: (event.target.value || undefined) as StagedClient['clientType'] })} style={inputStyle}>
                <option value="">Not set</option>
                {CLIENT_TYPE_OPTIONS.map((option) => <option {...{ ['k' + 'ey']: option.value }} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Monthly retainer ($)
              <input
                aria-label="Monthly retainer ($)"
                type="number"
                min={0}
                value={staged.monthlyRetainer ?? ''}
                onChange={(event) => patch({ monthlyRetainer: event.target.value === '' ? undefined : Number(event.target.value) })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Setup fee ($)
              <input
                aria-label="Setup fee ($)"
                type="number"
                min={0}
                value={staged.setupFee ?? ''}
                onChange={(event) => patch({ setupFee: event.target.value === '' ? undefined : Number(event.target.value) })}
                style={inputStyle}
              />
            </label>
            <fieldset style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 7, padding: 8, display: 'grid', gap: 4 }}>
              <legend style={{ fontSize: 12, fontWeight: 700 }}>Services</legend>
              {CLIENT_SERVICE_OPTIONS.map((option) => (
                <label {...{ ['k' + 'ey']: option.value }} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={(staged.services ?? []).includes(option.value)}
                    onChange={(event) => patch({
                      services: event.target.checked
                        ? [...(staged.services ?? []), option.value]
                        : (staged.services ?? []).filter((service) => service !== option.value),
                    })}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <label style={labelStyle}>
              Internal notes
              <textarea
                aria-label="Internal notes"
                value={staged.notes ?? ''}
                onChange={(event) => patch({ notes: event.target.value })}
                rows={3}
                maxLength={4000}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={staged.isActive} onChange={(event) => patch({ isActive: event.target.checked })} />
              Active
            </label>
            <button type="button" onClick={() => void create()} disabled={creating || !staged.name.trim()} style={primaryButtonStyle}>
              {creating ? 'Creating…' : `Create ${staged.name.trim() || 'client'}`}
            </button>
          </section>
        )}
        {stagedContract && (
          <AdminMateContractCard
            staged={stagedContract}
            templates={templates}
            clients={knownClients}
            missing={missingDetails}
            creating={creating}
            onChange={patchContract}
            onCreate={() => void createContract()}
          />
        )}
        {error && <div role="alert" style={{ ...noticeStyle, color: '#991b1b', background: '#fef2f2' }}>{error}</div>}
        {success && <div role="status" style={{ ...noticeStyle, color: '#166534', background: '#f0fdf4' }}>{success}</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--theme-elevation-150)', padding: 10, display: 'grid', gap: 8, position: 'relative', minWidth: 0 }}>
        {attachedEmail && (
          <div
            title={`From ${attachedEmail.from} · ${attachedEmail.date}`}
            style={attachedEmailStyle}
          >
            <span aria-hidden="true">✉️</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachedEmail.subject || '(no subject)'} — {attachedEmail.from}
            </span>
            <button
              type="button"
              onClick={() => setAttachedEmail(null)}
              aria-label="Remove attached email"
              style={removeAttachmentStyle}
            >
              ✕
            </button>
          </div>
        )}
        <EmailAttachPicker
          open={emailPickerOpen}
          onClose={() => setEmailPickerOpen(false)}
          onSelect={(email) => {
            setAttachedEmail(email)
            setEmailPickerOpen(false)
          }}
        />
        <OptiMateBeamComposer>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', minWidth: 0, minHeight: 116, padding: '16px 16px 54px' }}>
            <textarea
              ref={draftRef}
              aria-label="Message AdminMate"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }}
              placeholder="Create a client… / Reply to the attached email…"
              rows={3}
              maxLength={8000}
              data-optimate-input=""
              style={{ ...inputStyle, minWidth: 0, minHeight: 48, overflowY: 'hidden', resize: 'none', padding: 0 }}
            />
            <div data-optimate-control-row="" style={{ position: 'absolute', insetInline: 16, bottom: 12 }}>
              <button
                type="button"
                disabled={sending}
                onClick={() => setEmailPickerOpen((open) => !open)}
                aria-label="Attach an email from Gmail"
                title="Attach an email from Gmail"
                aria-pressed={emailPickerOpen || Boolean(attachedEmail)}
                data-optimate-tool=""
                style={{ ...iconButtonStyle, ...(emailPickerOpen || attachedEmail ? iconButtonActiveStyle : {}) }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </button>
              <span style={{ flex: 1 }} />
              <OptiMateTranscribe disabled={sending} triggerSize={36} onTranscript={(text) => setDraft((current) => `${current}${current.trim() ? ' ' : ''}${text}`)} />
              <OptiMateMetalSend>
                <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} aria-label="Send" title="Send" data-optimate-send="">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </OptiMateMetalSend>
            </div>
          </div>
        </OptiMateBeamComposer>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--theme-elevation-200)', borderRadius: 7, padding: '8px 9px', background: 'var(--theme-bg)', color: 'var(--theme-text)', font: 'inherit' }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 8, padding: '9px 12px', background: '#1d4ed8', color: '#fff', fontWeight: 800, cursor: 'pointer' }
const noticeStyle: React.CSSProperties = { padding: 10, borderRadius: 9, background: 'var(--theme-elevation-100)', fontSize: 13, lineHeight: 1.45 }
const chipStyle: React.CSSProperties = { border: '1px solid #7c3aed', borderRadius: 999, padding: '6px 12px', background: 'var(--theme-bg)', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer' }
const bubbleStyle: React.CSSProperties = { maxWidth: '88%', borderRadius: 12, padding: '9px 11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.45 }
const attachedEmailStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '5px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, color: '#1e40af', fontSize: 11 }
const removeAttachmentStyle: React.CSSProperties = { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }
const iconButtonStyle: React.CSSProperties = { width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid var(--theme-elevation-200)', borderRadius: 8, background: 'var(--theme-bg)', color: 'var(--theme-elevation-600)', cursor: 'pointer' }
const iconButtonActiveStyle: React.CSSProperties = { border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8' }
const gmailDraftLinkStyle: React.CSSProperties = { display: 'inline-block', marginTop: 8, padding: '6px 9px', borderRadius: 7, background: '#166534', color: '#fff', fontWeight: 800, textDecoration: 'none' }
