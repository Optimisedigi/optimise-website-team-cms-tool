import { useRef, useCallback } from 'react'

/**
 * Hook that adds shift-click range selection to checkbox lists.
 *
 * Usage:
 *   const { onCheckboxChange } = useShiftSelect(orderedIds, selectedSet, setSelectedSet)
 *   <input type="checkbox" checked={selected.has(id)} onChange={(e) => onCheckboxChange(id, e)} />
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

  const onCheckboxChange = useCallback(
    (id: T, event: React.ChangeEvent<HTMLInputElement>) => {
      const currentIndex = orderedIds.indexOf(id)
      const nativeEvent = event.nativeEvent as MouseEvent
      const isShift = nativeEvent.shiftKey

      if (isShift && lastClickedIndex.current !== null && currentIndex !== -1) {
        const start = Math.min(lastClickedIndex.current, currentIndex)
        const end = Math.max(lastClickedIndex.current, currentIndex)
        const rangeIds = orderedIds.slice(start, end + 1)

        // Use the checkbox's new checked state to determine add vs remove
        const adding = event.target.checked
        setSelected((prev) => {
          const next = new Set(prev)
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
    [orderedIds, setSelected],
  )

  return { onCheckboxChange }
}
