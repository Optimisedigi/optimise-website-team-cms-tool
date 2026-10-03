'use client'

/**
 * Section card for the client record's Business tab (design handoff
 * "Section card"). Used as the custom `Field` of an UNNAMED Payload group, so
 * it changes presentation only: the group's children render through Payload's
 * own `RenderFields` with the same paths, and no data is namespaced.
 *
 * Behaviour comes from `admin.custom.odSection` on the group config:
 *   - id / menuLabel: anchor + label for the "On this tab" menu
 *   - hideFromMenu: conditional extras (WeCanQuit) stay out of the menu
 *   - switchPath: header switch bound to a checkbox field (Locations, Pulse)
 *   - switchStateLabel: show "On"/"Off" beside the switch (Pulse)
 *   - hideBodyWhenOff: collapse the body while the switch is off (Locations)
 *   - collapsible: 'caret' (Pulse) or 'text' (Advanced, "Show"/"Hide");
 *     starts collapsed
 *   - headerSlot: extra header content ('wcqSynced')
 *   - panels: true → direct children are unnamed groups whose Field is
 *     `BusinessSubPanel` with `admin.custom.odPanel = { id, label, countPath? }`;
 *     they render as sub-tabs (one visible at a time)
 */

import { RenderFields, useField, useFormFields, useFormSubmitted } from '@payloadcms/ui'
import type { ClientField, GroupFieldClientComponent } from 'payload'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { BusinessPanelContext } from './business-panel-context'
import { WeCanQuitSyncedLabel } from './WeCanQuitStatsField'

type SectionConfig = {
  id: string
  menuLabel?: string
  hideFromMenu?: boolean
  switchPath?: string
  switchLabel?: string
  switchStateLabel?: boolean
  hideBodyWhenOff?: boolean
  collapsible?: 'caret' | 'text'
  headerSlot?: 'wcqSynced'
  panels?: boolean
}

type PanelConfig = {
  id: string
  label: string
  countPath?: string
}

function readCustom<T>(field: ClientField, key: string): T | undefined {
  const admin = (field as { admin?: { custom?: Record<string, unknown> } }).admin
  const value = admin?.custom?.[key]
  return value && typeof value === 'object' ? (value as T) : undefined
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'en' in value) {
    const en = (value as { en?: unknown }).en
    return typeof en === 'string' ? en : ''
  }
  return ''
}

/** Top-level data names a panel owns, used to find validation errors inside it. */
function dataNamesOf(fields: readonly ClientField[]): string[] {
  const names: string[] = []
  for (const f of fields) {
    if ('name' in f && typeof f.name === 'string' && f.name) names.push(f.name)
    else if ('fields' in f && Array.isArray(f.fields)) names.push(...dataNamesOf(f.fields as ClientField[]))
  }
  return names
}

function HeaderSwitch({
  path,
  label,
  showState,
  readOnly,
}: {
  path: string
  label: string
  showState: boolean
  readOnly: boolean
}): ReactNode {
  const { value, setValue } = useField<boolean>({ path })
  const on = Boolean(value)
  return (
    <>
      {showState && (
        <span className="od-biz-section__state" aria-hidden>
          {on ? 'On' : 'Off'}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className="od-biz-switch"
        disabled={readOnly}
        onClick={(event) => {
          event.stopPropagation()
          setValue(!on)
        }}
      />
    </>
  )
}

function useSwitchValue(path: string | undefined): boolean {
  return useFormFields(([fields]) => (path ? Boolean(fields[path]?.value) : true))
}

const BusinessSection: GroupFieldClientComponent = (props) => {
  const { field, path, indexPath, parentPath, parentSchemaPath, permissions, readOnly } = props
  const config = readCustom<SectionConfig>(field as ClientField, 'odSection') ?? { id: path ?? 'section' }
  const title = textOf(field.label)
  const description = textOf(field.admin?.description)
  const headingId = useId()
  const bodyId = useId()

  const [open, setOpen] = useState(!config.collapsible)
  const switchOn = useSwitchValue(config.switchPath)
  const bodyVisible = open && (!config.hideBodyWhenOff || switchOn)

  const childFields = field.fields
  const panels = useMemo(
    () =>
      config.panels
        ? childFields.flatMap((child) => {
            const panel = readCustom<PanelConfig>(child, 'odPanel')
            return panel ? [{ ...panel, names: dataNamesOf([child]) }] : []
          })
        : [],
    [config.panels, childFields],
  )
  const [activePanel, setActivePanel] = useState<string | undefined>(panels[0]?.id)

  // Row counts for sub-tab badges ("Projects 3").
  const countPaths = panels.map((p) => p.countPath).filter((p): p is string => Boolean(p))
  const countsKey = useFormFields(([fields]) =>
    countPaths.map((p) => {
      const rows = fields[p]?.rows
      return Array.isArray(rows) ? rows.length : 0
    }).join(','),
  )
  const counts = countsKey ? countsKey.split(',').map(Number) : []

  // After a failed save, jump to the first sub-tab that holds an error so the
  // message is never hidden behind an inactive panel.
  const submitted = useFormSubmitted()
  const panelNames = panels.map((p) => p.names)
  const firstInvalidPanel = useFormFields(([fields]) => {
    if (!panelNames.length) return -1
    const invalid = Object.entries(fields)
      .filter(([, state]) => state && state.valid === false)
      .map(([key]) => key)
    return panelNames.findIndex((names) =>
      invalid.some((key) => names.some((n) => key === n || key.startsWith(`${n}.`))),
    )
  })
  useEffect(() => {
    if (submitted && firstInvalidPanel >= 0) {
      const target = panels[firstInvalidPanel]
      if (target) setActivePanel(target.id)
    }
  }, [submitted, firstInvalidPanel, panels])

  const titleBlock = (
    <span className="od-biz-section__titles">
      <h2 className="od-biz-section__title" id={headingId}>
        {title}
      </h2>
      {description && <span className="od-biz-section__desc">{description}</span>}
    </span>
  )

  const headerExtras = (
    <>
      {config.headerSlot === 'wcqSynced' && <WeCanQuitSyncedLabel />}
      {config.switchPath && (
        <HeaderSwitch
          path={config.switchPath}
          label={config.switchLabel ?? title}
          showState={Boolean(config.switchStateLabel)}
          readOnly={Boolean(readOnly)}
        />
      )}
    </>
  )

  let header: ReactNode
  if (config.collapsible === 'caret') {
    header = (
      <header className="od-biz-section__header">
        <button
          type="button"
          className="od-biz-section__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <svg
            className="od-biz-section__caret"
            data-open={open}
            viewBox="0 0 10 10"
            width="10"
            height="10"
            aria-hidden
            focusable="false"
          >
            <path d="M3 1.5 7.5 5 3 8.5Z" fill="currentColor" />
          </svg>
          {titleBlock}
        </button>
        {headerExtras}
      </header>
    )
  } else if (config.collapsible === 'text') {
    header = (
      <header className="od-biz-section__header od-biz-section__header--button">
        <button
          type="button"
          className="od-biz-section__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          {titleBlock}
          <span className="od-biz-section__toggle-text" aria-hidden>
            {open ? 'Hide' : 'Show'}
          </span>
        </button>
      </header>
    )
  } else {
    header = (
      <header
        className={`od-biz-section__header${panels.length ? ' od-biz-section__header--tabs' : ''}`}
      >
        <div className="od-biz-section__header-row">
          {titleBlock}
          {headerExtras}
        </div>
        {panels.length > 0 && (
          <div className="od-biz-subtabs" role="tablist" aria-labelledby={headingId}>
            {panels.map((panel) => {
              const selected = panel.id === activePanel
              const countIndex = panel.countPath ? countPaths.indexOf(panel.countPath) : -1
              const count = countIndex >= 0 ? counts[countIndex] : undefined
              return (
                <button
                  key={panel.id}
                  type="button"
                  role="tab"
                  id={`${bodyId}-tab-${panel.id}`}
                  aria-selected={selected}
                  aria-controls={`${bodyId}-panel-${panel.id}`}
                  tabIndex={selected ? 0 : -1}
                  className="od-biz-subtabs__tab"
                  onClick={() => setActivePanel(panel.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                    event.preventDefault()
                    const i = panels.findIndex((p) => p.id === panel.id)
                    const next =
                      panels[(i + (event.key === 'ArrowRight' ? 1 : -1) + panels.length) % panels.length]
                    if (!next) return
                    setActivePanel(next.id)
                    document.getElementById(`${bodyId}-tab-${next.id}`)?.focus()
                  }}
                >
                  {panel.label}
                  {count !== undefined && count > 0 && (
                    <span className="od-biz-subtabs__count">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </header>
    )
  }

  return (
    <section
      id={`od-section-${config.id}`}
      data-od-section={config.id}
      data-od-menu-label={config.hideFromMenu ? '' : (config.menuLabel ?? title)}
      className={`od-biz-section od-biz-section--${config.id}`}
      aria-labelledby={headingId}
    >
      {header}
      <div id={bodyId} className="od-biz-section__body" hidden={!bodyVisible}>
        <BusinessPanelContext.Provider
          value={panels.length ? { activeId: activePanel, idPrefix: bodyId } : null}
        >
          <RenderFields
            fields={childFields}
            margins="small"
            parentIndexPath={indexPath ?? ''}
            parentPath={parentPath ?? ''}
            parentSchemaPath={parentSchemaPath ?? ''}
            // Pass through as Payload's own unnamed group does: undefined hides
            // fields, so never widen it to `true`.
            permissions={permissions as NonNullable<typeof permissions>}
            readOnly={readOnly}
          />
        </BusinessPanelContext.Provider>
      </div>
    </section>
  )
}

export default BusinessSection
