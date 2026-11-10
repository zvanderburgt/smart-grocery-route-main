import { memo, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Plus, Camera, Microphone, Sparkle, DotsThree, ArrowsClockwise, Trash, TextAlignLeft, DotsSixVertical, Check } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

interface ItemInputBarProps {
  newItemName: string
  onNewItemNameChange: (value: string) => void
  onAddItem: () => void
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void
  isListening: boolean
  isSupported: boolean
  onVoiceToggle: () => void
  onRecipeClick: () => void
  onScanClick: () => void
  onBulkAddClick: () => void
  onClearCompleted: () => void
  onReorganize: () => void
  onClearAll: () => void
  onToggleOrganizeMode: () => void
  hasCheckedItems: boolean
  hasItems: boolean
  isOrganizeMode: boolean
}

/**
 * Input bar component with text input, add button, voice input button, and dropdown for more options.
 * Displayed below header, sticky positioning for mobile.
 */
export const ItemInputBar = memo(function ItemInputBar({
  newItemName,
  onNewItemNameChange,
  onAddItem,
  onKeyPress,
  isListening,
  isSupported,
  onVoiceToggle,
  onRecipeClick,
  onScanClick,
  onBulkAddClick,
  onClearCompleted,
  onReorganize,
  onClearAll,
  onToggleOrganizeMode,
  hasCheckedItems,
  hasItems,
  isOrganizeMode,
}: ItemInputBarProps) {
  const shouldReduceMotion = useReducedMotion()
  const [isToolsOpen, setIsToolsOpen] = useState(false)

  const handleVoiceClick = useCallback(() => {
    if (!isSupported) {
      toast.info('Voice input is unavailable in this browser or installed app. Try opening in Chrome/Safari, or use your keyboard dictation.')
      return
    }
    onVoiceToggle()
  }, [isSupported, onVoiceToggle])

  const handleToolAction = useCallback((action: () => void) => {
    action()
    setIsToolsOpen(false)
  }, [])

  const composerTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.36, ease: [0.16, 1, 0.3, 1] as const }

  const feedbackTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }

  const inputGradient = isOrganizeMode
    ? 'linear-gradient(90deg, color-mix(in oklab, var(--color-primary) 12%, transparent) 0%, color-mix(in oklab, var(--color-primary) 22%, transparent) 35%, color-mix(in oklab, var(--color-accent) 28%, transparent) 70%, color-mix(in oklab, var(--color-primary) 12%, transparent) 100%)'
    : isListening
      ? 'linear-gradient(90deg, color-mix(in oklab, var(--color-primary) 10%, transparent) 0%, color-mix(in oklab, var(--color-primary) 18%, transparent) 40%, color-mix(in oklab, var(--color-accent) 24%, transparent) 72%, color-mix(in oklab, var(--color-primary) 10%, transparent) 100%)'
      : 'linear-gradient(90deg, color-mix(in oklab, var(--color-primary) 8%, transparent) 0%, color-mix(in oklab, var(--color-primary) 14%, transparent) 35%, color-mix(in oklab, var(--color-accent) 20%, transparent) 68%, color-mix(in oklab, var(--color-primary) 8%, transparent) 100%)'

  return (
    <>
      <motion.div
        className="relative rounded-[1.35rem] border border-transparent bg-card/80 p-2 shadow-xs backdrop-blur-sm"
        animate={shouldReduceMotion ? undefined : {
          borderColor: isOrganizeMode ? 'color-mix(in oklab, var(--color-primary) 28%, transparent)' : 'transparent',
          boxShadow: isOrganizeMode
            ? '0 4px 16px -4px color-mix(in oklab, var(--color-primary) 38%, transparent)'
            : '0 2px 8px -2px color-mix(in oklab, var(--color-foreground) 28%, transparent)',
        }}
        transition={composerTransition}
      >

        <div className="relative flex items-center gap-2">
          {/*
            text-base, not text-sm: a focused input under 16px makes iOS zoom the
            viewport. `coarse:text-lg` used to sit here, but the plain text-sm
            utility won that cascade, so it never applied.
          */}
          <Input
            id="new-item-input"
            value={newItemName}
            onChange={(e) => onNewItemNameChange(e.target.value)}
            onKeyPress={onKeyPress}
            placeholder={isListening ? 'Listening for commands...' : 'Add Grocery'}
            className="flex-1 min-w-0 h-12 border-transparent bg-transparent px-2 text-base md:text-sm font-medium tracking-wide shadow-none focus-visible:border-transparent focus-visible:ring-0 coarse:h-14"
            style={{ background: inputGradient }}
            disabled={isListening}
          />
          <Button
            onClick={handleVoiceClick}
            size="icon"
            variant="ghost"
            className={
              isListening
                ? 'h-11 w-11 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse'
                : 'h-11 w-11 rounded-full text-muted-foreground hover:text-foreground'
            }
            title={isSupported ? (isListening ? 'Stop voice input' : 'Voice input') : 'Voice input is not supported on this browser'}
            aria-label={isListening ? 'Stop listening' : 'Start voice input'}
          >
            <Microphone className={`h-5 w-5 ${isListening ? 'fill' : ''}`} weight={isListening ? 'fill' : 'regular'} />
          </Button>
          <Button
            size="icon"
            variant={isOrganizeMode ? 'secondary' : 'ghost'}
            className="h-11 w-11 rounded-full text-muted-foreground hover:text-foreground"
            title="Open tools"
            aria-label="Open tools"
            disabled={isListening}
            onClick={() => setIsToolsOpen(true)}
          >
            <DotsThree className="h-5 w-5" />
          </Button>
          <Button
            onClick={onAddItem}
            disabled={isListening}
            size="icon"
            className="h-11 w-11 rounded-full bg-primary hover:bg-primary/90"
            title="Add item"
            aria-label="Add item"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>


        {isOrganizeMode && (
          <div className="flex justify-end px-2 pt-1.5">
            <motion.div
              key="organize-mode-badge"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={feedbackTransition}
            >
              <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
                <DotsSixVertical className="h-3.5 w-3.5" />
                Organize mode on
              </Badge>
            </motion.div>
          </div>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {isOrganizeMode && (
          <motion.div
            key="organize-mode-panel"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -6, filter: 'blur(8px)' }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6, filter: 'blur(8px)' }}
            transition={feedbackTransition}
            className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Organize sections</p>
              <p className="text-xs text-muted-foreground">Drag sections into aisle order or rename them, then finish.</p>
            </div>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={onToggleOrganizeMode}>
              <Check className="h-4 w-4" />
              Done
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={isToolsOpen} onOpenChange={setIsToolsOpen}>
        {/* pb keeps the last action row clear of the iPhone home indicator. */}
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-none">
          <SheetHeader className="px-0 pb-4">
            <SheetTitle>Shopping tools</SheetTitle>
            <SheetDescription>Secondary actions stay here so the list can keep focus.</SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Add items</p>
              <div className="grid gap-2">
                <Button variant="outline" className="justify-start h-11" onClick={() => handleToolAction(onRecipeClick)}>
                  <Sparkle className="mr-2 h-4 w-4" />
                  Add from recipe
                </Button>
                <Button variant="outline" className="justify-start h-11" onClick={() => handleToolAction(onScanClick)}>
                  <Camera className="mr-2 h-4 w-4" />
                  Scan with camera
                </Button>
                <Button variant="outline" className="justify-start h-11" onClick={() => handleToolAction(onBulkAddClick)}>
                  <TextAlignLeft className="mr-2 h-4 w-4" />
                  Bulk add text
                </Button>
              </div>
            </div>

            {hasItems && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">List actions</p>
                <div className="grid gap-2">
                  <Button variant="outline" className="justify-start h-11" onClick={() => handleToolAction(onToggleOrganizeMode)}>
                    <DotsSixVertical className="mr-2 h-4 w-4" />
                    {isOrganizeMode ? 'Done organizing' : 'Organize sections'}
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start h-11"
                    onClick={() => handleToolAction(onClearCompleted)}
                    disabled={!hasCheckedItems}
                  >
                    <Plus className="mr-2 h-4 w-4 rotate-45" />
                    Clear completed
                  </Button>
                  <Button variant="outline" className="justify-start h-11" onClick={() => handleToolAction(onReorganize)}>
                    <ArrowsClockwise className="mr-2 h-4 w-4" />
                    Reorganize list
                  </Button>
                  <Button variant="outline" className="justify-start h-11 text-destructive hover:text-destructive" onClick={() => handleToolAction(onClearAll)}>
                    <Trash className="mr-2 h-4 w-4" />
                    Clear all items
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
})
