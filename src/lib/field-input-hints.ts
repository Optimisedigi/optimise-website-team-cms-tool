/**
 * Keyboard hints for Payload text fields that hold URLs, emails or numbers.
 * Payload's text field has no inputmode/type option, so these are set on the
 * rendered inputs (the admin form is noValidate, so `type` only changes the
 * phone keyboard, never validation).
 */

export const FIELD_INPUT_HINTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'field-websiteUrl': { type: 'url', inputmode: 'url', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' },
  'field-contactEmail': { type: 'email', inputmode: 'email', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' },
  'field-clientPin': { inputmode: 'numeric', autocomplete: 'off' },
  'field-googleAdsCustomerId': { inputmode: 'numeric', autocomplete: 'off' },
  'field-ga4PropertyId': { inputmode: 'numeric', autocomplete: 'off' },
}

/** Applies FIELD_INPUT_HINTS to matching inputs under `root`; returns how many inputs changed. */
export function applyFieldInputHints(root: ParentNode): number {
  let changed = 0
  for (const [id, attrs] of Object.entries(FIELD_INPUT_HINTS)) {
    const input = root.querySelector<HTMLInputElement>(`input#${id}`)
    if (!input || input.type === 'hidden' || input.type === 'checkbox') continue
    let touched = false
    for (const [name, value] of Object.entries(attrs)) {
      if (input.getAttribute(name) !== value) {
        input.setAttribute(name, value)
        touched = true
      }
    }
    if (touched) changed++
  }
  return changed
}
