'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type Relationship = number | { id: number }

interface VocabularyRecord {
  id: number
  phrase: string
  classification: 'relevant' | 'irrelevant'
  scope: string
  enabled: boolean
}

interface ReviewGroupRecord {
  id: number
  snapshot: Relationship
  fingerprint: string
  classificationState: 'relevant' | 'irrelevant' | 'review' | 'split'
  representativeTerms: string[]
  metrics?: { clicks?: number; cost?: number; conversions?: number }
}

const getId = (value: Relationship | null | undefined) =>
  typeof value === 'object' && value ? value.id : value ?? null

const GoogleAdsSearchQueryReview = () => {
  const { id: auditId } = useDocumentInfo()
  const [vocabulary, setVocabulary] = useState<VocabularyRecord[]>([])
  const [reviewGroups, setReviewGroups] = useState<ReviewGroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auditId) return

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const auditResponse = await fetch(`/api/google-ads-audits/${auditId}?depth=0`, {
          credentials: 'include',
        })
        if (!auditResponse.ok) throw new Error(`Could not load audit (${auditResponse.status})`)

        const audit = await auditResponse.json()
        const clientId = getId(audit.client)
        if (!clientId) {
          setLoading(false)
          return
        }

        const [vocabularyResponse, snapshotsResponse, groupsResponse] = await Promise.all([
          fetch(`/api/search-query-vocabulary?where[client][equals]=${clientId}&sort=phrase&limit=500&depth=0`, {
            credentials: 'include',
          }),
          fetch(`/api/google-ads-audit-snapshots?where[audit][equals]=${auditId}&limit=500&depth=0`, {
            credentials: 'include',
          }),
          fetch(`/api/search-query-review-groups?where[client][equals]=${clientId}&sort=-updatedAt&limit=1000&depth=0`, {
            credentials: 'include',
          }),
        ])

        if (!vocabularyResponse.ok || !snapshotsResponse.ok || !groupsResponse.ok) {
          throw new Error('Could not load search-query review data')
        }

        const [vocabularyData, snapshotsData, groupsData] = await Promise.all([
          vocabularyResponse.json(),
          snapshotsResponse.json(),
          groupsResponse.json(),
        ])
        const snapshotIds = new Set<number>((snapshotsData.docs || []).map((snapshot: { id: number }) => snapshot.id))

        setVocabulary(vocabularyData.docs || [])
        setReviewGroups(
          (groupsData.docs || []).filter((group: ReviewGroupRecord) => {
            const snapshotId = getId(group.snapshot)
            return snapshotId != null && snapshotIds.has(snapshotId)
          }),
        )
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load search-query review data')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [auditId])

  if (!auditId) return null

  if (loading) {
    return <p style={{ color: '#64748b', fontSize: 13 }}>Loading search-query review data…</p>
  }

  if (error) {
    return <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>
  }

  return (
    <section aria-labelledby="search-query-review-heading" style={{ maxWidth: 1100 }}>
      <h3 id="search-query-review-heading" style={{ marginBottom: 6 }}>Search-query review</h3>
      <p style={{ color: '#475569', fontSize: 13, marginTop: 0 }}>
        Vocabulary applies to this audit&apos;s client. Review groups are limited to snapshots created for this audit.
      </p>

      <h4>Search query vocabulary ({vocabulary.length})</h4>
      {vocabulary.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>No vocabulary has been saved for this client.</p>
      ) : (
        <table className="table" style={{ width: '100%', marginBottom: 24 }}>
          <thead>
            <tr><th>Phrase</th><th>Classification</th><th>Scope</th><th>Status</th></tr>
          </thead>
          <tbody>
            {vocabulary.map((entry) => (
              <tr key={entry.id}>
                <td><a href={`/admin/collections/search-query-vocabulary/${entry.id}`}>{entry.phrase}</a></td>
                <td>{entry.classification}</td>
                <td>{entry.scope}</td>
                <td>{entry.enabled ? 'Enabled' : 'Disabled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>Search query review groups ({reviewGroups.length})</h4>
      {reviewGroups.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>No review groups have been generated for this audit yet.</p>
      ) : (
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Group</th><th>State</th><th>Representative terms</th><th>Clicks</th><th>Cost</th><th>Conversions</th></tr>
          </thead>
          <tbody>
            {reviewGroups.map((group) => (
              <tr key={group.id}>
                <td><a href={`/admin/collections/search-query-review-groups/${group.id}`}>{group.fingerprint}</a></td>
                <td>{group.classificationState}</td>
                <td>{Array.isArray(group.representativeTerms) ? group.representativeTerms.slice(0, 3).join(', ') : '—'}</td>
                <td>{group.metrics?.clicks?.toLocaleString() ?? '—'}</td>
                <td>{group.metrics?.cost?.toLocaleString(undefined, { style: 'currency', currency: 'AUD' }) ?? '—'}</td>
                <td>{group.metrics?.conversions?.toLocaleString() ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default GoogleAdsSearchQueryReview
