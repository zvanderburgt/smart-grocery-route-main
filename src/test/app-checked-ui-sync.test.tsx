import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/hooks/use-google-sheets-sync', () => ({
  useGoogleSheetsSync: () => ({
    config: null,
    setConfig: vi.fn(),
    syncState: { status: 'disconnected', pendingWrites: 0 },
    isConnected: false,
    isSignedIn: false,
    userEmail: 'me@example.com',
    connect: vi.fn(),
    disconnect: vi.fn(),
    syncNow: vi.fn(),
    createDeletionTombstone: vi.fn(),
    deleteItemsPermanently: vi.fn(),
    lastSyncTime: null,
    error: null,
  }),
}))

vi.mock('@/hooks/use-pwa-state', () => ({
  usePWAState: () => ({
    isOnline: true,
    serviceWorkerReady: true,
    pwaStatusLabel: 'Ready offline',
  }),
}))

vi.mock('@/hooks/use-pwa-install', () => ({
  usePWAInstall: () => ({
    canInstall: false,
    isStandalone: false,
    isIOS: false,
    isDismissed: false,
    triggerInstall: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-voice-input', () => ({
  useVoiceInput: () => ({
    isListening: false,
    isSupported: false,
    transcript: '',
    startListening: vi.fn(),
    stopListening: vi.fn(),
    toggleListening: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-voice-commands', () => ({
  useVoiceCommands: () => ({
    processTranscript: vi.fn(),
  }),
}))

import App from '@/App'

describe('App checked-state rendering', () => {
  it('shows a toggled item as checked in the list, not just in the progress bar', async () => {
    const user = userEvent.setup()

    ;(globalThis as any).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    window.localStorage.setItem('grocery-items', JSON.stringify([
      {
        id: 'item-1',
        name: 'Apples',
        checked: false,
        addedAt: 1,
        updatedAt: 1,
        updatedBy: 'me@example.com',
        category: 'produce',
        quantity: 1,
      },
      {
        id: 'item-2',
        name: 'Bananas',
        checked: false,
        addedAt: 2,
        updatedAt: 2,
        updatedBy: 'me@example.com',
        category: 'produce',
        quantity: 1,
      },
    ]))
    window.localStorage.setItem('item-relationships', JSON.stringify([]))
    window.localStorage.setItem('shopping-trips', JSON.stringify([]))
    window.localStorage.setItem('section-custom-names', JSON.stringify({}))
    window.localStorage.setItem('section-order', JSON.stringify([]))
    window.localStorage.setItem('collapsed-sections', JSON.stringify({}))
    window.localStorage.setItem('recipe-favorites', JSON.stringify([]))
    window.localStorage.setItem('learned-brands', JSON.stringify([]))
    window.localStorage.setItem('item-category-hints', JSON.stringify({}))
    window.localStorage.setItem('show-learning-tip', JSON.stringify(false))
    window.localStorage.setItem('show-suggestions', JSON.stringify(false))
    window.localStorage.setItem('show-confidence-indicators', JSON.stringify(true))

    render(<App />)

    const checkbox = await screen.findByRole('checkbox', { name: 'Apples' })
    await user.click(checkbox)

    await waitFor(() => {
      expect(screen.getByText('50% complete')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('Apples')).toHaveClass('line-through')
    })
  })
})
