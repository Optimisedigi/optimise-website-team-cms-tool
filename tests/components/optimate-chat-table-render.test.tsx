import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderMarkdown } from '@/components/OptiMateChatCore'

/**
 * Wrap the rendered markdown in a deterministic container so the queries
 * below run against a known root. `renderMarkdown` returns a React fragment
 * array which `render()` accepts directly.
 */
function renderMd(md: string) {
  return render(<div>{renderMarkdown(md)}</div>)
}

describe('renderMarkdown — GFM tables', () => {
  it('renders a 3-column pipe table with header and rows', () => {
    const md = [
      '| Term | Clicks | Cost |',
      '| --- | ---: | ---: |',
      '| shoes | 120 | $45.00 |',
      '| boots | 80 | $30.00 |',
      '| sandals | 50 | $15.00 |',
    ].join('\n')

    const { container } = renderMd(md)

    const tables = container.querySelectorAll('table')
    expect(tables.length).toBe(1)

    const ths = container.querySelectorAll('th')
    expect(ths.length).toBe(3)
    expect(ths[0].textContent).toBe('Term')
    expect(ths[1].textContent).toBe('Clicks')
    expect(ths[2].textContent).toBe('Cost')

    const tds = container.querySelectorAll('td')
    // 3 columns × 3 body rows
    expect(tds.length).toBe(9)
  })

  it('right-aligns numeric and currency columns', () => {
    const md = [
      '| Term | Clicks | Cost |',
      '| --- | --- | --- |',
      '| shoes | 120 | $45.00 |',
    ].join('\n')

    const { container } = renderMd(md)
    const ths = Array.from(container.querySelectorAll('th'))
    const tds = Array.from(container.querySelectorAll('td'))

    // Term column = text → left-aligned
    expect(ths[0].getAttribute('style')).toContain('text-align: left')
    expect(tds[0].getAttribute('style')).toContain('text-align: left')

    // Clicks column = numeric → right-aligned
    expect(ths[1].getAttribute('style')).toContain('text-align: right')
    expect(tds[1].getAttribute('style')).toContain('text-align: right')

    // Cost column = currency → right-aligned
    expect(ths[2].getAttribute('style')).toContain('text-align: right')
    expect(tds[2].getAttribute('style')).toContain('text-align: right')
  })

  it('keeps inline formatting (bold) inside cells', () => {
    const md = [
      '| Campaign | Status |',
      '| --- | --- |',
      '| **Brand** | Active |',
    ].join('\n')

    const { container } = renderMd(md)
    const strong = container.querySelector('td strong')
    expect(strong).not.toBeNull()
    expect(strong?.textContent).toBe('Brand')
  })

  it('stops table parsing at a blank line and resumes paragraph rendering', () => {
    const md = [
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      'Some follow-up paragraph.',
    ].join('\n')

    const { container } = renderMd(md)
    expect(container.querySelectorAll('table').length).toBe(1)
    expect(container.textContent).toContain('Some follow-up paragraph.')
  })

  it('does not produce a table when there is no separator row', () => {
    const md = [
      'Pipe-only text | not a table',
      'Another | line',
    ].join('\n')

    const { container } = renderMd(md)
    expect(container.querySelectorAll('table').length).toBe(0)
  })
})
