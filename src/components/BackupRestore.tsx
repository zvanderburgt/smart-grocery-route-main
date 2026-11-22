/**
 * Backup & restore controls for the settings sheet.
 *
 * Export writes one JSON file with every list, learned brand, barcode, trip and
 * preference this install owns; restore merges it back. That is the only way to
 * carry data between origins, which is what a new deploy URL or a new phone is:
 * localStorage is per-origin, so the new address cannot see the old one's data
 * and no server round trip can bridge it.
 *
 * Two things here are deliberate and were each learned the hard way:
 *
 * - **It expands in place.** This used to open a Dialog on top of the settings
 *   Sheet. A modal inside a modal leaves a phone showing the settings panel with
 *   the page scroll locked and no dialog in view — the app looks frozen. The
 *   form now renders inline, where the sheet's own scrolling still works.
 * - **Pasted text never enters React state or the DOM.** A recovery paste can be
 *   megabytes of raw localStorage; a controlled textarea hands that string back
 *   on every render while the browser lays out one enormous line, which locks
 *   the tab. Paste is intercepted, and the UI shows a summary instead.
 */

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DownloadSimple, UploadSimple, CaretDown, CaretUp } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  applyBackup,
  collectBackup,
  countBackup,
  describeCounts,
  parseBackup,
  serializeBackup,
  type BackupCounts,
  type BackupFile,
} from '@/lib/backup'

const TOUCH_TARGET = 'pointer-coarse:min-h-11'

/**
 * Bumped whenever this flow changes. It is printed under the buttons so a stale
 * client (an installed PWA still serving an older precache) can be told apart
 * from a broken one in a single glance.
 */
const RESTORE_REVISION = 'v5'

/** Past this, parsing on the main thread is the wrong tool: use the file path. */
const MAX_PASTE_CHARS = 8_000_000

interface Captured {
  backup: BackupFile
  counts: BackupCounts
  bytes: number
}

function backupFileName(now: Date): string {
  return `breadcrumb-backup-${now.toISOString().slice(0, 10)}.json`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function BackupRestore() {
  const [isOpen, setIsOpen] = useState(false)
  const [captured, setCaptured] = useState<Captured | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reset = () => {
    setCaptured(null)
    setError(null)
    setIsParsing(false)
    setFileName(null)
    if (areaRef.current) areaRef.current.value = ''
  }

  const toggleOpen = () => {
    const next = !isOpen
    setIsOpen(next)
    if (!next) {
      reset()
      return
    }
    window.setTimeout(() => {
      // jsdom and older browsers may not implement this; scrolling is a nicety.
      try {
        panelRef.current?.scrollIntoView({ block: 'nearest' })
      } catch {
        // no-op
      }
    }, 50)
  }

  /**
   * Take the text, keep it out of state, and parse on the next tick so the tap
   * paints before the main thread goes to work.
   */
  const ingest = (text: string) => {
    setError(null)
    setCaptured(null)

    if (text.length > MAX_PASTE_CHARS) {
      setError(
        `That backup is ${formatSize(text.length)} — too large to parse here. Restore it from the file instead.`,
      )
      return
    }

    setIsParsing(true)
    window.setTimeout(() => {
      const parsed = parseBackup(text)
      if (!parsed.ok) {
        setError(parsed.error)
        setIsParsing(false)
        return
      }
      setCaptured({
        backup: parsed.backup,
        counts: countBackup(parsed.backup.data),
        bytes: text.length,
      })
      setIsParsing(false)
      // The textarea has done its job; empty it so no large string sits in the
      // layout and the summary takes its place.
      if (areaRef.current) areaRef.current.value = ''
    }, 30)
  }

  const handleExport = () => {
    try {
      const backup = collectBackup(window.localStorage)
      const summary = describeCounts(countBackup(backup.data))
      const blob = new Blob([serializeBackup(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = backupFileName(new Date(backup.createdAt))
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success(`Backup saved — ${summary}`)
    } catch (error) {
      toast.error('Could not write the backup file: ' + String(error))
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    try {
      ingest(await file.text())
    } catch (error) {
      toast.error('Could not read that file: ' + String(error))
    }
  }

  const handleRestore = () => {
    if (!captured) return
    setIsRestoring(true)
    try {
      const result = applyBackup(window.localStorage, captured.backup)
      if (result.written.length === 0) {
        toast(`Nothing new to restore — ${describeCounts(result.counts)} already here`)
        setIsRestoring(false)
        return
      }
      toast.success(`Restored — ${describeCounts(result.counts)}. Reloading…`)
      // The running app holds its state in React; re-read everything from the
      // freshly merged storage instead of trying to poke twenty hooks.
      window.setTimeout(() => window.location.reload(), 600)
    } catch (error) {
      setIsRestoring(false)
      toast.error('Restore failed: ' + String(error))
    }
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      <h3 className="text-xs sm:text-sm font-semibold">Backup &amp; Restore</h3>
      <p className="text-xs text-muted-foreground">
        Your list, trained brands, barcodes and trips are stored by this address only. Export a
        backup before moving to a new link or a new phone, then restore it there.
      </p>
      <Button
        onClick={handleExport}
        className={`w-full text-xs sm:text-sm ${TOUCH_TARGET}`}
        variant="outline"
        size="sm"
      >
        <DownloadSimple size={14} className="mr-2 shrink-0" />
        <span className="truncate">Export Backup</span>
      </Button>
      <Button
        onClick={toggleOpen}
        aria-expanded={isOpen}
        className={`w-full text-xs sm:text-sm ${TOUCH_TARGET}`}
        variant="outline"
        size="sm"
      >
        {isOpen ? <CaretUp size={14} className="mr-2 shrink-0" /> : <CaretDown size={14} className="mr-2 shrink-0" />}
        <span className="truncate">Restore From Backup</span>
      </Button>

      {isOpen && (
        <div ref={panelRef} className="space-y-3 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Pick the backup file, or paste the backup text. Anything already on this device is
            kept; the backup only fills in what is missing.
          </p>

          {/* A `display:none` input driven by `input.click()` is the pattern that
              silently does nothing in an installed Android PWA. A label over a
              visually-hidden input is activated natively by the tap instead. */}
          <Button
            asChild
            variant="outline"
            size="sm"
            className={`w-full text-xs sm:text-sm ${TOUCH_TARGET}`}
          >
            <label htmlFor="backup-file">
              <UploadSimple size={14} className="mr-2 shrink-0" />
              <span className="truncate">{fileName ?? 'Choose backup file'}</span>
            </label>
          </Button>
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />

          {captured ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs sm:text-sm font-semibold">Backup ready</p>
              <p className="text-xs text-muted-foreground">
                {describeCounts(captured.counts)} · {formatSize(captured.bytes)}
              </p>
              <Button variant="ghost" size="sm" className="px-0 text-xs" onClick={reset}>
                Use a different backup
              </Button>
            </div>
          ) : (
            <Textarea
              ref={areaRef}
              placeholder="…or paste the backup JSON here"
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
              onPaste={(event) => {
                // Keep a multi-MB paste out of the DOM: a giant single line in a
                // textarea is what locked the tab.
                event.preventDefault()
                ingest(event.clipboardData.getData('text'))
              }}
              onInput={(event) => {
                // A typed or differently-pasted value still counts. Short
                // fragments are dropped instead of raising "not a backup" at the
                // first keystroke; nobody hand-types a backup.
                const value = event.currentTarget.value
                event.currentTarget.value = ''
                if (value.length >= 100) ingest(value)
              }}
            />
          )}

          {isParsing && <p className="text-xs text-muted-foreground">Checking backup…</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={toggleOpen}>
              Cancel
            </Button>
            <Button
              size="sm"
              className={`flex-1 text-xs sm:text-sm ${TOUCH_TARGET}`}
              onClick={handleRestore}
              disabled={!captured || isRestoring}
            >
              <span className="truncate">Restore</span>
            </Button>
          </div>
        </div>
      )}

      {/* A stale installed app still renders the old section; the stamp is how
          that gets spotted instead of mistaken for a broken button. */}
      <p className="text-xs text-muted-foreground">Restore {RESTORE_REVISION}</p>
    </div>
  )
}
