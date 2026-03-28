'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { dashboardKeyboardShortcuts } from '@/components/dashboard/navigation'

const KEY_SEQUENCE_TIMEOUT_MS = 1200

interface UseKeyboardShortcutsOptions {
  enabled?: boolean
  onNavigate?: () => void
  onOpenHelp: () => void
}

function normalizeKey(event: KeyboardEvent): string | null {
  if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
    return '?'
  }

  if (event.key.length === 1) {
    return event.key.toLowerCase()
  }

  return null
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  if (target.isContentEditable) {
    return true
  }

  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

export function useKeyboardShortcuts({
  enabled = true,
  onNavigate,
  onOpenHelp,
}: UseKeyboardShortcutsOptions) {
  const router = useRouter()
  const pendingPrefixRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const clearPending = () => {
      pendingPrefixRef.current = null
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    if (!enabled) {
      clearPending()
      return
    }

    const startPendingTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
      timerRef.current = window.setTimeout(() => {
        clearPending()
      }, KEY_SEQUENCE_TIMEOUT_MS)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isEditableTarget(event.target)) {
        clearPending()
        return
      }

      const key = normalizeKey(event)
      if (!key) {
        clearPending()
        return
      }

      if (key === '?') {
        event.preventDefault()
        clearPending()
        onOpenHelp()
        return
      }

      if (pendingPrefixRef.current === 'g') {
        const destination = dashboardKeyboardShortcuts.find(
          (shortcut) => shortcut.keys.length === 2 && shortcut.keys[0] === 'g' && shortcut.keys[1] === key && shortcut.href
        )

        clearPending()

        if (!destination?.href) {
          return
        }

        event.preventDefault()
        onNavigate?.()
        router.push(destination.href)
        return
      }

      if (key === 'g') {
        event.preventDefault()
        pendingPrefixRef.current = 'g'
        startPendingTimer()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearPending()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, onNavigate, onOpenHelp, router])
}
