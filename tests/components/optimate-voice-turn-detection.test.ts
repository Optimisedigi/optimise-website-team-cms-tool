import { describe, expect, it } from 'vitest'
import { voiceTurnDetection } from '@/components/OptiMateVoice'

describe('voiceTurnDetection', () => {
  it('lets the user interrupt (barge in on) the mail GPT Live voice', () => {
    expect(voiceTurnDetection('mail')).toMatchObject({ type: 'server_vad', create_response: true, interrupt_response: true })
  })

  it('keeps barge-in off for the other voice agents', () => {
    for (const mode of ['email', 'invoice', 'adminmate', 'audit', 'portfolio'] as const) {
      expect(voiceTurnDetection(mode).interrupt_response).toBe(false)
    }
  })
})
