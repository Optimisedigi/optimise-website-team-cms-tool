'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'

const GoogleAdsAuditPreview = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  if (!id) return null

  const overallScore = fields?.overallScore?.value as number | undefined
  const auditStatus = fields?.auditStatus?.value as string | undefined
  const slug = fields?.slug?.value as string | undefined
  const presentationPin = fields?.presentationPin?.value as string | undefined
  const presentationPublished = fields?.presentationPublished?.value as boolean | undefined
  const emailHtml = fields?.emailHtml?.value as string | undefined

  const scoreColor =
    overallScore === undefined
      ? '#6b7280'
      : overallScore >= 70
        ? '#16a34a'
        : overallScore >= 45
          ? '#f59e0b'
          : '#dc2626'

  const presentationUrl = slug
    ? `https://www.optimisedigital.online/partners/google-ads-audit/${slug}${presentationPin ? `?pin=${presentationPin}` : ''}`
    : null

  return (
    <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Audit Summary</h3>

      {/* Score badge */}
      {overallScore !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: scoreColor,
              color: '#fff',
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {overallScore}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Overall Score</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {overallScore >= 70
                ? 'Good — minor optimisations recommended'
                : overallScore >= 45
                  ? 'Needs attention — several areas to improve'
                  : 'Critical — significant issues found'}
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
        <strong>Status:</strong> {auditStatus || 'Not run'}
      </div>

      {/* Presentation link */}
      {presentationUrl && (
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <strong>Presentation:</strong>{' '}
          {presentationPublished ? (
            <a
              href={presentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2563eb' }}
            >
              View presentation
            </a>
          ) : (
            <span style={{ color: '#9ca3af' }}>Not published yet</span>
          )}
        </div>
      )}

      {/* Email preview */}
      {emailHtml && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Email Preview
          </summary>
          <div
            style={{
              marginTop: 8,
              border: '1px solid #e2e8f0',
              borderRadius: 4,
              background: '#fff',
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            <iframe
              srcDoc={emailHtml}
              style={{ width: '100%', height: 400, border: 'none' }}
              title="Email preview"
              sandbox=""
            />
          </div>
        </details>
      )}
    </div>
  )
}

export default GoogleAdsAuditPreview
