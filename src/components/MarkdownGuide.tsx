'use client'

const guide = [
  { label: 'Bold', syntax: '**text**' },
  { label: 'Italic', syntax: '*text*' },
  { label: 'Bold + Italic', syntax: '***text***' },
  { label: 'H1 (Title)', syntax: '# Heading' },
  { label: 'H2 (Section)', syntax: '## Heading' },
  { label: 'H3 (Subsection)', syntax: '### Heading' },
  { label: 'Link', syntax: '[text](https://url.com)' },
  { label: 'Internal Link', syntax: '[text](/page-path)' },
  { label: 'Bullet List', syntax: '- Item' },
  { label: 'Numbered List', syntax: '1. Item' },
  { label: 'Inline Code', syntax: '`code`' },
  { label: 'Code Block', syntax: '```\ncode\n```' },
  { label: 'Blockquote', syntax: '> Quote text' },
  { label: 'Line Break', syntax: 'Empty line between paragraphs' },
]

const MarkdownGuide = () => {
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
          {guide.map((item) => (
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
        <strong>Tip:</strong> Use H2 for main sections, H3 for subsections.
        Keep paragraphs short. Add links to relevant pages for SEO.
      </div>
    </div>
  )
}

export default MarkdownGuide
