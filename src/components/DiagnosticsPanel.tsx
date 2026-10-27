import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GoogleSheetsSettings } from '@/components/GoogleSheetsSettings'
import { GearSix, Download, Trash, ArrowClockwise, Heart, GraduationCap, ChartBar, Lightbulb, Link, CaretDown, CaretUp, Mailbox, Copy, WarningCircle, CheckCircle, SpinnerBall, Question, CloudArrowUp } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { getOpenRouterApiKey, setOpenRouterApiKey, clearOpenRouterApiKey, hasOpenRouterApiKey, getSelectedOpenRouterModel, setSelectedOpenRouterModel, validateOpenRouterModel, getAvailableOpenRouterModels, getAutoSelectModel, setAutoSelectModel, type ModelValidationResult, type OpenRouterModel } from '@/lib/ocr-openrouter'

interface CacheInfo {
  name: string
  size: number
}

interface SWStatus {
  isRegistered: boolean
  isActive: boolean
  hasController: boolean
}

interface DiagnosticsPanelProps {
  open: boolean
  onClose: () => void
  showSuggestions: boolean
  onToggleSuggestions: (value: boolean) => void
  showConfidenceIndicators: boolean
  onToggleConfidenceIndicators: (value: boolean) => void
  hasLearningData: boolean
  onClearLearningData: () => void
  favoriteCount: number
  onOpenFavorites: () => void
  learnedBrandCount: number
  onOpenBrandTraining: () => void
  onOpenStats: () => void
  onOpenLearningTip: () => void
  sheetId: string
  setSheetId: (id: string) => void
  syncState: import('@/lib/types').SyncState
  onConnect: () => void
  onDisconnect: () => void
  onSyncNow: () => void
  userEmail: string | null
  lastSyncTime: number | null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

function formatTime(ms: number): string {
  const date = new Date(ms)
  const now = new Date()
  const diff = now.getTime() - ms

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  if (diff < 2592000000) return Math.floor(diff / 86400000) + 'd ago'

  return date.toLocaleDateString()
}

export function DiagnosticsPanel({ open, onClose, showSuggestions, onToggleSuggestions, showConfidenceIndicators, onToggleConfidenceIndicators, hasLearningData, onClearLearningData, favoriteCount, onOpenFavorites, learnedBrandCount, onOpenBrandTraining, onOpenStats, onOpenLearningTip, sheetId, setSheetId, syncState, onConnect, onDisconnect, onSyncNow, userEmail, lastSyncTime }: DiagnosticsPanelProps) {
  const [swStatus, setSWStatus] = useState<SWStatus>({
    isRegistered: false,
    isActive: false,
    hasController: false,
  })
  const [caches, setCaches] = useState<CacheInfo[]>([])
  const [storageQuota, setStorageQuota] = useState({ usage: 0, quota: 0 })
  const [isClearing, setIsClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearLearningConfirm, setShowClearLearningConfirm] = useState(false)
  const [openRouterKey, setOpenRouterKey] = useState(getOpenRouterApiKey() || '')
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [showOpenRouterInstructions, setShowOpenRouterInstructions] = useState(false)
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false)
  const [selectedModel, setSelectedModel] = useState(getSelectedOpenRouterModel())
  const [modelCheck, setModelCheck] = useState<ModelValidationResult | null>(null)
  const [isCheckingModel, setIsCheckingModel] = useState(false)
  const [freeModels, setFreeModels] = useState<OpenRouterModel[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [autoSelectModel, setAutoSelectModelState] = useState(getAutoSelectModel())
  // Bumped whenever the key is actually saved/cleared to localStorage, since typing
  // into the field doesn't touch localStorage and "Save" doesn't change openRouterKey.
  const [keySavedTick, setKeySavedTick] = useState(0)

  // Debounced validation: only fires after the user pauses typing, and only
  // when a key is present (there's nothing to check the model against otherwise).
  useEffect(() => {
    const key = getOpenRouterApiKey()
    const model = selectedModel.trim()

    if (!key || !model) {
      setModelCheck(null)
      return
    }

    setIsCheckingModel(true)
    const timer = window.setTimeout(async () => {
      const result = await validateOpenRouterModel(key, model)
      setModelCheck(result)
      setIsCheckingModel(false)
    }, 600)

    return () => {
      window.clearTimeout(timer)
      setIsCheckingModel(false)
    }
  }, [selectedModel, openRouterKey, keySavedTick])

  // Populate the optional free-model dropdown once a key is present and the sheet is open.
  useEffect(() => {
    const key = getOpenRouterApiKey()
    if (!open || !key) {
      setFreeModels([])
      setIsLoadingModels(false)
      return
    }
    setIsLoadingModels(true)
    getAvailableOpenRouterModels(key)
      .then(setFreeModels)
      .finally(() => setIsLoadingModels(false))
  }, [open, openRouterKey, keySavedTick])

  useEffect(() => {
    const loadStatus = async () => {
      // Load fast data immediately
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        setSWStatus({
          isRegistered: !!registration,
          isActive: !!(registration?.active),
          hasController: !!navigator.serviceWorker.controller,
        })
      }

      setOpenRouterKey(getOpenRouterApiKey() || '')

      // Defer expensive cache scanning until after animation
      setIsLoadingDiagnostics(true)
      requestAnimationFrame(() => {
        setTimeout(async () => {
          if ('caches' in window) {
            const cacheNames = await window.caches.keys()
            const cacheList: CacheInfo[] = []

            for (const name of cacheNames) {
              const cache = await window.caches.open(name)
              const requests = await cache.keys()
              let size = 0

              for (const req of requests) {
                const resp = await cache.match(req)
                if (resp) {
                  const blob = await resp.blob()
                  size += blob.size
                }
              }

              cacheList.push({ name, size })
            }

            setCaches(cacheList)
          }

          if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate()
            setStorageQuota({
              usage: estimate.usage ?? 0,
              quota: estimate.quota ?? 0,
            })
          }
          setIsLoadingDiagnostics(false)
        }, 600) // After 500ms sheet animation + buffer
      })
    }

    if (open) {
      loadStatus()
    }
  }, [open])

  const handleClearCaches = async () => {
    setIsClearing(true)
    try {
      if ('caches' in window) {
        const cacheNames = await window.caches.keys()
        await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
        setCaches([])
        toast.success('All caches cleared')
      }
    } catch (error) {
      toast.error('Failed to clear caches: ' + String(error))
    } finally {
      setIsClearing(false)
      setShowClearConfirm(false)
    }
  }

  const handleExportDiagnostics = () => {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      serviceWorker: swStatus,
      caches: caches.map((c) => ({ name: c.name, size: c.size, formatted: formatBytes(c.size) })),
      storage: {
        usage: formatBytes(storageQuota.usage),
        quota: formatBytes(storageQuota.quota),
        usagePercent: Math.round((storageQuota.usage / storageQuota.quota) * 100),
      },
      ocrMode: hasOpenRouterApiKey() ? 'cloud' : 'not_configured',
      userAgent: navigator.userAgent,
    }

    const json = JSON.stringify(diagnostics, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `grocery-diagnostics-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Diagnostics exported')
  }

  const totalCacheSize = caches.reduce((sum, c) => sum + c.size, 0)
  const storagePercent = (storageQuota.usage / storageQuota.quota) * 100
  const isCloudMode = hasOpenRouterApiKey()

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:w-96 overflow-y-auto p-6 sm:p-8">
          <SheetHeader className="p-0 mb-6 sm:mb-8">
            <SheetTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <GearSix size={20} className="shrink-0" />
              <span className="truncate">Settings</span>
            </SheetTitle>
            <SheetDescription className="text-xs sm:text-sm">Preferences, PWA health, and diagnostics</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    onOpenFavorites()
                    onClose()
                  }}
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs sm:text-sm h-auto py-2"
                >
                  <Heart size={14} className="mr-2 shrink-0" />
                  <div className="text-left truncate">
                    <div className="truncate">Favorites</div>
                    <div className="text-xs text-muted-foreground">{favoriteCount} saved</div>
                  </div>
                </Button>
                <Button
                  onClick={() => {
                    onOpenBrandTraining()
                    onClose()
                  }}
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs sm:text-sm h-auto py-2"
                >
                  <GraduationCap size={14} className="mr-2 shrink-0" />
                  <div className="text-left truncate">
                    <div className="truncate">Training</div>
                    <div className="text-xs text-muted-foreground">{learnedBrandCount} brands</div>
                  </div>
                </Button>
                <Button
                  onClick={() => {
                    onOpenStats()
                    onClose()
                  }}
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs sm:text-sm h-auto py-2"
                >
                  <ChartBar size={14} className="mr-2 shrink-0" />
                  <div className="text-left truncate">
                    <div className="truncate">Statistics</div>
                    <div className="text-xs text-muted-foreground">View stats</div>
                  </div>
                </Button>
                <Button
                  onClick={() => {
                    onOpenLearningTip()
                    onClose()
                  }}
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs sm:text-sm h-auto py-2"
                >
                  <Lightbulb size={14} className="mr-2 shrink-0" />
                  <div className="text-left truncate">
                    <div className="truncate">Learning</div>
                    <div className="text-xs text-muted-foreground">How it works</div>
                  </div>
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-xs sm:text-sm font-semibold">Preferences</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="show-suggestions" className="text-xs sm:text-sm font-normal cursor-pointer">
                    <span className="block">Smart Suggestions</span>
                    <span className="block text-muted-foreground text-xs">Show item suggestions as you shop</span>
                  </Label>
                  <Switch
                    id="show-suggestions"
                    checked={showSuggestions}
                    onCheckedChange={onToggleSuggestions}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="show-confidence" className="text-xs sm:text-sm font-normal cursor-pointer">
                    <span className="block">Confidence Indicators</span>
                    <span className="block text-muted-foreground text-xs">Show category prediction confidence</span>
                  </Label>
                  <Switch
                    id="show-confidence"
                    checked={showConfidenceIndicators}
                    onCheckedChange={onToggleConfidenceIndicators}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold">OCR Settings</h3>
              
              <div className="p-4 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-start gap-3">
                  <CloudArrowUp size={24} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" weight="duotone" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-blue-600 text-white text-xs">
                        <CheckCircle size={12} className="mr-1" weight="fill" />
                        Cloud OCR
                      </Badge>
                      {isCloudMode && isCheckingModel && (
                        <Badge variant="outline" className="text-xs">
                          <SpinnerBall size={12} className="mr-1 animate-spin" />
                          Checking model…
                        </Badge>
                      )}
                      {isCloudMode && !isCheckingModel && modelCheck?.valid && (
                        <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle size={12} className="mr-1" />
                          Model verified
                        </Badge>
                      )}
                      {isCloudMode && !isCheckingModel && modelCheck && !modelCheck.valid && (
                        <Badge variant="outline" className="text-xs border-destructive text-destructive">
                          <WarningCircle size={12} className="mr-1" />
                          Invalid model
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm font-semibold mb-1">
                      {isCloudMode
                        ? (modelCheck?.valid ? (modelCheck.name || selectedModel) : selectedModel || 'No model set')
                        : 'MiniMax M3 via OpenRouter'}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {isCloudMode
                        ? (modelCheck && !modelCheck.valid ? modelCheck.reason : 'Cloud OCR is active')
                        : 'Add an API key below to enable OCR'}
                    </div>
                    <div className="flex flex-wrap gap-1 text-xs">
                      <Badge variant="outline" className="bg-white/50 dark:bg-black/20">✓ Best accuracy</Badge>
                      <Badge variant="outline" className="bg-white/50 dark:bg-black/20">✓ No download</Badge>
                      <Badge variant="outline" className="bg-white/50 dark:bg-black/20">✗ Needs internet</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold">OpenRouter API Key</h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      id="openrouter-key"
                      type={showOpenRouterKey ? 'text' : 'password'}
                      value={openRouterKey}
                      onChange={(e) => setOpenRouterKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs sm:text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pr-14"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                    >
                      {showOpenRouterKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={async () => {
                      if (!openRouterKey.trim()) {
                        toast.error('Please enter an API key');
                        return;
                      }
                      setIsSavingKey(true);
                      try {
                        setOpenRouterApiKey(openRouterKey.trim());
                        setKeySavedTick((t) => t + 1);
                        toast.success(isCloudMode ? 'API key updated' : 'Cloud OCR enabled!');
                      } catch (e) {
                        toast.error('Failed to save API key');
                      } finally {
                        setIsSavingKey(false);
                      }
                    }}
                    disabled={isSavingKey || !openRouterKey.trim()}
                    size="sm"
                    className="text-xs"
                  >
                    {isSavingKey ? 'Saving...' : isCloudMode ? 'Update Key' : 'Enable Cloud OCR'}
                  </Button>
                  {isCloudMode && (
                    <Button
                      onClick={() => {
                        clearOpenRouterApiKey();
                        setOpenRouterKey('');
                        setModelCheck(null);
                        setKeySavedTick((t) => t + 1);
                        toast.success('API key cleared');
                      }}
                      size="sm"
                      variant="outline"
                      className="text-xs"
                    >
                      <Trash size={12} className="mr-1" />
                      Clear
                    </Button>
                  )}
                  <Button
                    onClick={() => setShowOpenRouterInstructions(true)}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                  >
                    <Question size={12} className="mr-1" />
                    How to Get Key
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="openrouter-model" className="text-xs font-semibold">
                      Cloud Model
                    </Label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="auto-select-model" className="text-xs font-normal text-muted-foreground cursor-pointer">
                        Auto-select
                      </Label>
                      <Switch
                        id="auto-select-model"
                        checked={autoSelectModel}
                        onCheckedChange={(checked) => {
                          setAutoSelectModelState(checked)
                          setAutoSelectModel(checked)
                        }}
                      />
                    </div>
                  </div>
                  {autoSelectModel && (
                    <p className="text-xs text-muted-foreground">
                      Auto-select is on: each scan tries free models from the top of the list until one works, then remembers it. If all fail, the list is refreshed and retried once.
                    </p>
                  )}
                  {isCloudMode && (
                    <Select
                      value=""
                      disabled={autoSelectModel || isLoadingModels || freeModels.length === 0}
                      onValueChange={(modelId) => {
                        setSelectedModel(modelId)
                        setSelectedOpenRouterModel(modelId)
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs w-full">
                        <SelectValue
                          placeholder={
                            isLoadingModels
                              ? 'Loading free models…'
                              : freeModels.length === 0
                                ? 'No free vision models found'
                                : 'Pick a free model (optional)'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {freeModels.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            {m.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <input
                    id="openrouter-model"
                    type="text"
                    value={selectedModel}
                    disabled={autoSelectModel}
                    onChange={(e) => {
                      const modelId = e.target.value;
                      setSelectedModel(modelId);
                      setSelectedOpenRouterModel(modelId);
                    }}
                    placeholder="minimax/minimax-m3:free"
                    className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      modelCheck && !isCheckingModel
                        ? modelCheck.valid
                          ? 'border-emerald-500'
                          : 'border-destructive'
                        : 'border-input'
                    }`}
                  />
                  {isCloudMode && (
                    <p className="text-xs">
                      {isCheckingModel ? (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <SpinnerBall size={12} className="animate-spin" /> Checking against OpenRouter…
                        </span>
                      ) : modelCheck?.valid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle size={12} /> {modelCheck.reason ?? 'Valid vision model'}
                        </span>
                      ) : modelCheck ? (
                        <span className="text-destructive flex items-center gap-1">
                          <WarningCircle size={12} /> {modelCheck.reason}
                        </span>
                      ) : null}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Enter the model ID from OpenRouter. Example: <code className="bg-muted px-1 rounded text-xs">minimax/minimax-m3:free</code>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get a free key at{' '}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground font-semibold"
                  >
                    openrouter.ai/keys
                  </a>
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold">Data Management</h3>
              <p className="text-xs text-muted-foreground">
                The app learns your shopping habits over time. You can reset this learning data without clearing your list.
              </p>
              <Button
                onClick={() => setShowClearLearningConfirm(true)}
                disabled={!hasLearningData}
                className="w-full text-xs sm:text-sm"
                variant="outline"
                size="sm"
              >
                <Trash size={14} className="mr-2 shrink-0" />
                <span className="truncate">Clear Learning Data</span>
              </Button>
            </div>

            <Separator />

            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold">Service Worker</h3>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground truncate">Registered</span>
                  <Badge variant={swStatus.isRegistered ? 'default' : 'secondary'} className="shrink-0">
                    {swStatus.isRegistered ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground truncate">Active</span>
                  <Badge variant={swStatus.isActive ? 'default' : 'secondary'} className="shrink-0">
                    {swStatus.isActive ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground truncate">Controlling</span>
                  <Badge variant={swStatus.hasController ? 'default' : 'secondary'} className="shrink-0">
                    {swStatus.hasController ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold">Storage Quota</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs sm:text-sm gap-2">
                  <span className="text-muted-foreground truncate">Used</span>
                  <span className="font-mono shrink-0">{formatBytes(storageQuota.usage)}</span>
                </div>
                <Progress value={storagePercent} className="h-1.5 sm:h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{Math.round(storagePercent)}%</span>
                  <span className="text-right">{formatBytes(storageQuota.quota)}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold">Cache Storage</h3>
              {isLoadingDiagnostics ? (
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                  <SpinnerBall size={12} className="animate-spin" />
                  Loading…
                </p>
              ) : caches.length === 0 ? (
                <p className="text-xs sm:text-sm text-muted-foreground">No caches found</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {caches.map((cache) => (
                    <div key={cache.name} className="flex justify-between items-center text-xs sm:text-sm p-2 bg-muted rounded gap-2">
                      <span className="font-mono text-xs truncate flex-1 min-w-0">{cache.name}</span>
                      <span className="text-muted-foreground shrink-0">{formatBytes(cache.size)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs sm:text-sm font-semibold p-2 border-t mt-2 gap-2">
                    <span>Total</span>
                    <span className="shrink-0">{formatBytes(totalCacheSize)}</span>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                <Link size={14} className="text-primary" />
                Google Sheets Sync
              </h3>
              <GoogleSheetsSettings
                sheetId={sheetId}
                setSheetId={setSheetId}
                syncState={syncState}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onSyncNow={onSyncNow}
                userEmail={userEmail}
                lastSyncTime={lastSyncTime}
              />
            </div>

            <Separator />

            <div className="space-y-2 pb-4">
              <Button onClick={handleExportDiagnostics} className="w-full text-xs sm:text-sm" variant="outline" size="sm">
                <Download size={14} className="mr-2 shrink-0" />
                <span className="truncate">Export Diagnostics</span>
              </Button>

              <Button
                onClick={() => setShowClearConfirm(true)}
                disabled={isClearing || caches.length === 0}
                className="w-full text-xs sm:text-sm"
                variant="destructive"
                size="sm"
              >
                <Trash size={14} className="mr-2 shrink-0" />
                <span className="truncate">{isClearing ? 'Clearing…' : 'Clear All Caches'}</span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showOpenRouterInstructions} onOpenChange={setShowOpenRouterInstructions}>
        <DialogContent className="max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle>How to Get an OpenRouter API Key</DialogTitle>
            <DialogDescription>Follow these steps to enable cloud OCR</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </div>
                <div>
                  <div className="font-semibold">Visit OpenRouter</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Go to{' '}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      openrouter.ai/keys
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  2
                </div>
                <div>
                  <div className="font-semibold">Sign in or Create Account</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sign in with Google, GitHub, or create a new account
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  3
                </div>
                <div>
                  <div className="font-semibold">Create API Key</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click "Create Key" and give it a name (e.g., "Grocery App")
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  4
                </div>
                <div>
                  <div className="font-semibold">Copy & Paste Key</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Copy your new API key (starts with "sk-or-v1-") and paste it above
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted border">
              <p className="text-xs text-muted-foreground">
                <strong>Note:</strong> OpenRouter offers a free tier with credits. MiniMax M3 costs approximately $0.005 per image.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showClearLearningConfirm} onOpenChange={setShowClearLearningConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Learning Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all learned shopping patterns, trip history, and brand associations. Your grocery list items will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onClearLearningData(); setShowClearLearningConfirm(false) }}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm} className="z-[1000]">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Caches?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete {formatBytes(totalCacheSize)} of cached data. You'll need to re-download
              assets and images on next use.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearCaches}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}