import { useState, memo } from 'react'
import { GroceryItem } from '@/lib/types'
import type { StoreCategory, LearnedBrand } from '@/lib/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash, PencilSimple, Minus, Plus, DotsThree, ArrowsClockwise } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { RenameItemDialog } from './RenameItemDialog'
import { STORE_CATEGORIES, categorizeItem } from '@/lib/category-mapper'

interface GroceryItemProps {
  item: GroceryItem
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string, name: string) => void
  onQuantityChange: (id: string, quantity: number) => void
  onCategoryChange?: (id: string, category?: StoreCategory) => void
  learnedBrands?: LearnedBrand[]
}

export const GroceryItemComponent = memo(function GroceryItemComponent({ item, onToggle, onDelete, onEdit, onQuantityChange, onCategoryChange, learnedBrands }: GroceryItemProps) {
  const shouldReduceMotion = useReducedMotion()
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isRecategorizeOpen, setIsRecategorizeOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>(item.category ?? 'auto')
  const quantity = item.quantity ?? 1
  const categoryOptions = Object.entries(STORE_CATEGORIES).filter(([value]) => value !== 'other')

  const itemTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }

  const handleIncrement = () => {
    onQuantityChange(item.id, quantity + 1)
  }

  const handleDecrement = () => {
    if (quantity > 1) {
      onQuantityChange(item.id, quantity - 1)
    }
  }

  const openRecategorizeDialog = () => {
    setSelectedCategory(item.category ?? 'auto')
    setIsRecategorizeOpen(true)
  }

  const saveCategoryChange = () => {
    if (!onCategoryChange) return
    onCategoryChange(item.id, selectedCategory === 'auto' ? undefined : (selectedCategory as StoreCategory))
    setIsRecategorizeOpen(false)
  }

  return (
    <>
      <motion.div
        layout
        initial={shouldReduceMotion ? false : { opacity: 0, y: -8, filter: 'blur(8px)' }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)', x: item.checked ? 8 : 0 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.97, filter: 'blur(6px)' }}
        transition={itemTransition}
        className={cn(
          'flex items-start gap-3.5 py-3 px-3.5 sm:px-4 bg-card rounded-lg border border-border',
          'hover:border-primary/30 transition-colors group',
          item.checked && 'opacity-60'
        )}
      >
        <Checkbox
          id={`item-${item.id}`}
          checked={item.checked}
          onCheckedChange={() => onToggle(item.id)}
          className="h-7 w-7 shrink-0 mt-0.5 sm:mt-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <label
                htmlFor={`item-${item.id}`}
                className={cn(
                  'block text-base font-medium tracking-wide cursor-pointer select-none whitespace-normal wrap-break-word leading-snug',
                  item.checked && 'line-through text-muted-foreground'
                )}
              >
                {item.name}
              </label>
              <p className="text-xs text-muted-foreground">
                Quantity <span className="font-semibold tabular-nums">{quantity}</span>
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-foreground shrink-0"
                  title="Item actions"
                  aria-label="Item actions"
                >
                  <DotsThree className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleIncrement}>
                  <Plus className="h-4 w-4" />
                  Increase quantity
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDecrement} disabled={quantity <= 1}>
                  <Minus className="h-4 w-4" />
                  Decrease quantity
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onCategoryChange && (
                  <DropdownMenuItem onSelect={openRecategorizeDialog}>
                    <ArrowsClockwise className="h-4 w-4" />
                    Recategorize
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setIsRenameOpen(true)}>
                  <PencilSimple className="h-4 w-4" />
                  Rename item
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                  <Trash className="h-4 w-4" />
                  Delete item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.div>

      <RenameItemDialog
        open={isRenameOpen}
        onClose={() => setIsRenameOpen(false)}
        currentName={item.name}
        onRename={(newName) => onEdit(item.id, newName)}
      />

      <Dialog open={isRecategorizeOpen} onOpenChange={setIsRecategorizeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recategorize item</DialogTitle>
            <DialogDescription>
              Move {item.name} to a different section or keep it automatic.
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger aria-label="Category" className="w-full">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                <span className="inline-flex items-center gap-2">
                  <span>✨</span>
                  <span>Automatic ({STORE_CATEGORIES[categorizeItem(item.name, learnedBrands)].name})</span>
                </span>
              </SelectItem>
              {categoryOptions.map(([value, info]) => (
                <SelectItem key={value} value={value}>
                  <span className="inline-flex items-center gap-2">
                    <span>{info.icon}</span>
                    <span>{info.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRecategorizeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCategoryChange}>Save category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete item?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{item.name}"? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(item.id)
                setIsDeleteOpen(false)
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})
