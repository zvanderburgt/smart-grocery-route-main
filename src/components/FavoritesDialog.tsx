import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { SavedRecipe } from '@/lib/types'
import { Heart, MagnifyingGlass, Trash, Plus, Sparkle } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface FavoritesDialogProps {
  open: boolean
  onClose: () => void
  favorites: SavedRecipe[]
  onSelectFavorite: (recipe: SavedRecipe) => void
  onDeleteFavorite: (id: string) => void
}

export function FavoritesDialog({ 
  open, 
  onClose, 
  favorites, 
  onSelectFavorite,
  onDeleteFavorite 
}: FavoritesDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [recipeToDelete, setRecipeToDelete] = useState<{ id: string; name: string } | null>(null)

  const filteredFavorites = favorites.filter(recipe =>
    recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedFavorites = [...filteredFavorites].sort((a, b) => {
    if (a.useCount !== b.useCount) {
      return b.useCount - a.useCount
    }
    return (b.lastUsed || b.createdAt) - (a.lastUsed || a.createdAt)
  })

  const handleSelect = (recipe: SavedRecipe) => {
    onSelectFavorite(recipe)
    onClose()
  }

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    setRecipeToDelete({ id, name })
  }

  const handleConfirmDeleteRecipe = () => {
    if (recipeToDelete) {
      onDeleteFavorite(recipeToDelete.id)
      setRecipeToDelete(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart weight="fill" className="h-5 w-5 text-accent" />
            Recipe Favorites
          </DialogTitle>
          <DialogDescription>
            Quick access to your frequently used recipes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search favorites..."
              className="pl-9"
            />
          </div>

          <ScrollArea className="flex-1 -mx-6 px-6">
            {sortedFavorites.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                {searchQuery ? (
                  <>
                    <div className="text-4xl">🔍</div>
                    <p className="text-sm text-muted-foreground">
                      No recipes match "{searchQuery}"
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-4xl">⭐</div>
                    <p className="text-sm text-muted-foreground">
                      No favorite recipes yet
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Save recipes as favorites when adding them to quickly access them later
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                <AnimatePresence mode="popLayout">
                  {sortedFavorites.map((recipe) => (
                    <motion.div
                      key={recipe.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="group relative border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-accent/20 transition-all cursor-pointer"
                      onClick={() => handleSelect(recipe)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-base truncate">
                              {recipe.name}
                            </h3>
                            {recipe.url && (
                              <Sparkle weight="fill" className="h-3.5 w-3.5 text-accent shrink-0" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {recipe.ingredients.length} ingredients
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {recipe.servings} servings
                            </Badge>
                            {recipe.useCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                Used {recipe.useCount}x
                              </Badge>
                            )}
                          </div>

                          {recipe.url && (
                            <p className="text-xs text-muted-foreground mt-2 truncate">
                              {recipe.url}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                            onClick={(e) => handleDelete(e, recipe.id, recipe.name)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={recipeToDelete !== null} onOpenChange={(open) => {
      if (!open) setRecipeToDelete(null)
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove recipe from favorites?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove "{recipeToDelete?.name}" from favorites?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDeleteRecipe}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
