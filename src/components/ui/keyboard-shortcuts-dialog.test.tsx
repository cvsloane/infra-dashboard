import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { dashboardKeyboardShortcuts } from '@/components/dashboard/navigation'
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog'

describe('KeyboardShortcutsDialog', () => {
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('renders the configured shortcuts when open', () => {
    render(
      <KeyboardShortcutsDialog
        open
        onOpenChange={() => {}}
        shortcuts={dashboardKeyboardShortcuts}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Go to overview')).toBeInTheDocument()
    expect(screen.getByText('Go to deployments')).toBeInTheDocument()
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument()
  })

  it('closes when the backdrop is clicked', () => {
    const onOpenChange = vi.fn()

    const { container } = render(
      <KeyboardShortcutsDialog
        open
        onOpenChange={onOpenChange}
        shortcuts={dashboardKeyboardShortcuts}
      />
    )

    const backdrop = container.querySelector('[data-shortcuts-backdrop="true"]')
    expect(backdrop).toBeInTheDocument()

    fireEvent.click(backdrop!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes when escape is pressed', () => {
    const onOpenChange = vi.fn()

    render(
      <KeyboardShortcutsDialog
        open
        onOpenChange={onOpenChange}
        shortcuts={dashboardKeyboardShortcuts}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
