'use client'

/**
 * FeatureAccessPicker
 *
 * Custom replacement for Payload's default select-multi UI on the
 * `featureAccess` field of the Users collection.
 *
 * Renders the FEATURE_KEYS list as grouped checkboxes. For each option,
 * computes whether it is auto-granted by the user's other selected features
 * (or by an assigned permission profile), and displays such options as
 * ticked + disabled + with an "(auto-granted)" hint.
 *
 * Admins can still tick auto-granted boxes explicitly to "lock in" the
 * grant — those stay on even if the trigger feature is later removed.
 */

import { useField, useAllFormFields } from '@payloadcms/ui'
import { useMemo } from 'react'
import {
  FEATURE_KEYS,
  computeAutoGrants,
  type FeatureSlug,
} from '../lib/access'

// Group definitions for display. Order = render order.
const GROUPS: { label: string; values: FeatureSlug[] }[] = [
  {
    label: 'Clients',
    values: [
      'clients',
      'clients-basic',
      'client-proposals',
      'contracts',
      'sales-leads',
      'process-templates',
      'client-processes',
      'meeting-schedulers',
      'email-templates',
    ],
  },
  {
    label: 'Content',
    values: ['blog-posts', 'blog-prompts', 'job-posts', 'media', 'media-basic'],
  },
  {
    label: 'SEO',
    values: ['internal-link-suggestions'],
  },
  {
    label: 'Audits',
    values: [
      'seo-audits',
      'cro-audits',
      'google-ads-audits',
      'tag-setup-audits',
      'keyword-snapshots',
      'competitor-analyses',
      'content-researches',
      'gsc-alerts',
      'gsc-indexing-audits',
      'negative-keyword-lists',
      'site-health-reports',
    ],
  },
  {
    label: 'Reports',
    values: [
      'ai-visibility-snapshots',
      'serp-displacement-snapshots',
      'serp-displacement-alerts',
    ],
  },
  {
    label: 'Performance',
    values: ['nav:google-analytics', 'nav:search-console', 'nav:deployments'],
  },
  {
    label: 'Finance',
    values: [
      'business-costs',
      'cost-categories',
      'cost-rules',
      'api-cost-rates',
      'nav:invoices',
    ],
  },
  {
    label: 'Settings',
    values: ['nav:integrations', 'nav:indexing-helper', 'sheets-auth', 'calendar-auth'],
  },
  {
    label: 'Admin',
    values: ['nav:dashboard', 'usage-reports'],
  },
]

const LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_KEYS.map((f) => [f.value, f.label]),
)

const FeatureAccessPicker = (props: any) => {
  // Bind to whichever field this is mounted on — used both on
  // Users.featureAccess and PermissionProfiles.features.
  const path: string = props?.path || 'featureAccess'
  const { value, setValue } = useField<string[]>({ path })
  const [allFields] = useAllFormFields()

  const explicit = useMemo(
    () => new Set<string>(Array.isArray(value) ? value : []),
    [value],
  )

  // Permission profile features: read populated profiles from the form. Each
  // row in the relationship hasMany is at `permissionProfiles.0`, etc. When
  // depth>=1 the picker selects render the populated docs; here we just have
  // their IDs in the form state so we have to fetch the profiles separately.
  // For now (until the picker fetches profiles), only consider explicit grants.
  // TODO: fetch profile features and include in `effective` once profiles ship.
  const profileFeatures = useMemo(() => new Set<string>(), [allFields])

  const explicitPlusProfiles = useMemo(() => {
    const s = new Set<string>(explicit)
    for (const f of profileFeatures) s.add(f)
    return s
  }, [explicit, profileFeatures])

  const autoGranted = useMemo(
    () => computeAutoGrants(explicitPlusProfiles),
    [explicitPlusProfiles],
  )

  const toggle = (slug: string, checked: boolean) => {
    const next = new Set<string>(explicit)
    if (checked) next.add(slug)
    else next.delete(slug)
    setValue(Array.from(next))
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
        Feature Access
      </label>
      <p
        style={{
          fontSize: 13,
          color: 'var(--theme-elevation-500, #6b7280)',
          marginBottom: 12,
        }}
      >
        Tick the features this user can see and edit. Some features are
        auto-granted (read-only basic access) when others are ticked — they
        appear here as ticked + disabled. Admins always have full access and
        ignore this list. Delete is always admin-only.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {GROUPS.map((group) => (
          <fieldset
            key={group.label}
            style={{
              border: '1px solid var(--theme-elevation-150, #e5e7eb)',
              borderRadius: 6,
              padding: '8px 12px 12px',
              margin: 0,
            }}
          >
            <legend
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--theme-elevation-500, #6b7280)',
                padding: '0 6px',
              }}
            >
              {group.label}
            </legend>
            {group.values.map((slug) => {
              const isExplicit = explicit.has(slug)
              const isAuto = autoGranted.has(slug) && !isExplicit
              const isProfile = profileFeatures.has(slug) && !isExplicit && !isAuto
              const checked = isExplicit || isAuto || isProfile

              const reason = isExplicit
                ? null
                : isAuto
                  ? 'auto-granted'
                  : isProfile
                    ? 'from profile'
                    : null

              return (
                <label
                  key={slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    fontSize: 13,
                    cursor: isAuto || isProfile ? 'not-allowed' : 'pointer',
                    color:
                      isAuto || isProfile
                        ? 'var(--theme-elevation-500, #6b7280)'
                        : 'var(--theme-text, inherit)',
                  }}
                  title={
                    isAuto
                      ? `Auto-granted because the user has access to a feature that needs this`
                      : isProfile
                        ? `Granted by an assigned Permission Profile`
                        : ''
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isAuto || isProfile}
                    onChange={(e) => toggle(slug, e.target.checked)}
                    style={{ cursor: 'inherit' }}
                  />
                  <span>{LABELS[slug] || slug}</span>
                  {reason && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--theme-elevation-400, #9ca3af)',
                        fontStyle: 'italic',
                      }}
                    >
                      ({reason})
                    </span>
                  )}
                </label>
              )
            })}
          </fieldset>
        ))}
      </div>
    </div>
  )
}

export default FeatureAccessPicker
