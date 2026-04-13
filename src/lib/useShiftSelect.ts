import { useRef, useCallback } from 'react'

/**
 * Hook that adds shift-click range selection to checkbox lists.
 *
 * Usage:
 *   const { handleSelect } = useShiftSelect(orderedIds, selectedSet, setSelectedSet)
 *   <input type="checkbox" onChange={() => handleSelect(id, event)} />
 *
 * When shift is held, selects/deselects all items between the last clicked
 * item and the current one (inclusive).
 */
export function useShiftSelect<T extends string | number>(
  /** The current ordered list of visible item IDs (after filtering/sorting) */
  orderedIds: T[],
  /** Current selection state */
  selected: Set<T>,
  /** State setter */
  setSelected: React.Dispatch<React.SetStateAction<Set<T>>>,
) {
  const lastClickedIndex = useRef<number | null>(null)

  const handleSelect = useCallback(
    (id: T, event?: React.MouseEvent | React.ChangeEvent) => {
      const currentIndex = orderedIds.indexOf(id)

      // Shift-click: select range between last clicked and current
      const isShift = event && 'shiftKey' in event && (event as React.MouseEvent).shiftKey
      if (isShift && lastClickedIndex.current !== null && currentIndex !== -1) {
        const start = Math.min(lastClickedIndex.current, currentIndex)
        const end = Math.max(lastClickedIndex.current, currentIndex)
        const rangeIds = orderedIds.slice(start, end + 1)

        setSelected((prev) => {
          const next = new Set(prev)
          // If the clicked item is being selected, select the range; if deselected, deselect the range
          const adding = !prev.has(id)
          for (const rangeId of rangeIds) {
            if (adding) next.add(rangeId)
            else next.delete(rangeId)
          }
          return next
        })
      } else {
        // Normal click: toggle single item
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      if (currentIndex !== -1) {
        lastClickedIndex.current = currentIndex
      }
    },
    [orderedIds, selected, setSelected],
  )

  return { handleSelect }
}
