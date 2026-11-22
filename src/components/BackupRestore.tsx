/**
 * Backup & restore controls for the settings sheet.
 *
 * Export writes one JSON file with every list, learned brand, barcode, trip and
 * preference this install owns; restore merges it back. That is the only way to
 * carry data between origins, which is what a new deploy URL or a new phone is:
 * localStorage is per-origin, so the new address cannot see the old one's data
 * and no server round trip can bridge it.
 */

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  applyBackup,
  collectBackup,
  countBackup,
  describeCounts,
  parseBackup,
  serializeBackup,
} from '@/lib/backup'

const TOUCH_TARGET = 'pointer-coarse:min-h-11'

function backupFileName(now: Date): string {
  return `breadcrumb-backup-${now.toISOString().slice(0, 10)}.json`
}

export function BackupRestore() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => (text.trim() ? parseBackup(text) : null), [text])
  const incomingCounts = parsed?.ok ? countBackup(parsed.backup.data) : null

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
    try {
      setText(await file.text())
      setFileName(file.name)
    } catch (error) {
      toast.error('Could not read that file: ' + String(error))
    }
  }

  const handleRestore = () => {
    if (!parsed?.ok) return
    setIsRestoring(true)
    try {
      const result = applyBackup(window.localStorage, parsed.backup)
      const summary = describeCounts(result.counts)
      if (result.written.length === 0) {
        toast(`Nothing new to restore — ${summary} already here`)
        setIsRestoring(false)
        return
      }
      toast.success(`Restored — ${summary}. Reloading…`)
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
        onClick={() => setOpen(true)}
        className={`w-full text-xs sm:text-sm ${TOUCH_TARGET}`}
        variant="outline"
        size="sm"
      >
        <UploadSimple size={14} className="mr-2 shrink-0" />
        <span className="truncate">Restore From Backup</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Restore from backup</DialogTitle>
            <DialogDescription>
              Pick the backup file, or paste the backup text. Anything already on this device is
              kept; the backup only fills in what is missing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                void handleFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`w-full text-xs sm:text-sm ${TOUCH_TARGET}`}
              onClick={() => fileRef.current?.click()}
            >
              <UploadSimple size={14} className="mr-2 shrink-0" />
              <span className="truncate">{fileName ?? 'Choose backup file'}</span>
            </Button>

            <Textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setFileName(null)
              }}
              placeholder="…or paste the backup JSON here"
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
            />

            {text.trim() && parsed && !parsed.ok && (
              <p className="text-xs text-destructive">{parsed.error}</p>
            )}
            {incomingCounts && (
              <p className="text-xs text-muted-foreground">
                Found {describeCounts(incomingCounts)}. Restoring reloads the app.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRestore} disabled={!parsed?.ok || isRestoring}>
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
