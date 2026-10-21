import { describe, expect, it } from 'vitest'
import { applyFieldInputHints } from '@/lib/field-input-hints'

describe('applyFieldInputHints', () => {
  it('gives URL, email and number fields the matching phone keyboard', () => {
    document.body.innerHTML = `
      <input id="field-websiteUrl" type="text" />
      <input id="field-contactEmail" type="text" />
      <input id="field-clientPin" type="text" />
      <input id="field-googleAdsCustomerId" type="text" />
      <input id="field-name" type="text" />`
    expect(applyFieldInputHints(document)).toBe(4)
    expect(document.getElementById('field-websiteUrl')?.getAttribute('type')).toBe('url')
    expect(document.getElementById('field-websiteUrl')?.getAttribute('autocapitalize')).toBe('off')
    expect(document.getElementById('field-contactEmail')?.getAttribute('type')).toBe('email')
    expect(document.getElementById('field-clientPin')?.getAttribute('inputmode')).toBe('numeric')
    expect(document.getElementById('field-googleAdsCustomerId')?.getAttribute('inputmode')).toBe('numeric')
    expect(document.getElementById('field-name')?.hasAttribute('inputmode')).toBe(false)
    // Idempotent: nothing changes on a second pass.
    expect(applyFieldInputHints(document)).toBe(0)
  })
})
