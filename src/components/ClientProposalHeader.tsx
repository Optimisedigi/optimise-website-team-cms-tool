'use client'

import { useFormFields } from '@payloadcms/ui'

type ProposalStatus = 'draft' | 'proposal_sent' | 'proposal_presented' | 'client' | 'declined' | string

type FieldValue = string | number | boolean | null | undefined

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  proposal_sent: 'Proposal Sent',
  proposal_presented: 'Proposal Presented',
  client: 'Client',
  declined: 'Declined',
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  trades: 'Trades & Home Services',
  services: 'Professional Services',
  ecommerce: 'E-commerce / Retail',
  healthcare: 'Healthcare',
  hospitality: 'Hospitality & Food',
  realestate: 'Real Estate',
  education: 'Education & Training',
  saas: 'SaaS / Technology',
  other: 'Other',
}

function stringValue(value: FieldValue): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function displayDomain(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim()
}

function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

function statusLabel(status: ProposalStatus): string {
  return STATUS_LABELS[String(status)] || String(status || 'Draft')
}

export default function ClientProposalHeader() {
  const data = useFormFields(([fields]) => ({
    businessName: stringValue(fields.businessName?.value as FieldValue),
    websiteUrl: stringValue(fields.websiteUrl?.value as FieldValue),
    slug: stringValue(fields.slug?.value as FieldValue),
    status: stringValue(fields.proposalStatus?.value as FieldValue) || 'draft',
    proposalPin: stringValue(fields.proposalPin?.value as FieldValue),
    contactName: stringValue(fields.contactName?.value as FieldValue),
    contactEmail: stringValue(fields.contactEmail?.value as FieldValue),
    businessType: stringValue(fields.businessType?.value as FieldValue),
    conversionGoal: stringValue(fields.conversionGoal?.value as FieldValue),
    googleAdsCustomerId: stringValue(fields.googleAdsCustomerId?.value as FieldValue),
    ga4PropertyId: stringValue(fields.ga4PropertyId?.value as FieldValue),
    gscSiteUrl: stringValue(fields.gscSiteUrl?.value as FieldValue),
    hasPhysicalLocations: fields.hasPhysicalLocations?.value === true,
    numberOfLocations: stringValue(fields.numberOfLocations?.value as FieldValue),
  }))

  const name = data.businessName || 'Untitled proposal'
  const domain = displayDomain(data.websiteUrl)
  const detailItems = [
    data.contactName && { label: 'Contact', value: data.contactName },
    data.contactEmail && { label: 'Email', value: data.contactEmail },
    data.businessType && { label: 'Business type', value: BUSINESS_TYPE_LABELS[data.businessType] || data.businessType },
    data.conversionGoal && { label: 'Conversion goal', value: data.conversionGoal },
    data.googleAdsCustomerId && { label: 'Google Ads', value: data.googleAdsCustomerId },
    data.ga4PropertyId && { label: 'GA4', value: data.ga4PropertyId },
    data.gscSiteUrl && { label: 'GSC', value: displayDomain(data.gscSiteUrl) || data.gscSiteUrl },
    data.hasPhysicalLocations && { label: 'Locations', value: data.numberOfLocations || 'Yes' },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <section
      className="od-admin-form-section od-client-head od-client-proposal-head"
      aria-labelledby="client-proposal-header-title"
    >
      <div className="od-client-head__logo-btn od-client-proposal-head__avatar" aria-hidden="true">
        <span className="od-client-head__logo od-client-head__logo--initial">{initialOf(name)}</span>
      </div>

      <div className="od-client-head__body">
        <div className="od-client-head__topline">
          <div className="od-client-head__identity">
            <h1 id="client-proposal-header-title" className="od-client-head__name">{name}</h1>
            {domain && (
              <a className="od-client-head__meta-item" href={data.websiteUrl} target="_blank" rel="noreferrer">
                <span aria-hidden>🌐</span> {domain}
              </a>
            )}
            {data.slug && (
              <span className="od-client-head__meta-item">
                <span aria-hidden>/</span> {data.slug}
              </span>
            )}
            <span className="od-client-head__pill od-client-head__pill--active">{statusLabel(data.status)}</span>
            {detailItems.length > 0 && (
              <span className="od-client-head__overview" tabIndex={0} aria-label="Proposal setup details">
                <span className="od-client-head__overview-icon" aria-hidden>
                  ?
                </span>
                <span className="od-client-head__overview-popover" role="tooltip">
                  <strong>Proposal setup details</strong>
                  <ul>
                    {detailItems.map((item) => (
                      <li key={item.label}>
                        <strong>{item.label}:</strong> {item.value}
                      </li>
                    ))}
                  </ul>
                </span>
              </span>
            )}
          </div>

          {data.proposalPin && (
            <div className="od-client-head__pin" title="Proposal PIN">
              <span className="od-client-head__pin-label">PIN</span>
              <span className="od-client-head__pin-value">{data.proposalPin}</span>
            </div>
          )}
        </div>

      </div>
    </section>
  )
}
