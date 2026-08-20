'use client'

import type { TextFieldClientProps } from 'payload'

import { FieldDescription, FieldLabel, TextInput, useField } from '@payloadcms/ui'
import React, { useCallback } from 'react'

/**
 * Custom field for `googleAdsCustomerId`.
 *
 * Google Ads customer IDs are always 10 digits, conventionally shown grouped
 * as XXX-XXX-XXXX (e.g. 179-349-8760). This field always presents the value in
 * that dashed form regardless of how it was entered — whether the user types
 * the bare digits or pastes a value that already contains dashes/spaces.
 *
 * The stored value is digits-only (undashed). That is the canonical format
 * Growth Tools expects (see docs/growth-tools-google-ads-budget-extensions.md
 * — "customerId is provided without dashes"), so every downstream consumer
 * gets a clean, dash-free ID. Dashes are a display concern only.
 */

const MAX_DIGITS = 10

/** Strip everything but digits and cap at a 10-digit customer ID. */
function toDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, MAX_DIGITS)
}

/** Format raw digits as XXX-XXX-XXXX, filling only the groups present. */
function formatCustomerId(raw: string): string {
  const digits = toDigits(raw)
  const groups: string[] = []
  groups.push(digits.slice(0, 3))
  if (digits.length > 3) groups.push(digits.slice(3, 6))
  if (digits.length > 6) groups.push(digits.slice(6, 10))
  return groups.filter(Boolean).join('-')
}

export function GoogleAdsCustomerIdField(props: TextFieldClientProps): React.ReactElement {
  const { field, path: pathFromProps } = props
  const {
    customComponents: { Description, Error, Label } = {},
    path,
    setValue,
    showError,
    value,
  } = useField<string>({ potentiallyStalePath: pathFromProps })

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Store digits only; the input renders the formatted (dashed) view.
      setValue(toDigits(e.target.value))
    },
    [setValue],
  )

  // Payload only passes `customComponents.Label`/`.Description` through for
  // some field configs. Without these fallbacks the input renders bare — no
  // field name, and none of the "client must grant MCC access" guidance that
  // every neighbouring ID field on the Integrations tab shows.
  const label = Label ?? <FieldLabel label={field?.label ?? 'Google Ads Customer ID'} path={path} />
  const description =
    Description ??
    (field?.admin?.description ? (
      <FieldDescription description={field.admin.description as string} path={path} />
    ) : undefined)

  return (
    <TextInput
      Description={description}
      Error={Error}
      Label={label}
      onChange={handleChange}
      path={path}
      placeholder="179-349-8760"
      showError={showError}
      value={formatCustomerId(typeof value === 'string' ? value : '')}
    />
  )
}
