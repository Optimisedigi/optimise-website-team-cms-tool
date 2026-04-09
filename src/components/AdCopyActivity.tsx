'use client'

import { useAllFormFields } from '@payloadcms/ui'

type TimelineEvent = {
  label: string
  date: string | null
  color: string
  bgColor: string
}

const AdCopyActivityInner = () => {
  const [fields] = useAllFormFields()

  const adCopyStatus = fields?.adCopyStatus?.value as string | undefined
  const generatedAt = fields?.adCopyGeneratedAt?.value as string | undefined
  const publishedAt = fields?.adCopyPublishedAt?.value as string | undefined
  const approvedAt = fields?.adCopyApprovedAt?.value as string | undefined
  const deployedAt = fields?.adCopyDeployedAt?.value as string | undefined
  const deployStatus = fields?.adCopyDeployStatus?.value as string | undefined

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  }

  const events: TimelineEvent[] = []

  if (generatedAt) {
    events.push({ label: 'Ad copy generated', date: generatedAt, color: '#1e40af', bgColor: '#dbeafe' })
  }
  if (publishedAt || adCopyStatus === 'published' || adCopyStatus === 'approved') {
    events.push({ label: 'Preview sent to client', date: publishedAt || null, color: '#7c2d12', bgColor: '#ffedd5' })
  }
  if (approvedAt || adCopyStatus === 'approved') {
    events.push({ label: 'Client submitted for approval', date: approvedAt || null, color: '#065f46', bgColor: '#d1fae5' })
  }
  if (deployedAt || deployStatus === 'completed') {
    events.push({ label: 'Ad copy deployed to Google Ads', date: deployedAt || null, color: '#7c3aed', bgColor: '#ede9fe' })
  }
  if (deployStatus === 'deploying') {
    events.push({ label: 'Deploying to Google Ads...', date: null, color: '#92400e', bgColor: '#fef3c7' })
  }

  if (events.length === 0 && !adCopyStatus) return null

  const statusLabels: Record<string, { text: string; color: string; bg: string }> = {
    draft: { text: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
    generating: { text: 'Generating...', color: '#92400e', bg: '#fef3c7' },
    generated: { text: 'Generated', color: '#1e40af', bg: '#dbeafe' },
    published: { text: 'Sent to Client', color: '#9a3412', bg: '#ffedd5' },
    approved: { text: 'Submitted for Approval', color: '#065f46', bg: '#d1fae5' },
  }

  const status = adCopyStatus ? statusLabels[adCopyStatus] : null

  return (
    <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#334155' }}>Ad Copy Activity</h4>
        {status && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            color: status.color, background: status.bg,
          }}>
            {status.text}
          </span>
        )}
      </div>

      {events.length > 0 ? (
        <div style={{ position: 'relative', paddingLeft: 16 }}>
          {/* Vertical timeline line */}
          <div style={{
            position: 'absolute', left: 5, top: 6, bottom: 6, width: 2,
            background: '#e2e8f0', borderRadius: 1,
          }} />

          {events.map((event, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: i < events.length - 1 ? 14 : 0 }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -14, top: 4, width: 10, height: 10,
                borderRadius: '50%', background: event.color, border: '2px solid #fff',
              }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: event.color }}>{event.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                {event.date ? formatDate(event.date) : 'Date not recorded'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>No activity yet.</div>
      )}
    </div>
  )
}

const AdCopyActivity = () => {
  try {
    return <AdCopyActivityInner />
  } catch {
    return null
  }
}

export default AdCopyActivity
