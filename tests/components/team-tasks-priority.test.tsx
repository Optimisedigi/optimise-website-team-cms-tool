import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

const task = (id: number, title: string, priority: string) => ({
  id, title, priority, taskType: 'blog_post', status: 'in_progress', dueDate: '2026-08-26',
})

const gridBody = {
  tasks: [task(1, 'plain', 'normal'), task(2, 'starred', 'high'), task(3, 'top', 'urgent')],
  clients: [], users: [], canManage: true, canEditTaskFields: true,
}

describe('Team Tasks priority stars', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => Promise.resolve({
      ok: true,
      json: async () => init?.method === 'PATCH'
        ? { task: { ...gridBody.tasks[0], ...JSON.parse(String(init.body)) } }
        : gridBody,
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('orders urgent then high then normal within the week', async () => {
    render(<TeamTasksSpreadsheet />)
    const titles = await screen.findAllByRole('textbox')
    expect(titles.map((el) => (el as HTMLTextAreaElement).value)).toEqual(['top', 'starred', 'plain'])
  })

  it('cycles priority none -> high -> urgent -> none on click', async () => {
    render(<TeamTasksSpreadsheet />)
    const star = await screen.findByRole('button', { name: 'Change priority for plain' })
    expect(star.getAttribute('title')).toBe('Set priority')
    fireEvent.click(star)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid', expect.objectContaining({ method: 'PATCH' })))
    const patched = (body: string) => JSON.parse(body)
    const bodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => patched(init.body))
    expect(bodies[0]).toMatchObject({ id: 1, priority: 'high' })

    await waitFor(() => expect(star.getAttribute('title')).toBe('Priority — click for top priority'))
    fireEvent.click(star)
    await waitFor(() => expect(star.getAttribute('title')).toBe('Top priority — click to clear'))
    fireEvent.click(star)
    await waitFor(() => {
      const all = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => patched(init.body))
      expect(all.map((b) => b.priority)).toEqual(['high', 'urgent', 'normal'])
    })
  })

  it('outlines prioritised rows on their cells, thickest and red for urgent', async () => {
    render(<TeamTasksSpreadsheet />)
    const titles = await screen.findAllByRole('textbox')
    const [urgent, high, plain] = titles.map((el) => el.closest('tr') as HTMLTableRowElement)
    // The week cell uses rowspan and must stay unstyled, so only measure this row's own cells.
    const dataCells = (row: HTMLTableRowElement) =>
      Array.from(row.querySelectorAll('td')).filter((td) => !td.hasAttribute('rowspan'))

    // jsdom serialises border shorthand colours as rgb(), not the hex we authored.
    for (const [row, width, color] of [[urgent, '3px', 'rgb(220, 38, 38)'], [high, '2px', 'rgb(245, 158, 11)']] as const) {
      const cells = dataCells(row)
      expect(cells.length).toBeGreaterThan(1)
      const expected = `${width} solid ${color}`
      // Top and bottom on every cell, so the outline is unbroken across the row.
      for (const cell of cells) {
        expect(cell.style.borderTop).toBe(expected)
        expect(cell.style.borderBottom).toBe(expected)
      }
      expect(cells[0].style.borderLeft).toBe(expected)
      expect(cells[cells.length - 1].style.borderRight).toBe(expected)
      // Edges stay open in the middle so the row reads as one box.
      expect(cells[0].style.borderRight).toBe('')
      expect(cells[cells.length - 1].style.borderLeft).toBe('')
    }

    for (const cell of dataCells(plain)) {
      expect(cell.style.borderTop).toBe('')
      expect(cell.style.borderLeft).toBe('')
      expect(cell.style.borderRight).toBe('')
    }
  })

  it('leaves the rowspan week cell outside the priority outline', async () => {
    render(<TeamTasksSpreadsheet />)
    await screen.findAllByRole('textbox')
    const weekCell = document.querySelector('td[rowspan]') as HTMLTableCellElement
    expect(weekCell).toBeTruthy()
    expect(weekCell.style.borderTop).toBe('')
    expect(weekCell.style.borderLeft).toBe('')
  })

  it('renames the add-task action and keeps add week available', async () => {
    render(<TeamTasksSpreadsheet />)
    expect(await screen.findByRole('button', { name: 'Add task this week' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Add week' })).toBeTruthy()
  })
})
