'use client'

/**
 * Shown for the whole call when the Realtime secret was minted with
 * OPENAI_API_KEY instead of the ChatGPT plan (Codex OAuth), so per-minute
 * API billing is never silent.
 */
export function ApiCreditsNotice(): React.ReactElement {
  return (
    <span
      role="status"
      title="This voice call is billed to the OpenAI API key, not the ChatGPT plan. Switch voice billing to ChatGPT Plan in OptiMate Settings."
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: '#92400e',
        border: '1px solid #d97706',
        borderRadius: 999,
        padding: '1px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      Using API credits
    </span>
  )
}
