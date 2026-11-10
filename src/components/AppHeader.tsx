import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { GearSix, DeviceMobile, Brain, CloudArrowUp, SpinnerBall, CheckCircle, WarningCircle, CloudSlash } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

interface AppHeaderProps {
  isOnline: boolean
  serviceWorkerReady: boolean
  pwaStatusLabel: string
  onSettingsClick: () => void
  pwaInstall: {
    canInstall: boolean
    isIOS: boolean
    triggerInstall: () => void
  }
  totalItems: number
  unresolvedItems: number
  progress: number
  canToggleLearningProgress: boolean
  learningProgressVisible: boolean
  onToggleLearningProgress: () => void
  // Google Sheets sync status
  googleSheetsSyncStatus?: 'disconnected' | 'connecting' | 'synced' | 'syncing' | 'conflict' | 'error'
  googleSheetsLastSync?: number
}

/**
 * Header component with title, status indicators (online, PWA), and toolbar buttons.
 * Displayed sticky at top of app with responsive sizing.
 */
export const AppHeader = memo(function AppHeader({
  isOnline,
  serviceWorkerReady,
  pwaStatusLabel,
  onSettingsClick,
  pwaInstall,
  totalItems,
  unresolvedItems,
  progress,
  canToggleLearningProgress,
  learningProgressVisible,
  onToggleLearningProgress,
  googleSheetsSyncStatus,
  googleSheetsLastSync,
}: AppHeaderProps) {
  const shouldReduceMotion = useReducedMotion()
  const readinessLabel = !isOnline
    ? 'Offline mode'
    : serviceWorkerReady
      ? 'Ready in store'
      : 'Preparing tools'

  // "Preparing tools" is a neutral transitional state, not a warning: the warm
  // accent reads as an error next to the destructive Offline chip.
  const readinessClassName = !isOnline
    ? 'border-destructive/20 bg-destructive/10 text-destructive'
    : serviceWorkerReady
      ? 'border-primary/20 bg-primary/10 text-primary'
      : 'border-border bg-muted text-muted-foreground'

  const readinessDetail = pwaStatusLabel
  const badgeTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const }

  const unresolvedLabel = unresolvedItems === 1 ? 'item left' : 'items left'

  // Google Sheets sync status indicator
  const getSyncStatusConfig = (status: AppHeaderProps['googleSheetsSyncStatus']) => {
    switch (status) {
      case 'synced':
        return { label: 'Synced', icon: CheckCircle, colorClass: 'text-green-600 dark:text-green-400', variant: 'default' as const }
      case 'syncing':
      case 'connecting':
        return { label: 'Syncing…', icon: SpinnerBall, colorClass: 'text-yellow-600 dark:text-yellow-400', variant: 'secondary' as const }
      case 'error':
        return { label: 'Error', icon: WarningCircle, colorClass: 'text-red-600 dark:text-red-400', variant: 'destructive' as const }
      case 'conflict':
        return { label: 'Conflict', icon: WarningCircle, colorClass: 'text-red-600 dark:text-red-400', variant: 'destructive' as const }
      case 'disconnected':
      default:
        return { label: 'Offline', icon: CloudSlash, colorClass: 'text-muted-foreground', variant: 'outline' as const }
    }
  }

  const syncStatusConfig = getSyncStatusConfig(googleSheetsSyncStatus ?? 'disconnected')
  const SyncStatusIcon = syncStatusConfig.icon

  return (
    /*
      Positioning is owned by the caller in App.tsx: the pinning wrapper has to
      be a direct child of the page-height column, otherwise sticky has no room
      to travel. Keep this element free of `filter`/`transform`/`will-change`,
      which would make it a containing block for fixed children.
    */
    <div className="relative bg-background border-b border-border pt-safe">
      <div className="w-full mx-auto px-4 sm:px-5 py-2 coarse:py-3 space-y-3 coarse:space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <motion.h1
              initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={badgeTransition}
              className="text-2xl font-bold tracking-tight [@media(max-height:500px)]:text-lg"
            >
              Breadcrumb
            </motion.h1>
            {/* On a phone held sideways (393px tall) a permanently pinned header
                would eat a third of the screen. The title and the progress row
                stay; this secondary row (readiness chip + learning toggle) is
                the first thing that can go. */}
            <div className="flex items-center gap-2 [@media(max-height:500px)]:hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={readinessLabel}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: -6, filter: 'blur(6px)' }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, y: 4, filter: 'blur(4px)' }}
                  transition={badgeTransition}
                >
                  <Badge
                    variant="outline"
                    className={`gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${readinessClassName}`}
                    title={readinessDetail}
                  >
                    <motion.span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full bg-current"
                      animate={shouldReduceMotion ? undefined : { scale: [1, 1.18, 1] }}
                      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, ease: 'easeOut' }}
                    />
                    {readinessLabel}
                  </Badge>
                </motion.div>
              </AnimatePresence>

              {canToggleLearningProgress && (
                <Button
                  variant={learningProgressVisible ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={onToggleLearningProgress}
                  title={learningProgressVisible ? 'Hide learning progress card' : 'Show learning progress card'}
                  aria-label={learningProgressVisible ? 'Hide learning progress card' : 'Show learning progress card'}
                  aria-pressed={learningProgressVisible}
                >
                  <Brain className="h-4 w-4" weight={learningProgressVisible ? 'fill' : 'regular'} />
                </Button>
              )}

              {/* Google Sheets Sync Status */}
              {googleSheetsSyncStatus !== undefined && (
                <Badge
                  variant={syncStatusConfig.variant}
                  className={`gap-1.5 px-2.5 py-1 text-xs font-semibold ${syncStatusConfig.colorClass}`}
                  title={googleSheetsLastSync ? `Last sync: ${new Date(googleSheetsLastSync).toLocaleTimeString()}` : 'Google Sheets sync'}
                >
                  <SyncStatusIcon className="h-3 w-3" />
                  {syncStatusConfig.label}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 coarse:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={onSettingsClick}
              title="Settings and utilities"
              aria-label="Settings and utilities"
            >
              <GearSix className="h-5 w-5" />
            </Button>
            {pwaInstall.canInstall && !pwaInstall.isIOS && (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-green-600"
                onClick={() => pwaInstall.triggerInstall()}
                title="Install app"
                aria-label="Install app"
              >
                <DeviceMobile className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {totalItems > 0 && (
            <motion.div
              key="progress"
              initial={shouldReduceMotion ? false : { opacity: 0, y: -8, filter: 'blur(8px)' }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={badgeTransition}
              className="space-y-1.5 coarse:space-y-1"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  {unresolvedItems} {unresolvedLabel}
                </span>
                <motion.span
                  key={progress}
                  initial={shouldReduceMotion ? false : { opacity: 0.5, y: -2 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={badgeTransition}
                  className="text-muted-foreground font-medium"
                >
                  {progress}% complete
                </motion.span>
              </div>
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0.7, scaleX: 0.96 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, scaleX: 1 }}
                transition={badgeTransition}
                style={{ originX: 0 }}
              >
                <Progress value={progress} className="h-2" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
})
