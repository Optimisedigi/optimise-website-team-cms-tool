'use client'

import { useEffect, useState } from 'react'

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
  open_rate?: number
  reply_rate?: number
  booked_call?: boolean
}

const SEQUENCE = [
  { number: 1, label: 'Welcome' },
  { number: 2, label: 'Free Audit' },
  { number: 3, label: 'Case Study' },
  { number: 4, label: 'Book a Call' },
  { number: 5, label: 'Final Nudge' },
]

function averageMetric(leads: DripLead[], key: 'open_rate' | 'reply_rate'): string {
  const values = leads
    .map((lead) => lead[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (values.length === 0) return '—'
  return `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)}%`
}

export default function DripEmailTracker() {
  const [leads, setLeads] = useState<DripLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchLeads() {
      try {
        const res = await fetch('/api/drip-leads')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (!cancelled) {
          setLeads(data.leads || [])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchLeads()
    return () => {
      cancelled = true
    }
  }, [])

  const activeLeads = leads.filter((lead) => !lead.unsubscribed)
  const sentCounts = SEQUENCE.map((step) =>
    leads.reduce((count, lead) => {
      const sent = (lead.emails_detail || []).some((email) => email.email_number === step.number)
      return count + (sent ? 1 : 0)
    }, 0),
  )
  const bookedCalls = leads.filter((lead) => lead.booked_call).length

  return (
    <div className="od-drip-summary">
      <div className="od-band">
        <div className="od-band__text">
          <span className="od-band__eyebrow">Lifecycle</span>
          <h2>Drip Email Tracker</h2>
        </div>
        <div className="od-band__spacer" />
        <span className="od-box__period">Prospect nurture sequence</span>
      </div>

      <div className="od-box">
        {loading ? (
          <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Loading drip leads...</p>
          </div>
        ) : error ? (
          <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        ) : (
          <div className="od-box__body od-card-pad">
            <div className="od-drip-summary__sequence">
              {SEQUENCE.map((step, index) => (
                <div key={step.number} className="od-drip-summary__node-wrap">
                  {index > 0 && <div className="od-drip-summary__line" />}
                  <div className={`od-drip-summary__node ${sentCounts[index] > 0 ? 'od-drip-summary__node--sent' : ''}`}>
                    <span>{step.number}</span>
                  </div>
                  <strong>{step.label}</strong>
                  <small>{sentCounts[index] || 0} sent</small>
                </div>
              ))}
            </div>

            <div className="od-drip-summary__stats">
              <div className="od-stat">
                <div className="k">Active in Sequence</div>
                <div className="v">{activeLeads.length}</div>
              </div>
              <div className="od-stat">
                <div className="k">Avg Open Rate</div>
                <div className="v">{averageMetric(leads, 'open_rate')}</div>
              </div>
              <div className="od-stat">
                <div className="k">Reply Rate</div>
                <div className="v">{averageMetric(leads, 'reply_rate')}</div>
              </div>
              <div className="od-stat">
                <div className="k">Booked Calls</div>
                <div className="v">{bookedCalls}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
