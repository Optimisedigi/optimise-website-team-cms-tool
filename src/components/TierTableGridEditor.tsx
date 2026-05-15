'use client'

import { useField } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Spreadsheet-like grid editor for the annual-review tier table.
 *
 * Stores its value in the existing `annualReviewTierTableText` text field as
 * tab-separated rows (\n line separator, \t cell separator) so the existing
 * parseTierTable() utility and all renderers keep working with no migration.
 *
 * Features:
 *   - Click a cell to edit; arrow keys / Tab move between cells.
 *   - Add/remove rows (each row matches header column count automatically).
 *   - Add/remove columns (every row resizes).
 *   - Paste from Excel/Sheets into any cell: tab-separated text expands to
 *     fill cells in the rectangle starting at the paste target. Auto-adds
 *     rows/cols as needed.
 *   - Drag-and-drop row reordering via the grip handle at the start of each
 *     row.
 */

type Grid = string[][]

const TAB = '\t'
const NEWLINE = '\n'

function textToGrid(input: string | null | undefined): Grid {
  if (!input || typeof input !== 'string') return [['', '']]
  const lines = input.replace(/\r\n?/g, '\n').split('\n')
  // Strip purely-blank trailing lines but keep blank cells inside the grid.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return [['', '']]
  const rows = lines.map((line) => line.split(TAB))
  const maxCols = Math.max(...rows.map((r) => r.length), 2)
  return rows.map((r) => {
    const next = [...r]
    while (next.length < maxCols) next.push('')
    return next
  })
}

function gridToText(grid: Grid): string {
  return grid.map((row) => row.join(TAB)).join(NEWLINE)
}

function parsePastedText(text: string): Grid | null {
  const normalised = text.replace(/\r\n?/g, '\n')
  if (!normalised.trim()) return null
  const lines = normalised.split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return null
  const rows = lines.map((line) => line.split(TAB))
  // Only treat as a grid if at least one row has a tab; otherwise single cell.
  if (rows.every((r) => r.length === 1)) return null
  const maxCols = Math.max(...rows.map((r) => r.length))
  return rows.map((r) => {
    const next = [...r]
    while (next.length < maxCols) next.push('')
    return next
  })
}

const TierTableGridEditor = () => {
  const { value, setValue } = useField<string>({ path: 'annualReviewTierTableText' })

  // Single source of truth for the local edit state. Initialised from the
  // field value once and kept in sync via setValue() on every mutation.
  const [grid, setGrid] = useState<Grid>(() => textToGrid(value))
  const skipNextSync = useRef(false)

  // If the field value changes externally (e.g. autosave round-trip),
  // re-hydrate the grid \u2014 but skip the immediate post-setValue change.
  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    setGrid(textToGrid(value))
  }, [value])

  const commit = useCallback(
    (next: Grid) => {
      setGrid(next)
      skipNextSync.current = true
      setValue(gridToText(next))
    },
    [setValue],
  )

  const updateCell = useCallback(
    (r: number, c: number, val: string) => {
      const next = grid.map((row, ri) =>
        ri === r ? row.map((cell, ci) => (ci === c ? val : cell)) : row,
      )
      commit(next)
    },
    [grid, commit],
  )

  const addRow = useCallback(() => {
    const cols = grid[0]?.length ?? 2
    commit([...grid, Array(cols).fill('')])
  }, [grid, commit])

  const removeRow = useCallback(
    (r: number) => {
      // Never remove the header row (index 0) and never leave the table
      // empty of body rows. If only header + 1 body row remain, clear cells
      // instead of removing.
      if (r === 0) return
      if (grid.length <= 2) {
        commit(grid.map((row, ri) => (ri === r ? row.map(() => '') : row)))
        return
      }
      commit(grid.filter((_, ri) => ri !== r))
    },
    [grid, commit],
  )

  const addColumn = useCallback(() => {
    commit(grid.map((row) => [...row, '']))
  }, [grid, commit])

  const removeColumn = useCallback(
    (c: number) => {
      const cols = grid[0]?.length ?? 0
      if (cols <= 1) return
      commit(grid.map((row) => row.filter((_, ci) => ci !== c)))
    },
    [grid, commit],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
      const text = e.clipboardData.getData('text')
      const pasted = parsePastedText(text)
      if (!pasted) return // fall through to default single-cell paste
      e.preventDefault()

      // Compute target dimensions and expand the grid to fit.
      const targetRows = r + pasted.length
      const targetCols = c + Math.max(...pasted.map((row) => row.length))
      const next: Grid = grid.map((row) => [...row])
      while (next.length < targetRows) {
        next.push(Array(next[0]?.length ?? 0).fill(''))
      }
      const currentCols = next[0]?.length ?? 0
      if (targetCols > currentCols) {
        for (let i = 0; i < next.length; i += 1) {
          while (next[i].length < targetCols) next[i].push('')
        }
      }

      // Paint the pasted rectangle starting at (r, c).
      for (let pr = 0; pr < pasted.length; pr += 1) {
        for (let pc = 0; pc < pasted[pr].length; pc += 1) {
          next[r + pr][c + pc] = pasted[pr][pc]
        }
      }

      commit(next)
    },
    [grid, commit],
  )

  // ── Row drag-and-drop ──
  const [dragRow, setDragRow] = useState<number | null>(null)
  const onRowDragStart = (r: number) => () => setDragRow(r)
  const onRowDragOver = (e: React.DragEvent) => e.preventDefault()
  const onRowDrop = (r: number) => () => {
    if (dragRow == null || dragRow === r || dragRow === 0 || r === 0) {
      setDragRow(null)
      return
    }
    const next = [...grid]
    const [moved] = next.splice(dragRow, 1)
    next.splice(r, 0, moved)
    setDragRow(null)
    commit(next)
  }

  const colCount = grid[0]?.length ?? 0
  const bodyRowCount = Math.max(grid.length - 1, 0)

  const cellStyle = useMemo<React.CSSProperties>(
    () => ({
      width: '100%',
      padding: '6px 8px',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: 14,
      fontFamily: 'inherit',
      color: 'var(--theme-elevation-1000)',
    }),
    [],
  )

  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          border: '1px solid var(--theme-elevation-100)',
          borderRadius: 4,
          overflow: 'hidden',
          background: 'var(--theme-elevation-50)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          {/* Column-header strip with delete buttons */}
          <thead>
            <tr style={{ background: 'var(--theme-elevation-100)' }}>
              <th style={{ width: 32 }} aria-label="row controls" />
              {Array.from({ length: colCount }).map((_, ci) => (
                <th
                  key={ci}
                  style={{
                    padding: '4px 6px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--theme-elevation-600)',
                    textAlign: 'right',
                    borderRight:
                      ci < colCount - 1 ? '1px solid var(--theme-elevation-150)' : 'none',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => removeColumn(ci)}
                    disabled={colCount <= 1}
                    title="Remove this column"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--theme-elevation-600)',
                      cursor: colCount <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      padding: '0 4px',
                    }}
                  >
                    × col {ci + 1}
                  </button>
                </th>
              ))}
              <th style={{ width: 32 }} aria-label="row delete" />
            </tr>
          </thead>

          <tbody>
            {grid.map((row, r) => {
              const isHeader = r === 0
              return (
                <tr
                  key={r}
                  draggable={!isHeader}
                  onDragStart={onRowDragStart(r)}
                  onDragOver={onRowDragOver}
                  onDrop={onRowDrop(r)}
                  style={{
                    borderTop:
                      r === 0 ? 'none' : '1px solid var(--theme-elevation-100)',
                    background: isHeader
                      ? 'var(--theme-elevation-100)'
                      : 'var(--theme-elevation-0)',
                  }}
                >
                  <td
                    style={{
                      width: 32,
                      textAlign: 'center',
                      color: 'var(--theme-elevation-400)',
                      cursor: isHeader ? 'default' : 'grab',
                      userSelect: 'none',
                      fontSize: 14,
                    }}
                    title={isHeader ? 'Header row' : 'Drag to reorder'}
                  >
                    {isHeader ? '≡' : '⋮'}
                  </td>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      style={{
                        padding: 0,
                        borderRight:
                          c < row.length - 1
                            ? '1px solid var(--theme-elevation-100)'
                            : 'none',
                      }}
                    >
                      <input
                        type="text"
                        value={cell}
                        onChange={(e) => updateCell(r, c, e.target.value)}
                        onPaste={(e) => handlePaste(e, r, c)}
                        placeholder={isHeader ? `Header ${c + 1}` : ''}
                        style={{
                          ...cellStyle,
                          fontWeight: isHeader ? 600 : 400,
                        }}
                      />
                    </td>
                  ))}
                  <td style={{ width: 32, textAlign: 'center' }}>
                    {!isHeader && (
                      <button
                        type="button"
                        onClick={() => removeRow(r)}
                        title="Remove this row"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--theme-elevation-600)',
                          cursor: 'pointer',
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'var(--theme-elevation-50)',
            color: 'var(--theme-elevation-800)',
            cursor: 'pointer',
          }}
        >
          + Add row
        </button>
        <button
          type="button"
          onClick={addColumn}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'var(--theme-elevation-50)',
            color: 'var(--theme-elevation-800)',
            cursor: 'pointer',
          }}
        >
          + Add column
        </button>
      </div>

      <p
        style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--theme-elevation-500)',
          lineHeight: 1.4,
        }}
      >
        Edit cells inline. Paste from Excel/Google Sheets into any cell to
        auto-fill multiple rows and columns. The first row is the header (bold).
        Drag the dots at the start of a body row to reorder.{' '}
        <strong>
          {bodyRowCount} tier row{bodyRowCount === 1 ? '' : 's'} × {colCount} column
          {colCount === 1 ? '' : 's'}
        </strong>
        .
      </p>
    </div>
  )
}

export default TierTableGridEditor
