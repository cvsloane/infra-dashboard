import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<Sidebar isOpen onClose={onClose} />)

    const backdrop = container.querySelector('[data-sidebar-backdrop="true"]')
    expect(backdrop).toBeInTheDocument()

    fireEvent.click(backdrop!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when escape is pressed while the mobile drawer is mounted', () => {
    const onClose = vi.fn()
    render(<Sidebar isOpen onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the mobile drawer mounted until the exit animation finishes', () => {
    const { rerender, queryByLabelText } = render(<Sidebar isOpen onClose={() => {}} />)

    expect(queryByLabelText('Close sidebar')).toBeInTheDocument()

    rerender(<Sidebar isOpen={false} onClose={() => {}} />)

    expect(queryByLabelText('Close sidebar')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument()
  })
})
