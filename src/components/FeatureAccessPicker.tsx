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
import { useEffect, useMemo, useState } from 'react'
import {
  FEATURE_KEYS,
  GOOGLE_ADS_BUNDLE_FEATURES,
  computeAutoGrants,
  type FeatureSlug,
} from '../lib/access'

// In-memory cache so re-renders don't re-fetch the same profiles. Cleared
// on full page reload, which is fine for an admin tool.
const PROFILE_FEATURE_CACHE = new Map<string | number, string[]>()

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
      'tag-setup-audits',
      'keyword-snapshots',
      'competitor-analyses',
      'content-researches',
      'gsc-alerts',
      'gsc-indexing-audits',
      'site-health-reports',
    ],
  },
  {
    label: 'Google Ads',
    values: [...GOOGLE_ADS_BUNDLE_FEATURES],
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const explicit = useMemo(
    () => new Set<string>(Array.isArray(value) ? value : []),
    [value],
  )

  // Read the currently selected permission profile IDs from the form. The
  // hasMany relationship stores them as { value, relationTo } objects or as
  // raw ids depending on Payload version — normalise both shapes.
  const profileIds = useMemo<(string | number)[]>(() => {
    const field = (allFields as any)?.permissionProfiles
    const raw = field?.value
    if (!Array.isArray(raw)) return []
    return raw
      .map((item: any) =>
        item && typeof item === 'object' && 'value' in item ? item.value : item,
      )
      .filter((id: any) => id != null)
  }, [allFields])

  // Fetch the `features` array for every selected profile. Cached in module
  // scope so re-renders don't refetch. The picker re-runs whenever profileIds
  // change.
  const [profileFeaturesById, setProfileFeaturesById] = useState<
    Record<string, string[]>
  >({})

  useEffect(() => {
    let cancelled = false
    const idsToFetch = profileIds.filter(
      (id) => !PROFILE_FEATURE_CACHE.has(id),
    )

    if (idsToFetch.length === 0) {
      // All cached — just project the cache into local state.
      const next: Record<string, string[]> = {}
      for (const id of profileIds) {
        next[String(id)] = PROFILE_FEATURE_CACHE.get(id) || []
      }
      setProfileFeaturesById(next)
      return
    }

    Promise.all(
      idsToFetch.map((id) =>
        fetch(`/api/permission-profiles/${id}?depth=0`, {
          credentials: 'include',
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((doc) => {
            const features: string[] = Array.isArray(doc?.features)
              ? doc.features
              : []
            PROFILE_FEATURE_CACHE.set(id, features)
          })
          .catch(() => {
            PROFILE_FEATURE_CACHE.set(id, [])
          }),
      ),
    ).then(() => {
      if (cancelled) return
      const next: Record<string, string[]> = {}
      for (const id of profileIds) {
        next[String(id)] = PROFILE_FEATURE_CACHE.get(id) || []
      }
      setProfileFeaturesById(next)
    })

    return () => {
      cancelled = true
    }
  }, [profileIds.join(',')])

  const profileFeatures = useMemo(() => {
    const s = new Set<string>()
    for (const id of profileIds) {
      const feats = profileFeaturesById[String(id)] || []
      for (const f of feats) s.add(f)
    }
    return s
  }, [profileIds, profileFeaturesById])

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

  if (!mounted) return null

  return (
    <div
      className="permission-profile-admin-panel"
      style={{
        position: 'relative',
        zIndex: 1,
        isolation: 'isolate',
        marginBottom: 24,
        padding: '16px 20px',
        background: '#fff',
        border: '1px solid #d7dce3',
        borderRadius: 8,
        color: '#1f2937',
        opacity: 1,
        filter: 'none',
        WebkitFilter: 'none',
        boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
      }}
    >
      <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: '#1f2937' }}>
        Feature Access
      </label>
      <p
        style={{
          fontSize: 13,
          color: '#374151',
          marginBottom: 14,
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
              border: '1px solid #d7dce3',
              borderRadius: 8,
              padding: '10px 12px 12px',
              margin: 0,
              background: '#fff',
            }}
          >
            <legend
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#4b5563',
                padding: '0 6px',
                background: '#fff',
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
                        ? '#6b7280'
                        : '#1f2937',
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
                        color: '#6b7280',
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
