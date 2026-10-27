import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash, GraduationCap, Check, X } from '@phosphor-icons/react'
import type { LearnedBrand, StoreCategory } from '@/lib/types'
import { toast } from 'sonner'

const CATEGORIES: { value: StoreCategory; label: string; emoji: string }[] = [
  { value: 'produce', label: 'Produce', emoji: '🥬' },
  { value: 'meat', label: 'Meat', emoji: '🥩' },
  { value: 'seafood', label: 'Seafood', emoji: '🐟' },
  { value: 'dairy', label: 'Dairy', emoji: '🥛' },
  { value: 'frozen', label: 'Frozen', emoji: '❄️' },
  { value: 'bakery', label: 'Bakery', emoji: '🥖' },
  { value: 'deli', label: 'Deli', emoji: '🥪' },
  { value: 'pantry', label: 'Pantry', emoji: '🥫' },
  { value: 'beverages', label: 'Beverages', emoji: '🥤' },
  { value: 'snacks', label: 'Snacks', emoji: '🍿' },
  { value: 'canned', label: 'Canned Goods', emoji: '🥫' },
  { value: 'condiments', label: 'Condiments', emoji: '🍯' },
  { value: 'household', label: 'Household', emoji: '🧼' },
  { value: 'personal-care', label: 'Personal Care', emoji: '🧴' },
  { value: 'other', label: 'Other', emoji: '📦' },
]

interface BrandTrainingDialogProps {
  open: boolean
  onClose: () => void
  learnedBrands: LearnedBrand[]
  onAddBrand: (brand: string, category: StoreCategory) => void
  onDeleteBrand: (brand: string) => boolean
  onUpdateBrand: (brand: string, category: StoreCategory) => void
}

export function BrandTrainingDialog({
  open,
  onClose,
  learnedBrands,
  onAddBrand,
  onDeleteBrand,
  onUpdateBrand
}: BrandTrainingDialogProps) {
  const [newBrand, setNewBrand] = useState('')
  const [newCategory, setNewCategory] = useState<StoreCategory>('snacks')
  const [brandToDelete, setBrandToDelete] = useState<string | null>(null)
  const [editingBrand, setEditingBrand] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState<StoreCategory | null>(null)

  const handleAddBrand = () => {
    if (!newBrand.trim()) {
      toast.error('Please enter a brand name')
      return
    }

    const normalized = newBrand.trim().toLowerCase()
    const existing = learnedBrands.find(b => b.brand.toLowerCase() === normalized)

    if (existing) {
      toast.error('Brand already exists. Edit it instead.')
      return
    }

    onAddBrand(newBrand.trim(), newCategory)
    setNewBrand('')
    toast.success(`Added ${newBrand} to ${CATEGORIES.find(c => c.value === newCategory)?.label}`)
  }

  const handleUpdateBrand = (brand: string) => {
    if (editCategory) {
      onUpdateBrand(brand, editCategory)
      toast.success('Brand category updated')
    }
    setEditingBrand(null)
    setEditCategory(null)
  }

  const handleDeleteBrand = (brand: string) => {
    setBrandToDelete(brand)
  }

  const handleConfirmDeleteBrand = () => {
    if (brandToDelete) {
      const removed = onDeleteBrand(brandToDelete)
      setBrandToDelete(null)
      if (removed) {
        toast.success('Brand removed')
      } else {
        toast.error('Could not remove this brand. Try again.')
      }
    }
  }

  const startEditing = (brand: LearnedBrand) => {
    setEditingBrand(brand.brand)
    setEditCategory(brand.category)
  }

  const cancelEditing = () => {
    setEditingBrand(null)
    setEditCategory(null)
  }

  const sortedBrands = [...learnedBrands].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category)
    }
    return a.brand.localeCompare(b.brand)
  })

  const groupedBrands = sortedBrands.reduce((acc, brand) => {
    if (!acc[brand.category]) {
      acc[brand.category] = []
    }
    acc[brand.category].push(brand)
    return acc
  }, {} as Record<StoreCategory, LearnedBrand[]>)

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-primary/10 text-primary border-primary/20'
    if (confidence >= 0.5) return 'bg-accent/10 text-accent-foreground border-accent/20'
    return 'bg-muted text-muted-foreground border-muted'
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[88dvh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap weight="fill" className="h-6 w-6 text-primary" />
            Brand Training
          </DialogTitle>
          <DialogDescription>
            Teach the app which brands belong to which categories. The app will use this to organize your lists more accurately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-6 pt-4 pb-6 overflow-hidden">
          <Card className="p-4 bg-accent/5 border-accent/20">
            <h3 className="text-sm font-semibold mb-3">Add New Brand</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Label htmlFor="brand-name" className="sr-only">
                  Brand name
                </Label>
                <Input
                  id="brand-name"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddBrand()
                    }
                  }}
                  placeholder="e.g., Oreos, Doritos, Coke"
                  className="h-10"
                />
              </div>
              <div className="w-full sm:w-48">
                <Label htmlFor="brand-category" className="sr-only">
                  Category
                </Label>
                <Select value={newCategory} onValueChange={(value) => setNewCategory(value as StoreCategory)}>
                  <SelectTrigger id="brand-category" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <span className="flex items-center gap-2">
                          <span>{cat.emoji}</span>
                          <span>{cat.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddBrand} className="h-10 px-4 w-full sm:w-auto">
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </Card>

          <div className="min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Learned Brands ({learnedBrands.length})</h3>
              {learnedBrands.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-xs">
                    Auto-learned
                  </Badge>
                  <span>+</span>
                  <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                    Manual
                  </Badge>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0 rounded-lg border bg-card/30">
              <div className="p-4 pb-6 space-y-4">
                {learnedBrands.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <GraduationCap weight="light" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No brands learned yet</p>
                    <p className="text-xs mt-1">Add your first brand above</p>
                  </div>
                ) : (
                  Object.entries(groupedBrands).map(([category, brands]) => {
                    const categoryInfo = CATEGORIES.find(c => c.value === category)
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{categoryInfo?.emoji}</span>
                          <h4 className="text-sm font-semibold text-muted-foreground">
                            {categoryInfo?.label}
                          </h4>
                          <Badge variant="secondary" className="text-xs">
                            {brands.length}
                          </Badge>
                        </div>
                        <div className="space-y-2 ml-8 mb-4">
                          {brands.map(brand => (
                            <div key={brand.brand}>
                              {editingBrand === brand.brand ? (
                                <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-primary bg-primary/5">
                                  <div className="flex-1 min-w-[10rem] font-medium text-sm">
                                    {brand.brand}
                                  </div>
                                  <Select
                                    value={editCategory || brand.category}
                                    onValueChange={(value) => setEditCategory(value as StoreCategory)}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-full sm:w-40">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CATEGORIES.map(cat => (
                                        <SelectItem key={cat.value} value={cat.value}>
                                          <span className="flex items-center gap-2">
                                            <span>{cat.emoji}</span>
                                            <span>{cat.label}</span>
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleUpdateBrand(brand.brand)}
                                  >
                                    <Check className="h-4 w-4 text-primary" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={cancelEditing}
                                  >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-start sm:items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                                    <span className="font-medium text-sm truncate">{brand.brand}</span>
                                    <Badge
                                      variant="secondary"
                                      className={`text-xs ${getConfidenceColor(brand.confidence)}`}
                                    >
                                      {brand.confidence >= 0.8 ? 'High' : brand.confidence >= 0.5 ? 'Medium' : 'Low'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {brand.occurrences}x
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 px-2 text-xs"
                                      onClick={() => startEditing(brand)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                      onClick={() => handleDeleteBrand(brand.brand)}
                                    >
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t bg-background/95 backdrop-blur-sm shrink-0">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={brandToDelete !== null} onOpenChange={(open) => {
      if (!open) setBrandToDelete(null)
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove brand from training?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove "{brandToDelete}" from training data?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDeleteBrand}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
