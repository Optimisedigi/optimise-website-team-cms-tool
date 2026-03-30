'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────

interface EmailDetail {
  email_number: number
  sent_at: string
}

interface DripLead {
  id: number
  email: string
  name: string
  website: string
  monthly_spend: string
  biggest_concern: string
  additional_notes: string
  form_type: string
  access_shared: boolean
  unsubscribed: boolean
  created_at: string
  emails_detail: EmailDetail[] | null
}

// ─── Helpers ──────────────────────────────────────────────

function getLeadType(lead: DripLead): string {
  if (lead.monthly_spend !== 'not-spending') return 'Active Spender'
  if (lead.biggest_concern === 'want-consultation') return 'Consultation'
  if (lead.biggest_concern === 'want-campaign-structure') return 'Website Audit'
  return 'Other'
}

function getLeadTypeColor(type: string): string {
  switch (type) {
    case 'Active Spender': return '#2563eb'
    case 'Consultation': return '#7c3aed'
    case 'Website Audit': return '#0891b2'
    default: return '#6b7280'
  }
}

function formatSpend(spend: string): string {
  switch (spend) {
    case 'not-spending': return 'Not spending'
    case 'under-2k': return 'Under $2k'
    case '2k-5k': return '$2k-$5k'
    case '5k-15k': return '$5k-$15k'
    case '15k-50k': return '$15k-$50k'
    case '50k-plus': return '$50k+'
    default: return spend
  }
}

function formatConcern(concern: string): string {
  switch (concern) {
    case 'agency-performance': return 'Agency not delivering'
    case 'agency-quality': return 'Unsure about agency'
    case 'scaling': return 'Want to scale'
    case 'not-sure': return 'Not sure'
    case 'want-consultation': return 'Wants consultation'
    case 'want-campaign-structure': return 'Wants campaign structure'
    default: return concern
  }
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const EMAIL_LABELS = ['Confirmation', '+24 hours', '+3 days', '+7 days']
const EMAIL_DESCRIPTIONS = [
  'Immediate confirmation with next steps',
  'Gentle follow-up nudge',
  'Value-add content or resources',
  'Final follow-up with free tools',
]

// ─── Component ────────────────────────────────────────────

export default function DripEmailTracker() {
  const [leads, setLeads] = useState<DripLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/drip-leads')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setLeads(data.leads || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  async function previewEmail(leadId: number, emailNumber: number) {
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/drip-leads?id=${leadId}&preview=${emailNumber}`)
      if (!res.ok) throw new Error('Failed to load preview')
      const data = await res.json()
      setPreviewSubject(data.subject)
      setPreviewHtml(data.html)
    } catch {
      setPreviewSubject('Error')
      setPreviewHtml('<p>Failed to load email preview</p>')
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="od-drip">
        <div className="od-drip__header">
          <h2 className="od-drip__title">Google Ads Drip Emails</h2>
        </div>
        <p className="od-drip__loading">Loading drip leads...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="od-drip">
        <div className="od-drip__header">
          <h2 className="od-drip__title">Google Ads Drip Emails</h2>
        </div>
        <p className="od-drip__error">{error}</p>
      </div>
    )
  }

  return (
    <div className="od-drip">
      <div className="od-drip__header">
        <h2 className="od-drip__title">Google Ads Drip Emails</h2>
        <span className="od-drip__count">{leads.length} lead{leads.length !== 1 ? 's' : ''}</span>
      </div>

      {leads.length === 0 ? (
        <p className="od-drip__empty">No drip leads yet. Leads appear here when someone submits the Google Ads audit form.</p>
      ) : (
        <div className="od-drip__list">
          {leads.map((lead) => {
            const type = getLeadType(lead)
            const sentNumbers = (lead.emails_detail || []).map((e) => e.email_number)
            const isExpanded = expandedId === lead.id

            return (
              <div key={lead.id} className={`od-drip__card ${isExpanded ? 'od-drip__card--expanded' : ''}`}>
                {/* Main row */}
                <button
                  className="od-drip__row"
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  type="button"
                >
                  <div className="od-drip__lead-info">
                    <span className="od-drip__name">{lead.name || 'No name'}</span>
                    <span className="od-drip__email">{lead.email}</span>
                    <span
                      className="od-drip__type-badge"
                      style={{ backgroundColor: getLeadTypeColor(type) }}
                    >
                      {type}
                    </span>
                    {lead.unsubscribed && (
                      <span className="od-drip__status-badge od-drip__status-badge--unsub">Unsubscribed</span>
                    )}
                    {lead.access_shared && (
                      <span className="od-drip__status-badge od-drip__status-badge--access">Access shared</span>
                    )}
                  </div>

                  <div className="od-drip__meta">
                    <span className="od-drip__date">{formatDate(lead.created_at)}</span>
                  </div>

                  {/* Timeline dots */}
                  <div className="od-drip__timeline">
                    {[1, 2, 3, 4].map((n, i) => {
                      const sent = sentNumbers.includes(n)
                      const detail = (lead.emails_detail || []).find((e) => e.email_number === n)
                      return (
                        <div key={n} className="od-drip__timeline-step">
                          {i > 0 && <div className={`od-drip__timeline-line ${sent ? 'od-drip__timeline-line--sent' : ''}`} />}
                          <div
                            className={`od-drip__dot ${sent ? 'od-drip__dot--sent' : ''}`}
                            title={sent && detail ? `Sent ${formatDateTime(detail.sent_at)}` : `Email ${n}: ${EMAIL_LABELS[n - 1]}`}
                          >
                            {sent && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="od-drip__timeline-label">{n}</span>
                        </div>
                      )
                    })}
                  </div>

                  <span className="od-drip__chevron">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="od-drip__detail">
                    <div className="od-drip__detail-grid">
                      <div className="od-drip__detail-item">
                        <span className="od-drip__detail-label">Website</span>
                        <span className="od-drip__detail-value">
                          {lead.website ? (
                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">
                              {lead.website}
                            </a>
                          ) : 'N/A'}
                        </span>
                      </div>
                      <div className="od-drip__detail-item">
                        <span className="od-drip__detail-label">Monthly spend</span>
                        <span className="od-drip__detail-value">{formatSpend(lead.monthly_spend)}</span>
                      </div>
                      <div className="od-drip__detail-item">
                        <span className="od-drip__detail-label">Concern</span>
                        <span className="od-drip__detail-value">{formatConcern(lead.biggest_concern)}</span>
                      </div>
                      {lead.additional_notes && (
                        <div className="od-drip__detail-item od-drip__detail-item--full">
                          <span className="od-drip__detail-label">Notes</span>
                          <span className="od-drip__detail-value">{lead.additional_notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Email sequence */}
                    <div className="od-drip__emails">
                      <h4 className="od-drip__emails-title">Email Sequence</h4>
                      {[1, 2, 3, 4].map((n) => {
                        const detail = (lead.emails_detail || []).find((e) => e.email_number === n)
                        const sent = !!detail
                        return (
                          <div key={n} className={`od-drip__email-row ${sent ? 'od-drip__email-row--sent' : ''}`}>
                            <div className={`od-drip__email-indicator ${sent ? 'od-drip__email-indicator--sent' : ''}`}>
                              {sent ? (
                                <svg width="12" height="10" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <span className="od-drip__email-pending" />
                              )}
                            </div>
                            <div className="od-drip__email-info">
                              <span className="od-drip__email-name">Email {n}: {EMAIL_LABELS[n - 1]}</span>
                              <span className="od-drip__email-desc">{EMAIL_DESCRIPTIONS[n - 1]}</span>
                              {sent && detail && (
                                <span className="od-drip__email-sent-at">Sent {formatDateTime(detail.sent_at)}</span>
                              )}
                            </div>
                            <button
                              className="od-drip__preview-btn"
                              onClick={() => previewEmail(lead.id, n)}
                              type="button"
                            >
                              View email
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Email preview modal */}
      {(previewHtml || previewLoading) && (
        <div className="od-drip__modal-overlay" onClick={() => { setPreviewHtml(null); setPreviewSubject('') }}>
          <div className="od-drip__modal" onClick={(e) => e.stopPropagation()}>
            <div className="od-drip__modal-header">
              <h3 className="od-drip__modal-subject">{previewLoading ? 'Loading...' : previewSubject}</h3>
              <button
                className="od-drip__modal-close"
                onClick={() => { setPreviewHtml(null); setPreviewSubject('') }}
                type="button"
              >
                X
              </button>
            </div>
            <div className="od-drip__modal-body">
              {previewLoading ? (
                <p>Loading email preview...</p>
              ) : (
                <iframe
                  srcDoc={previewHtml || ''}
                  title="Email preview"
                  className="od-drip__modal-iframe"
                  sandbox=""
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
