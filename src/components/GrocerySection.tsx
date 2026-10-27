import { useState, memo } from 'react'
import { Section, StoreCategory, LearnedBrand } from '@/lib/types'
import { GroceryItemComponent } from './GroceryItemComponent'
import { RenameSectionDialog } from './RenameSectionDialog'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Lightbulb, Sparkle, Pencil, DotsSixVertical, CaretDown, Carrot, Cow, Fish, Egg, Snowflake, Bread, BowlFood, Jar, Wine, Popcorn, Package, Flask, Broom, SprayBottle, Basket } from '@phosphor-icons/react'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion'

interface GrocerySectionProps {
  section: Section
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string, name: string) => void
  onQuantityChange: (id: string, quantity: number) => void
  onCategoryChange: (id: string, category?: StoreCategory) => void
  onRenameSection?: (sectionId: string, newName: string) => void
  showConfidence?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: (sectionId: string) => void
  dragControls?: ReturnType<typeof useDragControls>
  isOrganizeMode?: boolean
  learnedBrands?: LearnedBrand[]
}

function SectionCategoryIcon({ sectionId, label }: { sectionId: string; label: string }) {
  const className = 'h-4.5 w-4.5 text-primary'

  switch (sectionId) {
    case 'produce':
      return <Carrot className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'meat':
      return <Cow className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'seafood':
      return <Fish className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'dairy':
      return <Egg className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'frozen':
      return <Snowflake className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'bakery':
      return <Bread className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'deli':
      return <BowlFood className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'pantry':
      return <Jar className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'beverages':
      return <Wine className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'snacks':
      return <Popcorn className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'canned':
      return <Package className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'condiments':
      return <Flask className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'household':
      return <Broom className={className} weight="duotone" aria-label={`${label} icon`} />
    case 'personal-care':
      return <SprayBottle className={className} weight="duotone" aria-label={`${label} icon`} />
    default:
      return <Basket className={className} weight="duotone" aria-label={`${label} icon`} />
  }
}

export const GrocerySection = memo(function GrocerySection({ 
  section, 
  onToggle, 
  onDelete, 
  onEdit,
  onQuantityChange,
  onCategoryChange,
  onRenameSection,
  showConfidence = true,
  isCollapsed = false,
  onToggleCollapse,
  dragControls,
  isOrganizeMode = false,
  learnedBrands,
}: GrocerySectionProps) {
  const shouldReduceMotion = useReducedMotion()
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  
  const uncheckedCount = section.items.filter(item => !item.checked).length
  const totalCount = section.items.length
  
  const displayName = section.customName || section.name

  const handleRename = (newName: string) => {
    if (onRenameSection) {
      onRenameSection(section.id, newName)
    }
  }

  const cardTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const }
  
  return (
    <>
      <motion.div layout transition={cardTransition}>
      <Card className={`border-border/50 ${section.isLearned ? 'bg-accent/5 border-accent/20' : 'bg-card/50'} group overflow-hidden`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isOrganizeMode && (
            <div
              className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 opacity-70 hover:opacity-100 transition-opacity shrink-0"
              aria-label="Drag to reorder"
              onPointerDown={(e) => dragControls?.start(e)}
            >
              <DotsSixVertical className="h-4 w-4 text-muted-foreground" weight="bold" />
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 hover:bg-muted/50"
            onClick={() => onToggleCollapse?.(section.id)}
            title={isCollapsed ? 'Expand section' : 'Collapse section'}
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            <motion.div
              animate={{ rotate: isCollapsed ? -90 : 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <CaretDown className="h-4 w-4 text-muted-foreground" weight="bold" />
            </motion.div>
          </Button>

          <motion.div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/15"
            animate={shouldReduceMotion ? undefined : {
              scale: isCollapsed ? 0.96 : 1,
              backgroundColor: isCollapsed ? 'color-mix(in oklab, var(--color-primary) 8%, transparent)' : 'color-mix(in oklab, var(--color-primary) 10%, transparent)',
            }}
            transition={cardTransition}
          >
            <SectionCategoryIcon sectionId={section.id} label={displayName} />
          </motion.div>

          <h2 className="flex-1 min-w-0 text-sm font-bold uppercase tracking-wide text-foreground truncate">
            {displayName}
          </h2>

          {section.isLearned && (
            <Badge variant="secondary" className="shrink-0 gap-1 text-xs bg-accent/10 text-accent-foreground border-accent/30 px-1.5 py-0">
              <Sparkle weight="fill" className="h-2.5 w-2.5" />
              Smart
            </Badge>
          )}

          {showConfidence && section.confidence > 0.6 && !section.isLearned && (
            <Lightbulb weight="fill" className="h-3.5 w-3.5 text-accent shrink-0" aria-label={`Confidence: ${Math.round(section.confidence * 100)}%`} />
          )}

          {onRenameSection && isOrganizeMode && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-100 hover:bg-muted transition-opacity"
              onClick={() => setIsRenameDialogOpen(true)}
              title="Rename section"
              aria-label="Rename section"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}

          <Badge variant="secondary" className="shrink-0 text-xs font-medium tabular-nums">
            {uncheckedCount}/{totalCount}
          </Badge>
        </div>
        <Separator className="mt-1.5" />
      </CardHeader>
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0, filter: 'blur(6px)' }}
              animate={shouldReduceMotion ? undefined : { height: 'auto', opacity: 1, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0, filter: 'blur(4px)' }}
              transition={cardTransition}
              style={{ overflow: 'hidden' }}
            >
              <CardContent className="space-y-1.5 pt-0 pb-1.5">
                <AnimatePresence mode="popLayout">
                  {section.items.map(item => (
                    <GroceryItemComponent
                      key={item.id}
                      item={item}
                      onToggle={onToggle}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      onQuantityChange={onQuantityChange}
                      onCategoryChange={onCategoryChange}
                      learnedBrands={learnedBrands}
                    />
                  ))}
                </AnimatePresence>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      </motion.div>

      <RenameSectionDialog
        open={isRenameDialogOpen}
        onClose={() => setIsRenameDialogOpen(false)}
        currentName={displayName}
        onRename={handleRename}
      />
    </>
  )
})
