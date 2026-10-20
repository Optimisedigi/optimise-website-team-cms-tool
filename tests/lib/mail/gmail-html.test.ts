import { describe, expect, it } from 'vitest'
import { formatGmailDraftHtml } from '@/lib/gmail-service'
import { parseMailComposeContent } from '@/lib/mail/compose-content'
import { inlineEmailListStyles, inlineEmailTableStyles, splitDeclarations, stripEmailFonts } from '@/lib/mail/gmail-html'

// What the compose editor (Lexical) produces for a small table: look comes from CSS classes.
const EDITOR_TABLE =
  '<table class="editorTable"><colgroup><col><col></colgroup><tbody>' +
  '<tr><th class="editorTableHeader" scope="col" style="background-color:rgb(242,243,245);text-align:start"><p class="editorParagraph" dir="ltr"><span style="white-space:pre-wrap">Name</span></p></th>' +
  '<th class="editorTableHeader"><p class="editorParagraph"><span>Cost</span></p></th></tr>' +
  '<tr><td class="editorTableCell"><p class="editorParagraph"><span>Ads</span></p><p class="editorParagraph"><span>(search)</span></p></td>' +
  '<td class="editorTableCell"><p class="editorParagraph"><span>$100</span></p></td></tr></tbody></table>'

const compose = (html: string) => {
  const result = parseMailComposeContent({ html })
  if (!result.ok) throw new Error(result.error)
  return result.value.html
}

describe('inlineEmailTableStyles', () => {
  it('writes borders, padding and collapse inline on table, th and td', () => {
    const out = inlineEmailTableStyles('<table><tr><th>A</th><td>B</td></tr></table>')
    expect(out).toContain('<table style="border-collapse:collapse;font-family:Verdana,sans-serif;font-size:small" cellspacing="0">')
    expect(out).toMatch(/<td style="border:1px solid #9aa0a6;padding:4px 8px;vertical-align:top">/)
    expect(out).toMatch(/<th style="[^"]*border:1px solid #9aa0a6[^"]*background-color:#f1f3f4[^"]*font-weight:700/)
  })

  it('keeps the author’s own styles and does not override them', () => {
    const out = inlineEmailTableStyles('<table style="width:100%;border-collapse:separate"><tr><td style="border:2px dashed red;padding:0">x</td><td style="border-bottom:1px solid #000">y</td></tr></table>')
    expect(out).toContain('<table style="width:100%;border-collapse:separate;font-family:Verdana,sans-serif;font-size:small" cellspacing="0">')
    expect(out).toContain('<td style="border:2px dashed red;padding:0;vertical-align:top">')
    // A side-specific border means "styled": no shorthand is stacked on top of it.
    expect(out).toContain('<td style="border-bottom:1px solid #000;padding:4px 8px;vertical-align:top">')
  })

  it('is idempotent and leaves HTML without tables alone', () => {
    const once = inlineEmailTableStyles('<table><tr><td>x</td></tr></table>')
    expect(inlineEmailTableStyles(once)).toBe(once)
    expect(inlineEmailTableStyles('<p>No table</p>')).toBe('<p>No table</p>')
  })

  it('handles single-quoted style attributes and semicolons inside url()', () => {
    expect(inlineEmailTableStyles("<td style='color:red'>x</td>")).toContain("style='color:red;border:")
    expect(splitDeclarations("background:url(data:image/png;base64,AA);color:red;font-family:'A;B'")).toEqual([
      'background:url(data:image/png;base64,AA)',
      'color:red',
      "font-family:'A;B'",
    ])
  })
})

describe('compose HTML to Gmail', () => {
  it('turns the editor’s class-styled table into a self-contained, bordered table', () => {
    const html = formatGmailDraftHtml(compose(EDITOR_TABLE))
    expect(html).not.toMatch(/class=/)
    expect(html).not.toContain('<colgroup')
    expect(html).toContain('<table style="border-collapse:collapse;font-family:Verdana,sans-serif;font-size:small" cellspacing="0">')
    expect(html.match(/<td style="border:1px solid #9aa0a6;padding:4px 8px;vertical-align:top">/g)).toHaveLength(2)
    // The editor's own header shading is kept, not replaced.
    expect(html).toContain('background-color:rgb(242,243,245)')
    expect(html).toContain('border:1px solid #9aa0a6')
  })

  it('does not stretch table cells with paragraph blank lines', () => {
    const html = formatGmailDraftHtml(compose(EDITOR_TABLE))
    expect(html).toContain('<span>Ads</span><br><span>(search)</span></td>')
    expect(html).toContain('<span>$100</span></td>')
    expect(html).not.toMatch(/<br><br><\/t[dh]>/)
    expect(html).not.toContain('<p')
  })

  it('keeps table text sizes and fonts as authored while normalising the rest to Gmail’s font', () => {
    const html = formatGmailDraftHtml(
      '<p style="font-size:14px">Intro</p><table><tr><td style="font-size:12px;font-family:Arial,sans-serif"><span style="font-size:11px">Cell</span></td></tr></table><div style="font-size:16px;color:#222">After</div>',
    )
    expect(html).toContain('<td style="font-size:12px;font-family:Arial,sans-serif">')
    expect(html).toContain('<span style="font-size:11px">Cell</span>')
    expect(html).toContain('<div style="font-size:small;color:#222;">After</div>')
  })

  it('resumes font normalisation after a nested table closes', () => {
    const html = formatGmailDraftHtml(
      '<table><tr><td><table><tr><td style="font-size:9px">in</td></tr></table><span style="font-size:10px">still in outer cell</span></td></tr></table><span style="font-size:20px">out</span>',
    )
    expect(html).toContain('font-size:9px')
    expect(html).toContain('font-size:10px')
    expect(html).toContain('<span style="font-size:small;">out</span>')
  })

  it('replaces quoted font stacks cleanly instead of leaving fragments', () => {
    const html = formatGmailDraftHtml(`<span style="font-family:Arial,'Open Sans',sans-serif;color:red">x</span>`)
    expect(html).toContain('<span style="font-family:Verdana,sans-serif;color:red;">x</span>')
    expect(html).not.toContain('Open Sans')
  })

  it('still turns top-level paragraphs into Gmail blank lines', () => {
    expect(formatGmailDraftHtml('<p>Hi</p>' + compose(EDITOR_TABLE) + '<p>Thanks</p>')).toContain('</table>Thanks')
  })
})

describe('compose body font', () => {
  it('strips every font and size from the body but keeps colour and weight', () => {
    expect(
      stripEmailFonts(
        `<p style="font-family:Arial;font-size:20px;color:red">a</p><span style='font:12px Georgia;font-weight:700'>b</span><font face="Arial" size="5" color="blue">c</font><li style="--listitem-marker-color:red">d</li>`,
      ),
    ).toBe(`<p style="color:red">a</p><span style='font-weight:700'>b</span><font color="blue">c</font><li>d</li>`)
  })

  it('sends pasted tables and text in Verdana, Normal, even when they carried their own font', () => {
    const html = formatGmailDraftHtml(
      compose('<p style="font-size:24px">Big</p><table><tr><td style="font-family:Arial;font-size:9px"><span style="font-size:30px;color:#cc0000">Cell</span></td></tr></table>'),
    )
    expect(html).toContain('<div data-optimate-gmail-draft-font="true" style="font-family:Verdana,sans-serif;font-size:small;')
    expect(html).toContain('font-family:Verdana,sans-serif;font-size:small" cellspacing="0">')
    expect(html).not.toMatch(/font-size:(?!small)/)
    expect(html).not.toContain('Arial')
    expect(html).toContain('<span style="color:#cc0000">Cell</span>')
  })
})

describe('inlineEmailListStyles', () => {
  it('writes Gmail’s list indent inline, keeping the author’s own values', () => {
    expect(inlineEmailListStyles('<ul><li>a</li></ul><ol start="3"><li style="margin-left:0">b</li></ol>')).toBe(
      '<ul style="margin-top:0;margin-bottom:0;padding-left:40px"><li style="margin-left:15px">a</li></ul>' +
        '<ol start="3" style="margin-top:0;margin-bottom:0;padding-left:40px"><li style="margin-left:0">b</li></ol>',
    )
    expect(inlineEmailListStyles('<p>No list</p>')).toBe('<p>No list</p>')
  })

  it('is applied to bulleted and numbered lists from the editor', () => {
    const html = compose('<ul class="editorList"><li class="editorListItem" value="1"><span>One</span></li></ul><ol class="editorList"><li value="1">Two</li></ol>')
    expect(html).toBe(
      '<ul style="margin-top:0;margin-bottom:0;padding-left:40px"><li value="1" style="margin-left:15px"><span>One</span></li></ul>' +
        '<ol style="margin-top:0;margin-bottom:0;padding-left:40px"><li value="1" style="margin-left:15px">Two</li></ol>',
    )
  })
})
