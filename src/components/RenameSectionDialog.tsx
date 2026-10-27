import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Pencil } from '@phosphor-icons/react'

interface RenameSectionDialogProps {
  open: boolean
  onClose: () => void
  currentName: string
  onRename: (newName: string) => void
}

export function RenameSectionDialog({
  open,
  onClose,
  currentName,
  onRename
}: RenameSectionDialogProps) {
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (open) {
      setName(currentName)
    }
  }, [open, currentName])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && name.trim() !== currentName) {
      onRename(name.trim())
      onClose()
    } else {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Pencil className="h-5 w-5 text-primary" weight="duotone" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight">Rename Section</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground pt-1">
            Give this section a custom name that makes sense to you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="section-name" className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                Section Name
              </Label>
              <Input
                id="section-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter section name..."
                className="h-12 text-base font-medium tracking-wide border-2 focus:border-primary"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="font-semibold tracking-wider h-11"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || name.trim() === currentName}
              className="font-semibold tracking-wider h-11 bg-primary hover:bg-primary/90"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
