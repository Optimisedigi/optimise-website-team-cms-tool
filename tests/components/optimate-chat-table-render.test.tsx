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

describe('renderMarkdown — invoice lists', () => {
  it('renders hyphen bullets as a disc list with visible markers', () => {
    const md = [
      'Recent unpaid:',
      '- **INV-000177** We Can Quit, $76, due 1st Jun',
      '- **INV-000178** We Can Quit, $76, due 3rd Jul',
    ].join('\n')

    const { container } = renderMd(md)
    const items = container.querySelectorAll('ul li')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain('INV-000177')
    expect(container.querySelector('ul')?.getAttribute('style')).toContain('list-style-type: disc')
    expect(items[0].getAttribute('style')).toContain('display: list-item')
  })

  it('treats indented invoice lines without a hyphen as bullets', () => {
    const md = [
      'Recent unpaid:',
      '  **INV-000177** We Can Quit, $76, due 1st Jun',
      '  **INV-000178** We Can Quit, $76, due 3rd Jul',
    ].join('\n')

    const { container } = renderMd(md)
    const items = container.querySelectorAll('ul li')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain('INV-000177')
    expect(items[1].textContent).toContain('INV-000178')
  })
})

describe('renderMarkdown — links', () => {
  it('renders a markdown Gmail draft link as an "Open in Mail" button to CMS Mail, not raw markdown', () => {
    const { container } = renderMd(
      'The reply is saved as a threaded draft. [Open in Gmail](https://mail.google.com/mail/u/0/#drafts/1a130472e610f1a8)',
    )
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(1)
    expect(links[0]?.getAttribute('href')).toBe('/admin/mail?draft=1a130472e610f1a8')
    expect(links[0]?.textContent).toBe('Open in Mail ↗')
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.textContent).not.toContain('[Open in Gmail]')
    expect(container.textContent).not.toContain('mail.google.com')
  })

  it('also turns a bare Gmail draft URL into the CMS Mail button', () => {
    const { container } = renderMd('Draft: https://mail.google.com/mail/u/0/#drafts/abc123.')
    const link = container.querySelector('a')
    expect(link?.textContent).toBe('Open in Mail ↗')
    expect(link?.getAttribute('href')).toBe('/admin/mail?draft=abc123')
    expect(container.textContent).toBe('Draft: Open in Mail ↗.')
  })

  it('keeps non-draft Gmail links pointing at Gmail', () => {
    const { container } = renderMd('Thread: https://mail.google.com/mail/u/0/#all/abc123')
    const link = container.querySelector('a')
    expect(link?.textContent).toBe('Open in Gmail ↗')
    expect(link?.getAttribute('href')).toBe('https://mail.google.com/mail/u/0/#all/abc123')
  })

  it('uses the label for other markdown links and leaves non-Gmail lookalike hosts as normal links', () => {
    const { container } = renderMd('[Budget tracker](https://cms.example.com/x) and https://mail.google.com.evil.test/y')
    const links = container.querySelectorAll('a')
    expect(links[0]?.textContent).toBe('Budget tracker')
    expect(links[0]?.getAttribute('href')).toBe('https://cms.example.com/x')
    expect(links[1]?.textContent).toBe('https://mail.google.com.evil.test/y')
  })
})
