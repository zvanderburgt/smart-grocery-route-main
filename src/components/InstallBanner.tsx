import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { DeviceMobile, X, ShareNetwork, PlusSquare, ArrowDown } from '@phosphor-icons/react'
import type { PWAInstallState } from '@/hooks/use-pwa-install'

interface InstallBannerProps extends PWAInstallState {}

export function InstallBanner({ canInstall, isIOS, triggerInstall, dismiss }: InstallBannerProps) {
  const [isInstalling, setIsInstalling] = useState(false)
  const [showIOSSteps, setShowIOSSteps] = useState(false)

  if (!canInstall) return null

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSSteps(true)
      return
    }
    setIsInstalling(true)
    const outcome = await triggerInstall()
    setIsInstalling(false)
    if (outcome === 'accepted') {
      dismiss()
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="install-banner"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="border-b border-border bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40"
      >
        {/* One 44px-tall row on phones: the old title+subtitle stack was 57px and
            still truncated the subtitle at 360px, so the subtitle only appears
            once there is room for it (sm+). */}
        <div className="w-full mx-auto px-3 sm:px-[5%] py-0.5 sm:py-2.5">
          {!showIOSSteps ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="shrink-0 h-7 w-7 sm:h-9 sm:w-9 rounded-lg bg-green-600/10 text-green-700 dark:bg-green-500/15 dark:text-green-300 flex items-center justify-center">
                <DeviceMobile size={16} weight="fill" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight truncate">
                  Add to Home Screen
                </p>
                <p className="hidden sm:block text-xs text-muted-foreground truncate">
                  {isIOS
                    ? 'Install for offline access and faster loads'
                    : 'Install the app for the best experience'}
                </p>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <Button
                  size="sm"
                  className="h-11 sm:h-8 text-xs bg-green-600/15 text-green-800 hover:bg-green-600/25 dark:bg-green-500/20 dark:text-green-100 dark:hover:bg-green-500/30 px-2.5 sm:px-3"
                  onClick={handleInstall}
                  disabled={isInstalling}
                >
                  {isInstalling ? (
                    <motion.span
                      className="flex items-center gap-1"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <ArrowDown size={12} />
                      Installing…
                    </motion.span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <ArrowDown size={12} className="hidden sm:block" />
                      {isIOS ? 'How?' : 'Install'}
                    </span>
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                  onClick={dismiss}
                  title="Dismiss"
                  aria-label="Dismiss install banner"
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
          ) : (
            /* iOS Step-by-step instructions */
            <div className="space-y-2 py-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Add to Home Screen</p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11 sm:h-7 sm:w-7 text-muted-foreground"
                  onClick={dismiss}
                  aria-label="Dismiss install banner"
                >
                  <X size={15} />
                </Button>
              </div>
              <ol className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                  <span>
                    Tap the{' '}
                    <span className="inline-flex items-center gap-0.5 text-foreground font-medium">
                      <ShareNetwork size={12} className="text-blue-500" /> Share
                    </span>{' '}
                    button in Safari's menu bar
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                  <span>
                    Scroll down and tap{' '}
                    <span className="inline-flex items-center gap-0.5 text-foreground font-medium">
                      <PlusSquare size={12} /> Add to Home Screen
                    </span>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">3</span>
                  <span>Tap <span className="text-foreground font-medium">Add</span> in the top-right corner</span>
                </li>
              </ol>
              <Button
                size="sm"
                variant="outline"
                className="h-11 sm:h-7 text-xs w-full"
                onClick={dismiss}
              >
                Got it
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
