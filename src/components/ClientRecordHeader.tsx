'use client'

import { useAllFormFields, useDocumentInfo, useField, useFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'
import {
  historicalRevenueTotal,
  monthlyCommissionForDate,
  netMonthlyRetainer,
  oneOffsYTD,
  retainerRevenueYTD,
  revenueShareFactor,
  type HistoricalRevenueYear,
  type ReferralCommission,
  type RetainerHistoryEntry,
  type OneOffProject,
} from '@/lib/client-revenue'

/**
 * Client record header card — the mockup's `.detail-head` (mockups/4-client-record.html).
 *
 * Combines, in one card above the tabs:
 *  - a CLICKABLE circular logo that opens the logo upload picker (the separate
 *    Logo field below is hidden — this is the only place to set it),
 *  - name + website + slug + Active/Inactive status pill,
 *  - EDITABLE service pills wired to the real `services` select field,
 *  - a revenue stat strip (Monthly Retainer / Commissions / One-off Billings /
 *    Total Revenue / Client Since) computed from the saved billing fields.
 *
 * Static details (name, website, slug, status, logo, revenue) come from the
 * SAVED record via the REST API. The service pills read/write live form state
 * so toggling them updates the `services` field immediately (saved on Save).
 *
 * While mounted it tags <body> with `od-client-record` so scoped CSS can hide
 * Payload's native title block + Logo field and render the mockup-style topbar.
 */

type ServiceValue =
  | 'google_ads'
  | 'seo'
  | 'paid_social'
  | 'website_build'
  | 'automations'

const SERVICE_OPTIONS: { value: ServiceValue; label: string }[] = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'seo', label: 'SEO' },
  { value: 'paid_social', label: 'Paid Social' },
  { value: 'website_build', label: 'Website Build' },
  { value: 'automations', label: 'Automations' },
]

type SavedData = {
  name: string
  websiteUrl: string
  slug: string
  isActive: boolean
  isAgency: boolean
  logoThumbUrl: string
  clientPin: string
  services: ServiceValue[]
  // Billing inputs for the revenue strip.
  monthlyRetainer: number
  setupFee: number
  revenueSharePercent: number
  clientStartDate: string | null
  oneOffProjects: OneOffProject[]
  retainerHistory: RetainerHistoryEntry[]
  referralCommissions: ReferralCommission[]
  historicalRevenueByYear: HistoricalRevenueYear[]
}

function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

function displayDomain(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim()
}

function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-AU')}`
}

type RelationshipValue =
  | string
  | number
  | { id?: string | number; value?: string | number | { id?: string | number } }
  | null
  | undefined

type RevenueStrip = {
  monthlyRetainer: number
  commissions: number
  oneOff: number
  total: number
  clientSince: string | null
}

// Mirrors the computation in ClientBillingSummary so the header strip matches
// the dashboard / billing summary numbers exactly.
function computeRevenue(d: SavedData): RevenueStrip {
  const share = revenueShareFactor(d.revenueSharePercent)
  const now = new Date()
  const commissions = monthlyCommissionForDate(d.referralCommissions, d.monthlyRetainer, now)
  const netRetainer =
    netMonthlyRetainer(d.monthlyRetainer, d.referralCommissions, now) * share

  const currentYear = now.getFullYear()
  const priorPeriodThisYear = d.historicalRevenueByYear.reduce(
    (s, r) =>
      Number(r?.year) === currentYear && Number.isFinite(Number(r?.amount))
        ? s + Math.max(0, Number(r?.amount))
        : s,
    0,
  )
  const retainerRevenue =
    (retainerRevenueYTD(
      {
        monthlyRetainer: d.monthlyRetainer,
        setupFee: d.setupFee,
        clientStartDate: d.clientStartDate,
        retainerHistory: d.retainerHistory,
        referralCommissions: d.referralCommissions,
        oneOffProjects: d.oneOffProjects,
      },
      now,
    ) +
      priorPeriodThisYear) *
    share
  const oneOffTotal = oneOffsYTD(d.oneOffProjects, now, false) * share
  const historicalFull = historicalRevenueTotal(d.historicalRevenueByYear)
  const priorYearsHistorical = (historicalFull - priorPeriodThisYear) * share
  const total = retainerRevenue + oneOffTotal + priorYearsHistorical

  return {
    monthlyRetainer: netRetainer,
    commissions,
    oneOff: oneOffTotal,
    total,
    clientSince: d.clientStartDate,
  }
}

function relationshipId(value: RelationshipValue): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    if (typeof value.id === 'string' || typeof value.id === 'number') return String(value.id)
    if (typeof value.value === 'string' || typeof value.value === 'number') return String(value.value)
    if (value.value && typeof value.value === 'object') {
      const nestedId = value.value.id
      if (typeof nestedId === 'string' || typeof nestedId === 'number') return String(nestedId)
    }
  }
  return null
}

function normalizeClient(doc: any): SavedData {
  return {
    name: typeof doc.name === 'string' ? doc.name : '',
    websiteUrl: typeof doc.websiteUrl === 'string' ? doc.websiteUrl : '',
    slug: typeof doc.slug === 'string' ? doc.slug : '',
    isActive: doc.isActive !== false,
    isAgency: !!doc.isAgency,
    logoThumbUrl: typeof doc.logoThumbUrl === 'string' ? doc.logoThumbUrl : '',
    clientPin: typeof doc.clientPin === 'string' ? doc.clientPin : '',
    services: Array.isArray(doc.services)
      ? doc.services.filter((value: unknown): value is ServiceValue =>
          SERVICE_OPTIONS.some((option) => option.value === value),
        )
      : [],
    monthlyRetainer: Number(doc.monthlyRetainer ?? 0),
    setupFee: Number(doc.setupFee ?? 0),
    revenueSharePercent: Number(doc.revenueSharePercent ?? 100),
    clientStartDate: doc.clientStartDate ?? null,
    oneOffProjects: Array.isArray(doc.oneOffProjects) ? doc.oneOffProjects : [],
    retainerHistory: Array.isArray(doc.retainerHistory) ? doc.retainerHistory : [],
    referralCommissions: Array.isArray(doc.referralCommissions) ? doc.referralCommissions : [],
    historicalRevenueByYear: Array.isArray(doc.historicalRevenueByYear)
      ? doc.historicalRevenueByYear
      : [],
  }
}

function ClientRecordHeader() {
  const { collectionSlug } = useDocumentInfo()
  if (collectionSlug === 'google-ads-audits') return <GoogleAdsLinkedClientHeader />
  return <ClientRecordHeaderForClient />
}

function ClientRecordHeaderForClient() {
  // `lastUpdateTime` changes on every successful save, so depending on it below
  // re-fetches the header's saved data (logo, status, revenue) after the user
  // saves — e.g. after picking a new logo from the header avatar.
  const { id, lastUpdateTime } = useDocumentInfo()
  const [data, setData] = useState<SavedData | null>(null)

  // Live, editable services selection (clickable pills write straight to the
  // `services` field's form state).
  const { value: servicesValue, setValue: setServices } = useField<ServiceValue[]>({
    path: 'services',
  })
  // Read live from form state so toggling Is Agency immediately hides revenue stats.
  const isAgency = useFormFields(([fields]) => !!fields.isAgency?.value)

  useEffect(() => {
    document.body.classList.add('od-client-record')
    return () => {
      document.body.classList.remove('od-client-record')
    }
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`/api/clients/${id}?depth=0`)
      .then((res) => res.json())
      .then((doc) => {
        if (cancelled) return
        setData(normalizeClient(doc))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, lastUpdateTime])

  // Open the (hidden) logo upload field's "Choose from existing" picker.
  const openLogoPicker = useCallback(() => {
    const toggler = document.querySelector<HTMLButtonElement>(
      '#field-logo .upload__listToggler, #field-logo .upload__createNewToggler',
    )
    toggler?.click()
  }, [])

  const toggleService = useCallback(
    (value: ServiceValue) => {
      const current = Array.isArray(servicesValue) ? servicesValue : []
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      setServices(next)
    },
    [servicesValue, setServices],
  )

  // New (unsaved) documents have no id.
  if (!id || !data) return null

  const showRevenue = !data.isAgency && !isAgency

  const selected = new Set(Array.isArray(servicesValue) ? servicesValue : [])

  return (
    <ClientHeaderCard
      data={data}
      selectedServices={selected}
      showRevenue={showRevenue}
      clientPin={data.clientPin}
      onLogoClick={openLogoPicker}
      onServiceToggle={toggleService}
    />
  )
}

function ClientHeaderCard({
  data,
  selectedServices,
  showRevenue,
  clientPin,
  onLogoClick,
  onServiceToggle,
}: {
  data: SavedData
  selectedServices: Set<ServiceValue>
  showRevenue: boolean
  clientPin?: string
  onLogoClick?: () => void
  onServiceToggle?: (value: ServiceValue) => void
}) {
  const { name, websiteUrl, slug, isActive, logoThumbUrl } = data
  const domain = displayDomain(websiteUrl)
  const isRecurring = isActive && data.monthlyRetainer > 0
  const revenue = computeRevenue(data)
  const clientSinceLabel = revenue.clientSince
    ? new Date(revenue.clientSince).toLocaleDateString('en-AU', {
        month: 'short',
        year: '2-digit',
      })
    : '—'

  return (
    <div className="od-client-head">
      <button
        type="button"
        className="od-client-head__logo-btn"
        onClick={onLogoClick}
        disabled={!onLogoClick}
        title={onLogoClick ? 'Change logo' : undefined}
        aria-label="Client logo"
      >
        {logoThumbUrl ? (
          <img className="od-client-head__logo" src={logoThumbUrl} alt={`${name} logo`} />
        ) : (
          <span className="od-client-head__logo od-client-head__logo--initial">
            {initialOf(name)}
          </span>
        )}
        <span className="od-client-head__logo-edit" aria-hidden>
          ✎
        </span>
      </button>

      <div className="od-client-head__body">
        <div className="od-client-head__topline">
          <div className="od-client-head__identity">
            <h1 className="od-client-head__name">{name || 'Untitled client'}</h1>
            {domain && (
              <a
                className="od-client-head__meta-item"
                href={websiteUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span aria-hidden>🌐</span> {domain}
              </a>
            )}
            {slug && (
              <span className="od-client-head__meta-item">
                <span aria-hidden>📍</span> {slug}
              </span>
            )}
            <span
              className={`od-client-head__pill ${
                isActive ? 'od-client-head__pill--active' : 'od-client-head__pill--inactive'
              }`}
            >
              {isActive ? 'Active' : 'Inactive'}
            </span>
            {data.isAgency && (
              <span className="od-client-head__pill od-client-head__pill--agency">
                Agency
              </span>
            )}
            {isRecurring && showRevenue && (
              <span className="od-client-head__pill od-client-head__pill--recurring">
                Recurring
              </span>
            )}
          </div>

          <div className="od-client-head__services">
            <span className="od-client-head__services-label">Services</span>
            {onServiceToggle ? (
              SERVICE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`od-svc-pill ${selectedServices.has(value) ? 'od-svc-pill--on' : ''}`}
                  onClick={() => onServiceToggle(value)}
                  aria-pressed={selectedServices.has(value)}
                >
                  {label}
                </button>
              ))
            ) : selectedServices.size > 0 ? (
              SERVICE_OPTIONS.filter(({ value }) => selectedServices.has(value)).map(({ value, label }) => (
                <span key={value} className="od-svc-pill od-svc-pill--on">
                  {label}
                </span>
              ))
            ) : (
              <span className="od-client-head__services-empty">No services selected</span>
            )}
          </div>
        </div>

        {clientPin && (
          <div className="od-client-head__pin" title="Client PIN">
            <span className="od-client-head__pin-label">PIN</span>
            <span className="od-client-head__pin-value">{clientPin}</span>
          </div>
        )}

        {showRevenue && <div className="od-client-head__strip">
          <div className="od-client-head__stat">
            <div className="od-client-head__stat-label">Monthly Retainer</div>
            <div className="od-client-head__stat-value">
              {formatCurrency(revenue.monthlyRetainer)}
            </div>
          </div>
          <div className="od-client-head__stat">
            <div className="od-client-head__stat-label">Commissions</div>
            <div className="od-client-head__stat-value">{formatCurrency(revenue.commissions)}</div>
          </div>
          <div className="od-client-head__stat">
            <div className="od-client-head__stat-label">One-off Billings</div>
            <div className="od-client-head__stat-value">{formatCurrency(revenue.oneOff)}</div>
          </div>
          <div className="od-client-head__stat od-client-head__stat--total">
            <div className="od-client-head__stat-label">Total Revenue</div>
            <div className="od-client-head__stat-value">{formatCurrency(revenue.total)}</div>
          </div>
          <div className="od-client-head__stat">
            <div className="od-client-head__stat-label">Client Since</div>
            <div className="od-client-head__stat-value">{clientSinceLabel}</div>
          </div>
        </div>}
      </div>
    </div>
  )
}

function GoogleAdsLinkedClientHeader() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [data, setData] = useState<SavedData | null>(null)
  const [savedClientId, setSavedClientId] = useState<string | null>(null)

  const formClientId = relationshipId(fields?.client?.value as RelationshipValue)
  const clientId = formClientId ?? savedClientId

  useEffect(() => {
    if (!id || formClientId) {
      setSavedClientId(null)
      return
    }
    let cancelled = false
    fetch(`/api/google-ads-audits/${id}?depth=0`)
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (cancelled) return
        setSavedClientId(relationshipId(doc?.client as RelationshipValue))
      })
      .catch(() => {
        if (!cancelled) setSavedClientId(null)
      })
    return () => {
      cancelled = true
    }
  }, [formClientId, id, lastUpdateTime])

  useEffect(() => {
    if (!clientId) {
      setData(null)
      return
    }
    let cancelled = false
    fetch(`/api/clients/${clientId}?depth=0`)
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (cancelled) return
        setData(doc ? normalizeClient(doc) : null)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [clientId, lastUpdateTime])

  if (!data) return null

  const selected = new Set(data.services)

  return (
    <ClientHeaderCard
      data={data}
      selectedServices={selected}
      showRevenue={false}
      clientPin={data.clientPin}
    />
  )
}

export default ClientRecordHeader
