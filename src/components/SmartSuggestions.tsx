import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, X, Sparkle } from '@phosphor-icons/react'
import type { GroceryItem, ItemRelationship } from '@/lib/types'

interface SmartSuggestionsProps {
  items: GroceryItem[]
  relationships: ItemRelationship[]
  onAddItem: (name: string) => void
  onDismiss: () => void
}

interface Suggestion {
  itemName: string
  strength: number
  reason: string
  relatedItems: string[]
}

export function SmartSuggestions({ items, relationships, onAddItem, onDismiss }: SmartSuggestionsProps) {
  const suggestions = useMemo(() => {
    if (items.length === 0 || relationships.length === 0) return []

    const currentItemNames = new Set(
      items
        .filter(item => !item.isTombstone)
        .map(item => item.name.toLowerCase().trim().replace(/s$/, ''))
    )
    
    const suggestionMap = new Map<string, { strength: number, relatedItems: Set<string> }>()

    for (const item of items.filter(i => !i.isTombstone)) {
      const normalizedItem = item.name.toLowerCase().trim().replace(/s$/, '')
      
      const relatedRels = relationships.filter(rel => 
        rel.item1 === normalizedItem || rel.item2 === normalizedItem
      )

      for (const rel of relatedRels) {
        const suggestedItem = rel.item1 === normalizedItem ? rel.item2 : rel.item1
        
        if (currentItemNames.has(suggestedItem)) continue
        
        if (!suggestionMap.has(suggestedItem)) {
          suggestionMap.set(suggestedItem, { strength: 0, relatedItems: new Set() })
        }
        
        const suggestion = suggestionMap.get(suggestedItem)!
        suggestion.strength += rel.strength
        suggestion.relatedItems.add(item.name)
      }
    }

    const suggestionArray: Suggestion[] = Array.from(suggestionMap.entries())
      .map(([itemName, data]) => ({
        itemName: capitalizeWords(itemName),
        strength: data.strength,
        reason: generateReason(data.relatedItems.size, Array.from(data.relatedItems)),
        relatedItems: Array.from(data.relatedItems)
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)

    return suggestionArray
  }, [items, relationships])

  if (suggestions.length === 0) return null

  const handleAdd = (itemName: string) => {
    onAddItem(itemName)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="p-4 bg-gradient-to-br from-accent/10 to-primary/5 border-accent/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl" />
          
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkle weight="fill" className="h-5 w-5 text-accent" />
                <h3 className="text-base font-bold tracking-tight">Smart Suggestions</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -mr-2"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mb-4">
              Items you often buy together with what's on your list
            </p>

            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <motion.div
                  key={suggestion.itemName}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-background/60 hover:bg-background/90 transition-colors border border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm truncate">
                        {suggestion.itemName}
                      </span>
                      <Badge 
                        variant="secondary" 
                        className="h-5 px-1.5 text-xs font-bold bg-accent/10 text-accent border-accent/20"
                      >
                        {Math.round(suggestion.strength * 100)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {suggestion.reason}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAdd(suggestion.itemName)}
                    className="h-8 px-3 bg-primary hover:bg-primary/90 shrink-0"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}

function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function generateReason(count: number, relatedItems: string[]): string {
  if (count === 1) {
    return `Often bought with ${relatedItems[0]}`
  } else if (count === 2) {
    return `Often bought with ${relatedItems[0]} and ${relatedItems[1]}`
  } else {
    return `Often bought with ${relatedItems[0]} and ${count - 1} other${count > 2 ? 's' : ''}`
  }
}
