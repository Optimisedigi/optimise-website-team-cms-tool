'use client'

import type { TextFieldClientProps } from 'payload'

import { TextInput, useField } from '@payloadcms/ui'
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
  const { path: pathFromProps } = props
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

  return (
    <TextInput
      Description={Description}
      Error={Error}
      Label={Label}
      onChange={handleChange}
      path={path}
      placeholder="179-349-8760"
      showError={showError}
      value={formatCustomerId(typeof value === 'string' ? value : '')}
    />
  )
}
