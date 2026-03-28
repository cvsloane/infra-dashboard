'use client'

import { useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'
import type { KeyboardShortcutDefinition } from '@/components/dashboard/navigation'
import { Button } from '@/components/ui/button'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: KeyboardShortcutDefinition[]
}

function formatShortcutKey(key: string) {
  if (key === '?') {
    return '?'
  }

  return key.toUpperCase()
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: KeyboardShortcutsDialogProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onOpenChange, open])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        data-shortcuts-backdrop="true"
        aria-label="Close keyboard shortcuts"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="relative z-10 w-full max-w-2xl rounded-2xl border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Keyboard className="h-4 w-4" />
              Keyboard shortcuts
            </div>
            <div>
              <h2 id="keyboard-shortcuts-title" className="text-xl font-semibold">
                Navigate without leaving the keyboard
              </h2>
              <p className="text-sm text-muted-foreground">
                Shortcuts only run when focus is outside text inputs and editors.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 p-6">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4"
            >
              <div className="min-w-0">
                <div className="font-medium">{shortcut.description}</div>
                {shortcut.href && (
                  <div className="text-xs text-muted-foreground">{shortcut.href}</div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={`${shortcut.id}-${key}`}
                    className="min-w-8 rounded-md border bg-background px-2 py-1 text-center text-xs font-semibold text-foreground shadow-sm"
                  >
                    {formatShortcutKey(key)}
                  </kbd>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/10 p-4">
            <div className="font-medium">Close the shortcuts dialog</div>
            <kbd className="min-w-8 rounded-md border bg-background px-2 py-1 text-center text-xs font-semibold text-foreground shadow-sm">
              Esc
            </kbd>
          </div>
        </div>
      </div>
    </div>
  )
}
