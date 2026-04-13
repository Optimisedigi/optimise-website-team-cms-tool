'use client'

import { useEffect } from 'react'

/**
 * Injects shift-click range selection into Payload's built-in collection
 * list view checkboxes. Attaches a single delegated listener on the document
 * that watches for shift+click on .select-row__checkbox input elements.
 *
 * Payload manages checkbox state via React context (Selection provider).
 * We use native .click() to trigger each checkbox, guarded by a
 * processingShiftSelect flag to prevent re-entry into our capture handler.
 */
export default function PayloadShiftSelect({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let lastCheckedIndex: number | null = null
    let processingShiftSelect = false

    function getAllRowCheckboxes(fromElement: HTMLElement): HTMLInputElement[] {
      const table = fromElement.closest('table') || document
      return Array.from(
        table.querySelectorAll<HTMLInputElement>('.select-row__checkbox input[type="checkbox"]')
      )
    }

    function triggerCheckboxToggle(input: HTMLInputElement) {
      // Use the native .click() method which:
      // 1. Toggles the checkbox's checked state
      // 2. Fires a trusted 'click' event
      // 3. Fires a 'change' event (which React intercepts for onChange)
      // The processingShiftSelect flag prevents re-entry into our handler.
      input.click()
    }

    function handleClick(e: MouseEvent) {
      // Guard against re-entry from our own programmatic clicks
      if (processingShiftSelect) return

      const target = e.target as HTMLElement

      // Match only Payload's row checkboxes (not the "select all" header checkbox)
      const checkbox = target.closest('.select-row__checkbox')?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      if (!checkbox) {
        // Also try if the target IS the input inside .select-row__checkbox
        const directCheckbox = target.matches('input[type="checkbox"]') ? target as HTMLInputElement : null
        if (!directCheckbox || !directCheckbox.closest('.select-row__checkbox')) {
          return
        }
        // Fall through with directCheckbox handled below
      }
      const resolvedCheckbox = checkbox || (target as HTMLInputElement)

      const allCheckboxes = getAllRowCheckboxes(resolvedCheckbox)
      const currentIndex = allCheckboxes.indexOf(resolvedCheckbox)

      if (e.shiftKey && lastCheckedIndex !== null && currentIndex !== -1 && currentIndex !== lastCheckedIndex) {
        e.preventDefault()
        e.stopPropagation()

        const start = Math.min(lastCheckedIndex, currentIndex)
        const end = Math.max(lastCheckedIndex, currentIndex)

        // Determine desired state: match what the last-clicked checkbox's state is.
        // The last-clicked checkbox was already toggled, so its current .checked
        // reflects the "selected" state we want for the range.
        const lastCheckbox = allCheckboxes[lastCheckedIndex]
        const desiredChecked = lastCheckbox ? lastCheckbox.checked : true

        processingShiftSelect = true
        try {
          for (let i = start; i <= end; i++) {
            const cb = allCheckboxes[i]
            if (!cb) continue
            // Only toggle checkboxes that don't match the desired state
            if (cb.checked !== desiredChecked) {
              triggerCheckboxToggle(cb)
            }
          }
        } finally {
          processingShiftSelect = false
        }

        // Update lastCheckedIndex to the current position
        lastCheckedIndex = currentIndex
      } else {
        lastCheckedIndex = currentIndex
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  return <>{children}</>
}
