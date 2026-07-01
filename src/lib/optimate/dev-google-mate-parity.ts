export const GOOGLE_MATE_PARITY_QUERY = 'which search terms converted in the past two weeks?'

export interface GoogleMateDevToolTrace {
  name: string
  args: unknown
  ok?: boolean
  resultSummary: string
}

export interface GoogleMateDevModeContext {
  mode: 'audit' | 'portfolio'
  modelRequested?: string
  modelUsed?: string
  availableToolNames: string[]
  historyMessageCount: number
  replyPath?: 'typed-backend' | 'realtime-model'
}

export interface GoogleMateDevTextTrace {
  kind: 'text'
  query: string
  userMessage: string
  runId?: string
  finalAssistantReply: string
  emptyResponsePoint?: string | null
  toolsCalled: GoogleMateDevToolTrace[]
  context: GoogleMateDevModeContext
}

export interface GoogleMateDevVoiceTrace {
  kind: 'voice'
  query: string
  transcript: string
  userMessage: string
  model?: string
  modelUsed?: string
  modelRequested?: string
  replyPath?: 'typed-backend' | 'realtime-model'
  finalAssistantReply: string
  emptyResponsePoint?: string | null
  toolsCalled: GoogleMateDevToolTrace[]
  availableToolNames: string[]
}

function printable(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function summarizeForDevTrace(value: unknown, maxLength = 220): string {
  const text = printable(value).replace(/\s+/g, ' ').trim()
  if (!text) return '(empty)'
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}
