'use client'

import { useFormFields } from '@payloadcms/ui'

type GuideRow = { label: string; syntax: string }

const guide: GuideRow[] = [
  { label: 'Bold', syntax: '**text**' },
  { label: 'Italic', syntax: '*text*' },
  { label: 'Bold + Italic', syntax: '***text***' },
  { label: 'H1 (Title)', syntax: '# Heading' },
  { label: 'H2 (Section)', syntax: '## Heading' },
  { label: 'H3 (Subsection)', syntax: '### Heading' },
  { label: 'Link', syntax: '[text](https://url.com)' },
  { label: 'Internal Link', syntax: '[text](/page-path)' },
  { label: 'Image', syntax: '![descriptive alt text](image-url)' },
  { label: 'Bullet List', syntax: '- Item' },
  { label: 'Numbered List', syntax: '1. Item' },
  { label: 'Inline Code', syntax: '`code`' },
  { label: 'Code Block', syntax: '```\ncode\n```' },
  { label: 'Blockquote', syntax: '> Quote text' },
  { label: 'Line Break', syntax: 'Empty line between paragraphs' },
  { label: 'FAQ Section', syntax: '## FAQ\n**Q: Question?**\nA: Answer...' },
]

/** Only what the In The Picture website sync converts (src/lib/in-the-picture/article.ts). */
const inThePictureGuide: GuideRow[] = [
  { label: 'Bold', syntax: '**text**' },
  { label: 'Italic', syntax: '*text*' },
  { label: 'Bold + Italic', syntax: '***text***' },
  { label: 'H2 (Section)', syntax: '## Heading' },
  { label: 'H3 (Subsection)', syntax: '### Heading' },
  { label: 'Link', syntax: '[text](https://url.com)' },
  { label: 'Internal Link', syntax: '[text](/page-path)' },
  { label: 'Image', syntax: '![descriptive alt text](image-url)' },
  { label: 'Bullet List', syntax: '- Item' },
  { label: 'Numbered List', syntax: '1. Item' },
  { label: 'Blockquote', syntax: '> Quote text' },
  { label: 'Table', syntax: '| Head | Head |\n| --- | --- |\n| Cell | Cell |' },
  { label: 'Line Break', syntax: 'Empty line between paragraphs' },
  { label: 'FAQ Section', syntax: '## FAQ\n**Q: Question?**\nA: Answer...' },
]

function relationId(value: unknown): number | null {
  const raw = value && typeof value === 'object' && 'id' in value ? value.id : value
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

const MarkdownGuide = ({ inThePictureClientId }: { inThePictureClientId?: number | null }) => {
  const clientId = useFormFields(([fields]) => relationId(fields.client?.value))
  const inThePicture = Boolean(inThePictureClientId) && clientId === inThePictureClientId
  const rows = inThePicture ? inThePictureGuide : guide
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--theme-elevation-600, #666)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--theme-elevation-800, #333)',
          marginBottom: 8,
        }}
      >
        Markdown Formatting
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 11,
        }}
      >
        <tbody>
          {rows.map((item) => (
            <tr key={item.label}>
              <td
                style={{
                  padding: '3px 6px 3px 0',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: 'var(--theme-elevation-800, #333)',
                  verticalAlign: 'top',
                }}
              >
                {item.label}
              </td>
              <td
                style={{
                  padding: '3px 0',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: 'var(--theme-elevation-500, #888)',
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-line',
                }}
              >
                {item.syntax}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          marginTop: 10,
          padding: '6px 8px',
          background: 'var(--theme-elevation-50, #f9f9f9)',
          borderRadius: 4,
          fontSize: 10,
          color: 'var(--theme-elevation-500, #888)',
          lineHeight: 1.4,
        }}
      >
        {inThePicture ? (
          <>
            <strong>This client&apos;s website accepts only the formats above.</strong> Put the
            title in the Title field (a leading # heading is ignored). #### headings, code
            and _ &lt; &gt; [ ] in normal text are rejected.
          </>
        ) : (
          <>
            <strong>Tip:</strong> Use H2 for main sections and H3 for subsections. Keep body copy
            near 720 px wide; graphs can use the full content width.
          </>
        )}
      </div>
    </div>
  )
}

export default MarkdownGuide
