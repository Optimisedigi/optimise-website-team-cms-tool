import React, { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const chatCoreProps = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('../../src/components/OptiMateChatCore', async () => {
  const ReactModule = await import('react')
  const Stub = ReactModule.forwardRef<unknown, Record<string, unknown>>(function Stub(props, ref) {
    chatCoreProps.push(props)
    ReactModule.useImperativeHandle(ref, () => ({
      getSessionId: () => (props.initialSessionId as string | undefined) ?? `fresh-${String(props.auditId)}`,
    }))
    return <div data-testid={`chat-${String(props.auditId)}`} />
  })
  return { default: Stub }
})
vi.mock('../../src/components/OptiMateToolsHelp', () => ({ default: () => null }))

import OptiMateMultiChat, { type OptiMateMultiChatHandle } from '../../src/components/OptiMateMultiChat'

const targets = [
  { mode: 'audit' as const, id: 4, customerId: '111-111-1111', businessName: 'Berendsen' },
  { mode: 'audit' as const, id: 7, customerId: '222-222-2222', businessName: 'EPG engines', initialSessionId: 'sess-epg' },
]

afterEach(() => {
  cleanup()
  chatCoreProps.length = 0
})

describe('OptiMateMultiChat popout resume', () => {
  it('resumes the "Selected accounts" thread and opens on the requested tab', () => {
    const ref = createRef<OptiMateMultiChatHandle>()
    render(
      <OptiMateMultiChat
        ref={ref}
        targets={targets}
        selectedAccountsSessionId="sess-selected"
        initialActiveId="7"
      />,
    )

    const selected = chatCoreProps.find((p) => p.auditId === 'selected-accounts')
    expect(selected?.initialSessionId).toBe('sess-selected')
    expect(chatCoreProps.find((p) => p.auditId === 7)?.initialSessionId).toBe('sess-epg')
    expect(ref.current?.getActiveId()).toBe('7')
    expect(ref.current?.getSessionIds()).toMatchObject({
      'selected-accounts': 'sess-selected',
      '7': 'sess-epg',
    })
    expect(screen.getByTestId('chat-selected-accounts')).toBeTruthy()
  })

  it('defaults to the "Selected accounts" tab when the requested tab does not exist', () => {
    const ref = createRef<OptiMateMultiChatHandle>()
    render(<OptiMateMultiChat ref={ref} targets={targets} initialActiveId="999" />)
    expect(ref.current?.getActiveId()).toBe('selected-accounts')
  })
})
