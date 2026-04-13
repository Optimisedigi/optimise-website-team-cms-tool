'use client'

import { useEffect } from 'react'

/**
 * Injects shift-click range selection into Payload's built-in collection
 * list view checkboxes. Attaches a single delegated listener on the document
 * that watches for shift+click on .select-row__checkbox input elements.
 */
export default function PayloadShiftSelect({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let lastCheckedIndex: number | null = null

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      // Only handle Payload's row checkboxes (not the "select all" header checkbox)
      const checkbox = target.closest('.select-row__checkbox input[type="checkbox"]') as HTMLInputElement | null
      if (!checkbox) {
        return
      }

      // Get all row checkboxes in the current table
      const table = checkbox.closest('table') || document
      const allCheckboxes = Array.from(
        table.querySelectorAll<HTMLInputElement>('.select-row__checkbox input[type="checkbox"]')
      )
      const currentIndex = allCheckboxes.indexOf(checkbox)

      if (e.shiftKey && lastCheckedIndex !== null && currentIndex !== -1 && currentIndex !== lastCheckedIndex) {
        const start = Math.min(lastCheckedIndex, currentIndex)
        const end = Math.max(lastCheckedIndex, currentIndex)

        // Determine if we're checking or unchecking based on the clicked checkbox's NEW state
        // The click event fires before the change, so we read the current state and invert it
        const willBeChecked = !checkbox.checked

        for (let i = start; i <= end; i++) {
          const cb = allCheckboxes[i]
          if (cb && cb.checked !== willBeChecked) {
            cb.click()
          }
        }

        // Prevent the default click on the target since we already clicked it in the loop
        e.preventDefault()
      }

      lastCheckedIndex = currentIndex
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  return <>{children}</>
}
