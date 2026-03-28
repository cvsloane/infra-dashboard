import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import { useKeyboardShortcuts } from './useKeyboardShortcuts'

function ShortcutHarness() {
  const [helpOpen, setHelpOpen] = useState(false)

  useKeyboardShortcuts({
    onOpenHelp: () => setHelpOpen(true),
  })

  return (
    <div>
      <div data-testid="help-state">{helpOpen ? 'open' : 'closed'}</div>
      <input aria-label="Notes" />
    </div>
  )
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('navigates to deployments on g then c', () => {
    render(<ShortcutHarness />)

    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.keyDown(window, { key: 'c' })

    expect(pushMock).toHaveBeenCalledWith('/coolify')
  })

  it('opens the help dialog on question mark', () => {
    render(<ShortcutHarness />)

    fireEvent.keyDown(window, { key: '?', shiftKey: true })

    expect(screen.getByTestId('help-state')).toHaveTextContent('open')
  })

  it('does not fire shortcuts while typing in an input', () => {
    render(<ShortcutHarness />)

    const input = screen.getByLabelText('Notes')
    input.focus()

    fireEvent.keyDown(input, { key: 'g' })
    fireEvent.keyDown(input, { key: 'c' })

    expect(pushMock).not.toHaveBeenCalled()
  })

  it('clears pending navigation chords after the timeout', () => {
    render(<ShortcutHarness />)

    fireEvent.keyDown(window, { key: 'g' })

    act(() => {
      vi.advanceTimersByTime(1200)
    })

    fireEvent.keyDown(window, { key: 'c' })

    expect(pushMock).not.toHaveBeenCalled()
  })
})
