import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BackupRestore } from '@/components/BackupRestore'

const storage = window.localStorage

function backupText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'breadcrumb-backup',
    version: 1,
    createdAt: Date.now(),
    app: 'Breadcrumb',
    data: {
      'grocery-items': [{ id: 'a', name: 'Milk', checked: false, addedAt: 1 }],
      'learned-brands': [{ brand: 'Oatly', category: 'dairy', confidence: 1, occurrences: 1, lastSeen: 1, createdAt: 1 }],
      ...overrides,
    },
  })
}

async function openDialog() {
  const user = userEvent.setup()
  render(<BackupRestore />)
  await user.click(screen.getByRole('button', { name: /restore from backup/i }))
  return user
}

describe('BackupRestore dialog', () => {
  it('keeps a large paste out of the DOM and out of state', async () => {
    await openDialog()
    const area = screen.getByPlaceholderText(/paste the backup json/i) as HTMLTextAreaElement
    // A recovery paste is megabytes of raw localStorage; the old controlled
    // textarea handed that string back to React on every render and locked the
    // tab. The paste must be intercepted, leaving the field empty.
    const huge = backupText({ 'opencode-cached-catalog': 'x'.repeat(2_000_000) })

    fireEvent.paste(area, { clipboardData: { getData: () => huge } })

    await waitFor(() => expect(screen.getByText('Backup ready')).toBeInTheDocument())
    expect(area.value).toBe('')
    expect(screen.getByText(/1 item · 1 trained brand/)).toBeInTheDocument()
  })

  it('merges a pasted backup into storage on restore', async () => {
    storage.clear()
    await openDialog()
    const area = screen.getByPlaceholderText(/paste the backup json/i)

    fireEvent.paste(area, { clipboardData: { getData: () => backupText() } })
    await waitFor(() => expect(screen.getByText('Backup ready')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^restore$/i }))

    expect(JSON.parse(storage.getItem('grocery-items') ?? '[]')).toHaveLength(1)
    expect(JSON.parse(storage.getItem('learned-brands') ?? '[]')).toHaveLength(1)
  }, 15_000)

  it('reports an unreadable paste instead of restoring it', async () => {
    await openDialog()
    const area = screen.getByPlaceholderText(/paste the backup json/i)

    fireEvent.paste(area, { clipboardData: { getData: () => 'definitely not a backup' } })

    await waitFor(() =>
      expect(screen.getByText(/does not look like a breadcrumb backup/i)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /^restore$/i })).toBeDisabled()
  })
})
