import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { CaretDown, CaretUp, Mailbox, FloppyDisk, CloudArrowUp, CloudArrowDown, CloudX, WarningCircle, CheckCircle, Spinner, Question, Link } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { SyncState } from '@/lib/types'

interface GoogleSheetsSettingsProps {
  sheetId: string
  setSheetId: (id: string) => void
  syncState: SyncState
  onConnect: () => void
  onDisconnect: () => void
  onSyncNow: () => void
  userEmail: string | null
  lastSyncTime: number | null
  standalone?: boolean
}

function formatTime(ms: number | null): string {
  if (!ms) return 'Never'
  const date = new Date(ms)
  const now = new Date()
  const diff = now.getTime() - ms

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  if (diff < 2592000000) return Math.floor(diff / 86400000) + 'd ago'

  return date.toLocaleDateString()
}

function getStatusBadgeVariant(status: SyncState['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'synced':
      return 'default'
    case 'syncing':
    case 'connecting':
      return 'secondary'
    case 'error':
      return 'destructive'
    case 'conflict':
      return 'destructive'
    case 'disconnected':
    default:
      return 'outline'
  }
}

function getStatusLabel(status: SyncState['status']): string {
  switch (status) {
    case 'synced':
      return 'Synced'
    case 'syncing':
      return 'Syncing…'
    case 'connecting':
      return 'Connecting…'
    case 'error':
      return 'Error'
    case 'conflict':
      return 'Conflict'
    case 'disconnected':
    default:
      return 'Disconnected'
  }
}

function getStatusIcon(status: SyncState['status'], isSyncing: boolean) {
  const spinClass = isSyncing ? 'animate-spin' : ''
  switch (status) {
    case 'synced':
      return <CheckCircle size={12} weight="fill" className={spinClass} />
    case 'syncing':
    case 'connecting':
      return <Spinner size={12} className={spinClass} />
    case 'error':
      return <WarningCircle size={12} weight="fill" className={spinClass} />
    case 'conflict':
      return <WarningCircle size={12} weight="fill" className={spinClass} />
    case 'disconnected':
    default:
      return <CloudX size={12} className={spinClass} />
  }
}

export function GoogleSheetsSettings({
  sheetId,
  setSheetId,
  syncState,
  onConnect,
  onDisconnect,
  onSyncNow,
  userEmail,
  lastSyncTime,
  standalone = false,
}: GoogleSheetsSettingsProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [isSavingSheetId, setIsSavingSheetId] = useState(false)

  const handleSaveSheetId = () => {
    if (!sheetId.trim()) {
      toast.error('Please enter a Sheet ID')
      return
    }
    setIsSavingSheetId(true)
    setSheetId(sheetId.trim())
    setIsSavingSheetId(false)
    toast.success('Sheet ID saved')
  }

  const handleSyncNow = () => {
    if (syncState.status === 'syncing' || syncState.status === 'connecting') {
      return
    }
    onSyncNow()
  }

  const handleConnect = () => {
    if (!sheetId.trim()) {
      toast.error('Please enter a Sheet ID first')
      return
    }
    onConnect()
  }

  const handleDisconnect = () => {
    setShowDisconnectConfirm(false)
    onDisconnect()
  }

  const isConnected = syncState.status !== 'disconnected' && syncState.status !== 'error'
  const isSyncing = syncState.status === 'syncing' || syncState.status === 'connecting'

  const content = (
    <>
      <div className="space-y-4 sm:space-y-6">
        {/* Connection Status */}
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold">Connection Status</h3>
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <Badge
              variant={getStatusBadgeVariant(syncState.status)}
              className="gap-1.5 px-2.5 py-1 text-xs font-semibold"
            >
              {getStatusIcon(syncState.status, isSyncing)}
              {getStatusLabel(syncState.status)}
            </Badge>
            <div className="flex-1 min-w-0 text-xs sm:text-sm text-muted-foreground">
              {syncState.lastError && (
                <span className="text-destructive font-medium">{syncState.lastError}</span>
              )}
              {!syncState.lastError && syncState.status === 'synced' && (
                <span>Last sync: {formatTime(lastSyncTime)}</span>
              )}
              {!syncState.lastError && syncState.status !== 'synced' && syncState.status !== 'disconnected' && (
                <span>{syncState.status.charAt(0).toUpperCase() + syncState.status.slice(1)}…</span>
              )}
              {syncState.status === 'disconnected' && !syncState.lastError && (
                <span>Not connected to Google Sheets</span>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Google Account */}
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold">Google Account</h3>
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Mailbox size={18} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {userEmail ? userEmail : 'Not connected'}
                </div>
                {userEmail && (
                  <div className="text-xs text-muted-foreground">Signed in</div>
                )}
              </div>
            </div>
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDisconnectConfirm(true)}
                disabled={isSyncing}
                className="shrink-0"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={isSyncing || !sheetId.trim()}
                className="shrink-0"
              >
                <CloudArrowUp size={14} className="mr-1.5 shrink-0" />
                <span className="truncate">Connect</span>
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Sheet ID Input */}
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold">Spreadsheet ID</h3>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="Enter Sheet ID from URL"
                disabled={isSavingSheetId}
                className="flex-1 min-w-0"
                aria-label="Google Sheet ID"
              />
              <Button
                size="sm"
                onClick={handleSaveSheetId}
                disabled={isSavingSheetId || !sheetId.trim()}
                className="shrink-0"
              >
                <FloppyDisk size={14} className="mr-1.5 shrink-0" />
                <span className="truncate">{isSavingSheetId ? 'Saving…' : 'Save'}</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Found in the URL: <code className="font-mono bg-muted px-1 rounded">{'docs.google.com/spreadsheets/d/{SHEET_ID}/edit'}</code>
            </p>
          </div>
        </div>

        <Separator />

        {/* Sync Controls */}
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold">Sync Controls</h3>
          <div className="space-y-2">
            <Button
              className="w-full justify-start gap-2"
              onClick={handleSyncNow}
              disabled={isSyncing || !isConnected}
              variant={isConnected ? 'default' : 'outline'}
            >
              {isSyncing ? (
                <>
                  <Spinner size={14} className="animate-spin shrink-0" />
                  <span>Syncing…</span>
                </>
              ) : (
                <>
                  <CloudArrowDown size={14} className="shrink-0" />
                  <span>Sync Now</span>
                </>
              )}
            </Button>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Last sync</span>
              <span className="font-mono">{formatTime(lastSyncTime)}</span>
            </div>
            {syncState.pendingWrites > 0 && (
              <div className="text-xs text-accent-foreground bg-accent/10 border border-accent/20 rounded px-2 py-1">
                {syncState.pendingWrites} pending change{syncState.pendingWrites !== 1 ? 's' : ''} to sync
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Setup Instructions */}
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
            <Question size={14} className="shrink-0" />
            Setup Instructions
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 text-left text-xs sm:text-sm font-medium transition-colors"
            onClick={() => setShowInstructions(!showInstructions)}
            aria-expanded={showInstructions}
          >
            <span>Click to expand setup guide</span>
            {showInstructions ? <CaretUp size={14} className="shrink-0 text-muted-foreground" /> : <CaretDown size={14} className="shrink-0 text-muted-foreground" />}
          </Button>

          {showInstructions && (
            <div className="space-y-3 pt-1 text-xs sm:text-sm text-muted-foreground overflow-hidden transition-all duration-200 ease-in-out">
              <ol className="space-y-2 list-decimal list-inside">
                <li className="space-y-1">
                  <span className="font-medium text-foreground">Create a Google Sheet</span>
                  <p>Go to <a href="https://sheets.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline flex items-center gap-1">
                    sheets.google.com <Link size={10} />
                  </a> and create a new blank spreadsheet.</p>
                </li>
                <li className="space-y-1">
                  <span className="font-medium text-foreground">Add header row</span>
                  <p>In row 1, add these exact column headers:</p>
                  <code className="block bg-muted p-2 rounded font-mono text-xs overflow-x-auto whitespace-nowrap">
                    id, name, checked, checkedAt, addedAt, category, quantity, updatedAt, updatedBy
                  </code>
                </li>
                <li className="space-y-1">
                  <span className="font-medium text-foreground">Share with both Google accounts</span>
                  <p>Click <strong>Share</strong> → add both Google accounts (yours + partner's) with <strong>Editor</strong> access.</p>
                </li>
                <li className="space-y-1">
                  <span className="font-medium text-foreground">Copy the Sheet ID</span>
                  <p>From the URL: <code className="font-mono bg-muted px-1 rounded">{'docs.google.com/spreadsheets/d/{SHEET_ID}/edit'}</code></p>
                  <p>Copy the <code className="font-mono bg-muted px-1 rounded">{sheetId || 'SHEET_ID'}</code> part and paste it above.</p>
                </li>
                <li className="space-y-1">
                  <span className="font-medium text-foreground">Click Connect</span>
                  <p>Enter the Sheet ID above, click <strong>Connect</strong> to authorize, then click <strong>Sync Now</strong>.</p>
                </li>
              </ol>
              <div className="pt-2 border-t flex items-center gap-2 text-primary">
                <Question size={12} />
                <span className="text-xs">Both accounts need Editor access for real-time sync to work.</span>
              </div>
            </div>
          )}
        </div>

        {syncState.status === 'error' && syncState.lastError && (
          <AlertDialog open={true} onOpenChange={() => {}}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sync Error</AlertDialogTitle>
                <AlertDialogDescription>
                  {syncState.lastError}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => onSyncNow()}>Retry Sync</AlertDialogAction>
                <AlertDialogCancel>Dismiss</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {syncState.status === 'conflict' && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            <WarningCircle size={14} className="mr-2 shrink-0" />
            <span>Sync conflict detected. Manual resolution required.</span>
          </div>
        )}
      </div>

      {/* Disconnect Confirmation */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect from Google Sheets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign you out and stop syncing. Your local list will not be affected. You can reconnect anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDisconnectConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-destructive hover:bg-destructive/90">Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (standalone) {
    return (
      <Sheet open={true} onOpenChange={() => {}}>
        <SheetContent side="right" className="w-full sm:w-96 overflow-y-auto p-6 sm:p-8">
          <SheetHeader className="p-0 mb-6 sm:mb-8">
            <SheetTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <CloudArrowUp size={20} className="shrink-0 text-primary" />
              <span className="truncate">Google Sheets Sync</span>
            </SheetTitle>
            <SheetDescription className="text-xs sm:text-sm">Sync your grocery list across devices via Google Sheets</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    )
  }

  return content
}