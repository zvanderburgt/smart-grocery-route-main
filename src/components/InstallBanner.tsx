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
        <div className="w-full mx-auto px-[5%] py-2.5">
          {!showIOSSteps ? (
            <div className="flex items-center gap-3">
              <div className="shrink-0 h-9 w-9 rounded-xl bg-green-600 flex items-center justify-center shadow-sm">
                <DeviceMobile size={20} weight="fill" className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  Add to Home Screen
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {isIOS
                    ? 'Install for offline access and faster loads'
                    : 'Install the app for the best experience'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white px-3"
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
                      <ArrowDown size={12} />
                      {isIOS ? 'How?' : 'Install'}
                    </span>
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={dismiss}
                  title="Dismiss"
                >
                  <X size={14} />
                </Button>
              </div>
            </div>
          ) : (
            /* iOS Step-by-step instructions */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Add to Home Screen</p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={dismiss}
                >
                  <X size={13} />
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
                className="h-7 text-xs w-full"
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
