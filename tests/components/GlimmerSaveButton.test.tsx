import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GlimmerSaveButton } from '@/components/GlimmerSaveButton'

let processing = false
const submit = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  FormSubmit: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { buttonId?: string }) => {
    const { buttonId, ...buttonProps } = props
    return (
      <button id={buttonId} {...buttonProps}>
        {children}
      </button>
    )
  },
  useDocumentInfo: () => ({ uploadStatus: undefined }),
  useEditDepth: () => 1,
  useForm: () => ({ submit }),
  useFormModified: () => true,
  useFormProcessing: () => processing,
  useFormSubmitted: () => false,
  useHotkey: vi.fn(),
  useOperation: () => 'update',
  useTranslation: () => ({ t: () => 'Save' }),
}))

describe('GlimmerSaveButton', () => {
  beforeEach(() => {
    processing = false
    submit.mockReset()
  })

  it('renders the animated ellipsis only while the form is processing', () => {
    const { rerender } = render(<GlimmerSaveButton />)
    const button = screen.getByRole('button', { name: 'Save' })

    expect(button.querySelector('svg')).not.toBeInTheDocument()

    processing = true
    rerender(<GlimmerSaveButton />)

    const savingButton = screen.getByRole('button', { name: 'Saving' })
    const ellipsis = savingButton.querySelector('svg')
    expect(ellipsis).toHaveAttribute('aria-hidden', 'true')
    expect(ellipsis?.querySelectorAll('animate[repeatCount="indefinite"]')).toHaveLength(3)

    processing = false
    rerender(<GlimmerSaveButton />)

    expect(
      screen.getByRole('button', { name: 'Save' }).querySelector('svg'),
    ).not.toBeInTheDocument()
  })
})
