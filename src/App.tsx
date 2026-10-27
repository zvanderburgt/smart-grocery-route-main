import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { usePWAState } from '@/hooks/use-pwa-state'
import { useSections } from '@/hooks/use-sections'
import { useGoogleSheetsSync } from '@/hooks/use-google-sheets-sync'
import type { GroceryItem, ItemRelationship, ShoppingTrip, Section, SavedRecipe, LearnedBrand, StoreCategory } from '@/lib/types'
import { GroceryLearningAlgorithm } from '@/lib/learning-algorithm'
import { BrandLearningSystem } from '@/lib/brand-learning'
import { parseItemWithQuantity, toTitleCase, sanitizeInput, normalizeItemKey } from '@/lib/utils'
import { prepareItemForMutation, createNewItemWithSync, createTombstone } from '@/lib/item-mutations'
import { GrocerySection } from '@/components/GrocerySection'
import { StatsCard } from '@/components/StatsCard'
import { SmartSuggestions } from '@/components/SmartSuggestions'
import { AppHeader } from '@/components/AppHeader'
import { ItemInputBar } from '@/components/ItemInputBar'

// Lazy-loaded dialogs — excluded from the initial JS bundle
const UnifiedScanDialog = lazy(() => import('@/components/UnifiedScanDialog').then(m => ({ default: m.UnifiedScanDialog })))
const RecipeDialog = lazy(() => import('@/components/RecipeDialog').then(m => ({ default: m.RecipeDialog })))
const FavoritesDialog = lazy(() => import('@/components/FavoritesDialog').then(m => ({ default: m.FavoritesDialog })))
const LearningTipDialog = lazy(() => import('@/components/LearningTipDialog').then(m => ({ default: m.LearningTipDialog })))
const BrandTrainingDialog = lazy(() => import('@/components/BrandTrainingDialog').then(m => ({ default: m.BrandTrainingDialog })))
const StatsView = lazy(() => import('@/components/StatsView').then(m => ({ default: m.StatsView })))
const DiagnosticsPanel = lazy(() => import('@/components/DiagnosticsPanel').then(m => ({ default: m.DiagnosticsPanel })))
const InstallBanner = lazy(() => import('@/components/InstallBanner').then(m => ({ default: m.InstallBanner })))
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { categorizeItem, STORE_CATEGORIES } from '@/lib/category-mapper'
import { Plus, Camera, Trash, ArrowsClockwise, Lightbulb, ChartBar, Sparkle, Heart, Microphone, GraduationCap, GearSix, DeviceMobile, WifiHigh, CloudArrowDown, DotsThree } from '@phosphor-icons/react'
import { toast, Toaster } from 'sonner'
import { motion, AnimatePresence, Reorder, useDragControls, useReducedMotion } from 'framer-motion'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { useVoiceCommands } from '@/hooks/use-voice-commands'
import { usePWAInstall } from '@/hooks/use-pwa-install'

const SectionItem = memo(function SectionItem({ 
  section, 
  onToggle, 
  onDelete, 
  onEdit, 
  onQuantityChange, 
  onCategoryChange,
  onRenameSection, 
  showConfidence, 
  isCollapsed, 
  onToggleCollapse,
  isOrganizeMode,
  learnedBrands,
}: {
  section: Section
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string, name: string) => void
  onQuantityChange: (id: string, quantity: number) => void
  onCategoryChange: (id: string, category?: StoreCategory) => void
  onRenameSection: (sectionId: string, newName: string) => void
  showConfidence: boolean
  isCollapsed: boolean
  onToggleCollapse: (sectionId: string) => void
  isOrganizeMode: boolean
  learnedBrands: LearnedBrand[]
}) {
  const controls = useDragControls()
  
  return (
    <Reorder.Item
      key={section.id}
      value={section}
      className="list-none"
      dragListener={false}
      dragControls={controls}
    >
      <GrocerySection
        section={section}
        onToggle={onToggle}
        onDelete={onDelete}
        onEdit={onEdit}
        onQuantityChange={onQuantityChange}
        onCategoryChange={onCategoryChange}
        onRenameSection={onRenameSection}
        showConfidence={showConfidence}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        dragControls={controls}
        isOrganizeMode={isOrganizeMode}
        learnedBrands={learnedBrands}
      />
    </Reorder.Item>
  )
})

function App() {
  const shouldReduceMotion = useReducedMotion()
  const [items, setItems] = useLocalStorage<GroceryItem[]>('grocery-items', [])
  const [relationships, setRelationships] = useLocalStorage<ItemRelationship[]>('item-relationships', [])
  const [trips, setTrips] = useLocalStorage<ShoppingTrip[]>('shopping-trips', [])
  const [sectionCustomNames, setSectionCustomNames] = useLocalStorage<Record<string, string>>('section-custom-names', {})
  const [sectionOrder, setSectionOrder] = useLocalStorage<string[]>('section-order', [])
  const [collapsedSections, setCollapsedSections] = useLocalStorage<Record<string, boolean>>('collapsed-sections', {})
  const [favorites, setFavorites] = useLocalStorage<SavedRecipe[]>('recipe-favorites', [])
  const [learnedBrands, setLearnedBrands] = useLocalStorage<LearnedBrand[]>('learned-brands', [])
  const [itemCategoryHints, setItemCategoryHints] = useLocalStorage<Record<string, StoreCategory>>('item-category-hints', {})
  
  const [newItemName, setNewItemName] = useState('')
  const [isOtherCategoryDialogOpen, setIsOtherCategoryDialogOpen] = useState(false)
  const [otherCategoryDialogStep, setOtherCategoryDialogStep] = useState<'brand-check' | 'brand-mapping' | 'category-mapping'>('brand-check')
  const [pendingOtherItem, setPendingOtherItem] = useState<{ name: string; quantity: number } | null>(null)
  const [pendingBrandName, setPendingBrandName] = useState('')
  const [pendingMappedCategory, setPendingMappedCategory] = useState<StoreCategory>('pantry')
  const [isScanOpen, setIsScanOpen] = useState(false)
  const [isBulkTextOpen, setIsBulkTextOpen] = useState(false)
  const [bulkAddText, setBulkAddText] = useState('')
  const [isRecipeOpen, setIsRecipeOpen] = useState(false)
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false)
  const [isBrandTrainingOpen, setIsBrandTrainingOpen] = useState(false)
  const [showLearningTip, setShowLearningTip] = useLocalStorage<boolean>('show-learning-tip', true)
  const [showStats, setShowStats] = useState(false)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const pwaInstall = usePWAInstall()
  const [sections, setSections] = useState<Section[]>([])
  const [isOrganizing, setIsOrganizing] = useState(false)
  const [isOrganizeMode, setIsOrganizeMode] = useState(false)
  const [filteredSection, setFilteredSection] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useLocalStorage<boolean>('show-suggestions', true)
  const [showConfidenceIndicators, setShowConfidenceIndicators] = useLocalStorage<boolean>('show-confidence-indicators', true)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showLearningProgressNearSearch, setShowLearningProgressNearSearch] = useState(false)
  const [isSearchSectionVisible, setIsSearchSectionVisible] = useState(true)
  const searchSectionRef = useRef<HTMLDivElement | null>(null)
  const { isOnline, serviceWorkerReady, pwaStatusLabel } = usePWAState()

  const safeItems = useMemo(() => (items ?? []).filter(item => !item.isTombstone), [items])
  const safeRelationships = useMemo(() => relationships ?? [], [relationships])
  const safeTrips = useMemo(() => trips ?? [], [trips])
  const safeCustomNames = useMemo(() => sectionCustomNames ?? {}, [sectionCustomNames])
  const safeSectionOrder = useMemo(() => sectionOrder ?? [], [sectionOrder])
  const safeLearnedBrands = useMemo(() => learnedBrands ?? [], [learnedBrands])
  const safeItemCategoryHints = useMemo(() => itemCategoryHints ?? {}, [itemCategoryHints])

  // Google Sheets sync - needs raw items with tombstones for proper deletion sync
  const googleSheetsSync = useGoogleSheetsSync({
    localItems: items ?? [],
    onItemsChange: setItems,
    autoSync: true, // Periodic pull/push while the tab is visible (see hook for visibility gating)
    syncInterval: 60000,
  })

  const { syncState } = googleSheetsSync
  
  const algorithm = useMemo(() => {
    return new GroceryLearningAlgorithm(safeRelationships, safeTrips)
  }, [safeRelationships, safeTrips])

  const brandLearning = useMemo(() => {
    return new BrandLearningSystem(safeLearnedBrands)
  }, [safeLearnedBrands])

  // The user's exact-name correction beats everything; categorizeItem then
  // applies learned brands, modifiers, brands and keywords in that order.
  const inferCategory = (name: string): StoreCategory =>
    safeItemCategoryHints[normalizeItemKey(name)] ?? categorizeItem(name, safeLearnedBrands)

  useEffect(() => {
    const organizeSections = async () => {
      setIsOrganizing(true)
      const organized = await algorithm.organizeList(safeItems, safeLearnedBrands, safeItemCategoryHints)
      const sectionsWithCustomNames = organized.map(section => ({
        ...section,
        customName: safeCustomNames[section.id]
      }))
      
      if (safeSectionOrder.length > 0) {
        const orderedSections = [...sectionsWithCustomNames].sort((a, b) => {
          const aIndex = safeSectionOrder.indexOf(a.id)
          const bIndex = safeSectionOrder.indexOf(b.id)
          if (aIndex === -1 && bIndex === -1) return 0
          if (aIndex === -1) return 1
          if (bIndex === -1) return -1
          return aIndex - bIndex
        })
        setSections(orderedSections)
      } else {
        setSections(sectionsWithCustomNames)
        if (sectionsWithCustomNames.length > 0) {
          setSectionOrder(sectionsWithCustomNames.map(s => s.id))
        }
      }

      sectionsWithCustomNames.forEach(section => {
        const sectionCategory = section.id.startsWith('learned-section-') 
          ? 'other' 
          : section.id
        
        if (sectionCategory !== 'other') {
          brandLearning.learnFromPattern(section.items, sectionCategory as any)
        }
      })
      
      setIsOrganizing(false)
    }
    
    organizeSections()
  }, [algorithm, safeItems, safeLearnedBrands, safeItemCategoryHints, safeCustomNames, safeSectionOrder, brandLearning])
  
  const progress = useMemo(() => {
    if (safeItems.length === 0) return 0
    const checkedCount = safeItems.filter(item => item.checked).length
    return Math.round((checkedCount / safeItems.length) * 100)
  }, [safeItems])

  const unresolvedItems = useMemo(() => safeItems.filter(item => !item.checked).length, [safeItems])

  const hasLearningData = safeTrips.length >= 1
  const hasSufficientDataForSuggestions = safeRelationships.length >= 3 && safeItems.length > 0
  const categoryOptions = useMemo(
    () =>
      Object.entries(STORE_CATEGORIES)
        .filter(([category]) => category !== 'other')
        .map(([category, info]) => ({
          value: category as StoreCategory,
          label: info.name,
          icon: info.icon,
        })),
    []
  )

  useEffect(() => {
    const target = searchSectionRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSearchSectionVisible(entry.isIntersecting)
      },
      { threshold: 0.1 }
    )

    observer.observe(target)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (showLearningProgressNearSearch && !isSearchSectionVisible) {
      setShowLearningProgressNearSearch(false)
    }
  }, [showLearningProgressNearSearch, isSearchSectionVisible])



  useEffect(() => {
    const checkedItems = safeItems.filter(item => item.checked)
    if (checkedItems.length >= 2) {
      const lastChecked = Math.max(...checkedItems.map(item => item.checkedAt || 0))
      const timeSinceLastCheck = Date.now() - lastChecked
      
      if (timeSinceLastCheck > 300000 && checkedItems.length === safeItems.length) {
        recordTripAndClear()
      }
    }
  }, [safeItems])

  const resetOtherCategoryDialog = () => {
    setIsOtherCategoryDialogOpen(false)
    setOtherCategoryDialogStep('brand-check')
    setPendingOtherItem(null)
    setPendingBrandName('')
    setPendingMappedCategory('pantry')
  }

  const addParsedItemToList = (name: string, quantity: number, category?: StoreCategory) => {
    const safeName = sanitizeInput(name)
    if (!safeName) return
    const userId = googleSheetsSync.userEmail || 'local'
    const newItem = createNewItemWithSync(
      {
        name: toTitleCase(safeName),
        checked: false,
        quantity,
        ...(category ? { category } : {}),
      },
      userId
    )

    setItems(currentItems => [...(currentItems ?? []), newItem])
    if (quantity > 1) {
      toast.success(`Added ${quantity} ${name}`)
    } else {
      toast.success(`Added ${name}`)
    }
  }

  const openOtherCategoryDialog = (name: string, quantity: number) => {
    const firstWord = name.trim().split(/\s+/)[0] || name
    setPendingOtherItem({ name, quantity })
    setPendingBrandName(firstWord)
    setPendingMappedCategory('pantry')
    setOtherCategoryDialogStep('brand-check')
    setIsOtherCategoryDialogOpen(true)
  }

  const addPendingOtherItem = (category?: StoreCategory) => {
    if (!pendingOtherItem) return
    addParsedItemToList(pendingOtherItem.name, pendingOtherItem.quantity, category)
    resetOtherCategoryDialog()
  }

  const handleSaveBrandMapping = () => {
    if (!pendingOtherItem) return

    const brand = pendingBrandName.trim()
    if (!brand) {
      toast.error('Please enter a brand name')
      return
    }

    handleAddBrand(brand, pendingMappedCategory)
    addParsedItemToList(pendingOtherItem.name, pendingOtherItem.quantity, pendingMappedCategory)
    toast.success(`Mapped ${brand} to ${STORE_CATEGORIES[pendingMappedCategory].name}`)
    resetOtherCategoryDialog()
  }

  const handleSaveCategoryMapping = () => {
    if (!pendingOtherItem) return
    const itemName = pendingOtherItem.name
    addParsedItemToList(itemName, pendingOtherItem.quantity, pendingMappedCategory)
    toast.success(`Mapped ${itemName} to ${STORE_CATEGORIES[pendingMappedCategory].name}`)
    resetOtherCategoryDialog()
  }

  const addItem = (name: string) => {
    if (!name.trim()) return

    const parsed = parseItemWithQuantity(sanitizeInput(name))
    const existingItem = safeItems.find(i => i.name.toLowerCase() === parsed.name.toLowerCase())

    if (existingItem) {
      const userId = googleSheetsSync.userEmail || 'local'
      setItems(currentItems =>
        (currentItems ?? []).map(i =>
          i.id === existingItem.id
            ? prepareItemForMutation(i, userId, { quantity: (i.quantity ?? 1) + parsed.quantity })
            : i
        )
      )
      toast.success(`Updated ${parsed.name} (${(existingItem.quantity ?? 1) + parsed.quantity} total)`)
    } else {
      const category = inferCategory(parsed.name)

      if (category === 'other') {
        openOtherCategoryDialog(parsed.name, parsed.quantity)
      } else {
        addParsedItemToList(parsed.name, parsed.quantity, category)
      }
    }

    setNewItemName('')
  }

  const handleAddItem = () => {
    if (newItemName.trim()) {
      addItem(newItemName)
    } else {
      setIsScanOpen(true)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddItem()
    }
  }

  const collapseSectionIfComplete = (sectionId: string | undefined, sectionItemIds: Set<string>, nextItems: GroceryItem[]) => {
    if (!sectionId || sectionItemIds.size === 0) return

    const sectionItems = nextItems.filter(item => sectionItemIds.has(item.id))
    const isSectionComplete =
      sectionItems.length === sectionItemIds.size && sectionItems.every(item => item.checked)

    if (isSectionComplete) {
      setCollapsedSections(current => ({
        ...(current ?? {}),
        [sectionId]: true
      }))
    }
  }

  const toggleItem = useCallback((id: string) => {
    const containingSection = sections.find(section => section.items.some(item => item.id === id))
    const sectionItemIds = new Set(containingSection?.items.map(item => item.id) ?? [])
    const userId = googleSheetsSync.userEmail || 'local'

    setItems(currentItems =>
      {
        const baseItems = currentItems ?? []
        const targetItem = baseItems.find(item => item.id === id)
        const toggledToChecked = Boolean(targetItem && !targetItem.checked)
        const now = Date.now()
        const nextItems = baseItems.map(item =>
          item.id === id
            ? prepareItemForMutation(item, userId, {
                checked: !item.checked,
                checkedAt: !item.checked ? now : undefined,
              })
            : item
        )

        if (toggledToChecked) {
          collapseSectionIfComplete(containingSection?.id, sectionItemIds, nextItems)
        }

        return nextItems
      }
    )
  }, [sections, collapseSectionIfComplete, setItems, googleSheetsSync.userEmail])

  const deleteItem = useCallback((id: string) => {
    // Create tombstone for sync instead of just filtering
    googleSheetsSync.createDeletionTombstone(id);
    toast.success('Item removed');
  }, [setItems, googleSheetsSync.createDeletionTombstone])

  const editItem = useCallback((id: string, newName: string) => {
    const safeName = sanitizeInput(newName)
    if (!safeName) return
    const userId = googleSheetsSync.userEmail || 'local'
    setItems(currentItems =>
      (currentItems ?? []).map(item =>
        item.id === id
          ? prepareItemForMutation(item, userId, { name: toTitleCase(safeName) })
          : item
      )
    )
    toast.success('Item updated')
  }, [setItems, googleSheetsSync.userEmail])

  const handleQuantityChange = useCallback((id: string, quantity: number) => {
    const userId = googleSheetsSync.userEmail || 'local'
    setItems(currentItems =>
      (currentItems ?? []).map(item =>
        item.id === id ? prepareItemForMutation(item, userId, { quantity }) : item
      )
    )
  }, [setItems, googleSheetsSync.userEmail])

  const handleCategoryChange = useCallback((id: string, category?: StoreCategory) => {
    const currentItem = safeItems.find(item => item.id === id)
    const oldCategory = currentItem?.category
    const userId = googleSheetsSync.userEmail || 'local'

    setItems(currentItems =>
      (currentItems ?? []).map(item =>
        item.id === id
          ? prepareItemForMutation(item, userId, {
              ...(category ? { category } : { category: undefined }),
            })
          : item
      )
    )

    if (currentItem) {
      const itemKey = normalizeItemKey(currentItem.name)
      setItemCategoryHints(currentHints => {
        const nextHints = { ...(currentHints ?? {}) }
        if (category) {
          nextHints[itemKey] = category
        } else {
          delete nextHints[itemKey]
        }
        return nextHints
      })

      // Learn from manual correction - this creates a high-confidence brand association
      if (category && category !== oldCategory) {
        brandLearning.learnManualCorrection(currentItem.name, category, oldCategory as StoreCategory | undefined)
        setLearnedBrands([...brandLearning.exportData()])
      }
    }

    toast.success('Item category updated')
  }, [safeItems, setItems, setItemCategoryHints, setLearnedBrands, brandLearning, googleSheetsSync.userEmail])

  const handleIncreaseQuantity = (itemName: string, amount: number) => {
    const normalizedQuery = itemName.toLowerCase().trim()
    const userId = googleSheetsSync.userEmail || 'local'

    const matchingItem = safeItems.find(item =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(item.name.toLowerCase())
    )

    if (matchingItem) {
      const newQuantity = (matchingItem.quantity ?? 1) + amount
      setItems(currentItems =>
        (currentItems ?? []).map(item =>
          item.id === matchingItem.id
            ? prepareItemForMutation(item, userId, { quantity: newQuantity })
            : item
        )
      )
      toast.success(`Increased ${matchingItem.name} to ${newQuantity}`)
    } else {
      toast.error(`Item "${itemName}" not found`)
    }
  }

  const handleDecreaseQuantity = (itemName: string, amount: number) => {
    const normalizedQuery = itemName.toLowerCase().trim()
    const userId = googleSheetsSync.userEmail || 'local'

    const matchingItem = safeItems.find(item =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(item.name.toLowerCase())
    )

    if (matchingItem) {
      const currentQty = matchingItem.quantity ?? 1
      const newQuantity = Math.max(1, currentQty - amount)

      setItems(currentItems =>
        (currentItems ?? []).map(item =>
          item.id === matchingItem.id
            ? prepareItemForMutation(item, userId, { quantity: newQuantity })
            : item
        )
      )

      if (newQuantity === 1 && currentQty - amount < 1) {
        toast.success(`${matchingItem.name} quantity is now 1 (minimum)`)
      } else {
        toast.success(`Decreased ${matchingItem.name} to ${newQuantity}`)
      }
    } else {
      toast.error(`Item "${itemName}" not found`)
    }
  }

  const handleSetQuantity = (itemName: string, amount: number) => {
    const normalizedQuery = itemName.toLowerCase().trim()
    const userId = googleSheetsSync.userEmail || 'local'

    const matchingItem = safeItems.find(item =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(item.name.toLowerCase())
    )

    if (matchingItem) {
      setItems(currentItems =>
        (currentItems ?? []).map(item =>
          item.id === matchingItem.id
            ? prepareItemForMutation(item, userId, { quantity: amount })
            : item
        )
      )
      toast.success(`Set ${matchingItem.name} to ${amount}`)
    } else {
      toast.error(`Item "${itemName}" not found`)
    }
  }

  const handleOCRItems = (extractedItems: Array<{ name: string; quantity: number }>) => {
    const userId = googleSheetsSync.userEmail || 'local'
    extractedItems.forEach(item => {
      const existingItem = safeItems.find(i => i.name.toLowerCase() === item.name.toLowerCase())

      if (existingItem) {
        setItems(currentItems =>
          (currentItems ?? []).map(i =>
            i.id === existingItem.id
              ? prepareItemForMutation(i, userId, { quantity: (i.quantity ?? 1) + item.quantity })
              : i
          )
        )
        toast.success(`Updated ${item.name} (${(existingItem.quantity ?? 1) + item.quantity} total)`)
      } else {
        const finalCategory = inferCategory(item.name)

        const newItem = createNewItemWithSync(
          {
            name: toTitleCase(item.name),
            checked: false,
            quantity: item.quantity,
            ...(finalCategory ? { category: finalCategory } : {}),
          },
          userId
        )
        setItems(currentItems => [...(currentItems ?? []), newItem])
      }
    })
  }

  const parseBulkLine = (text: string): { name: string; quantity: number } => {
    const cleaned = text
      .trim()
      .replace(/^(?:[-*+•]\s+|\d+[.)]\s+)/, '')
      .trim()

    if (!cleaned) {
      return { name: '', quantity: 1 }
    }

    const patterns = [
      /^(\d+)\s*x\s+(.+)$/i,
      /^(.+?)\s+x\s*(\d+)$/i,
      /^(\d+)\s+(?:boxes?|bags?|cans?|bottles?|jars?|packages?|packs?|containers?|items?)\s+(?:of\s+)?(.+)$/i,
      /^(\d+)\s+(.+)$/,
    ]

    for (const pattern of patterns) {
      const match = cleaned.match(pattern)
      if (!match) continue

      if (pattern.source.startsWith('^(\\d+)')) {
        return { name: match[2].trim(), quantity: parseInt(match[1], 10) }
      }

      return { name: match[1].trim(), quantity: parseInt(match[2], 10) }
    }

    return { name: cleaned, quantity: 1 }
  }

  const handleBulkAddSubmit = () => {
    const rawItems = bulkAddText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    if (rawItems.length === 0) {
      toast.error('No items to add')
      return
    }

    const consolidatedItems = rawItems
      .map(parseBulkLine)
      .filter(item => item.name.length > 0)
      .reduce((acc, item) => {
        const existing = acc.find(i => i.name.toLowerCase() === item.name.toLowerCase())
        if (existing) {
          existing.quantity += item.quantity
        } else {
          acc.push({ ...item })
        }
        return acc
      }, [] as Array<{ name: string; quantity: number }>)

    if (consolidatedItems.length === 0) {
      toast.error('No valid items to add')
      return
    }

    handleOCRItems(consolidatedItems)
    setBulkAddText('')
    setIsBulkTextOpen(false)
    toast.success(`Added ${consolidatedItems.length} items`)
  }

  const handleRecipeItems = (
    ingredients: Array<{ name: string; quantity: number; unit?: string }>,
    saveOptions?: { save: boolean; name: string; url?: string; servings: number }
  ) => {
    const userId = googleSheetsSync.userEmail || 'local'
    ingredients.forEach(ingredient => {
      const displayName = ingredient.unit
        ? `${ingredient.name} (${ingredient.quantity} ${ingredient.unit})`
        : ingredient.name

      const existingItem = safeItems.find(i => i.name.toLowerCase() === ingredient.name.toLowerCase())

      if (existingItem) {
        setItems(currentItems =>
          (currentItems ?? []).map(i =>
            i.id === existingItem.id
              ? prepareItemForMutation(i, userId, { quantity: (i.quantity ?? 1) + ingredient.quantity })
              : i
          )
        )
      } else {
        const newItem = createNewItemWithSync(
          {
            name: toTitleCase(ingredient.name),
            checked: false,
            quantity: ingredient.quantity
          },
          userId
        )
        setItems(currentItems => [...(currentItems ?? []), newItem])
      }
    })

    if (saveOptions?.save) {
      const newFavorite: SavedRecipe = {
        id: `fav-${Date.now()}-${Math.random()}`,
        name: saveOptions.name,
        servings: saveOptions.servings,
        url: saveOptions.url,
        ingredients: ingredients,
        createdAt: Date.now(),
        useCount: 0
      }
      setFavorites(currentFavorites => [...(currentFavorites ?? []), newFavorite])
      toast.success(`Saved "${saveOptions.name}" to favorites!`)
    }
  }

  const handleSelectFavorite = (recipe: SavedRecipe) => {
    const userId = googleSheetsSync.userEmail || 'local'
    recipe.ingredients.forEach(ingredient => {
      const existingItem = safeItems.find(i => i.name.toLowerCase() === ingredient.name.toLowerCase())

      if (existingItem) {
        setItems(currentItems =>
          (currentItems ?? []).map(i =>
            i.id === existingItem.id
              ? prepareItemForMutation(i, userId, { quantity: (i.quantity ?? 1) + ingredient.quantity })
              : i
          )
        )
      } else {
        const newItem = createNewItemWithSync(
          {
            name: toTitleCase(ingredient.name),
            checked: false,
            quantity: ingredient.quantity
          },
          userId
        )
        setItems(currentItems => [...(currentItems ?? []), newItem])
      }
    })

    setFavorites(currentFavorites =>
      (currentFavorites ?? []).map(fav =>
        fav.id === recipe.id
          ? { ...fav, useCount: fav.useCount + 1, lastUsed: Date.now() }
          : fav
      )
    )
  }

  const handleDeleteFavorite = (id: string) => {
    setFavorites(currentFavorites =>
      (currentFavorites ?? []).filter(fav => fav.id !== id)
    )
  }

  const handleAddBrand = (brand: string, category: StoreCategory) => {
    brandLearning.addManualBrand(brand, category)
    const brandData = brandLearning.exportData()
    setLearnedBrands(brandData)
  }

  const handleUpdateBrand = (brand: string, category: StoreCategory) => {
    brandLearning.updateBrandCategory(brand, category)
    const brandData = brandLearning.exportData()
    setLearnedBrands(brandData)
  }

  const handleDeleteBrand = (brand: string): boolean => {
    const removed = brandLearning.deleteBrand(brand)
    const brandData = brandLearning.exportData()
    setLearnedBrands(brandData)
    return removed
  }

  const clearCompleted = () => {
    const completedItems = safeItems.filter(item => item.checked)
    
    if (completedItems.length === 0) {
      toast.error('No completed items to clear')
      return
    }

    if (completedItems.length >= 2) {
      algorithm.recordCheckoff(safeItems)
      const data = algorithm.exportData()
      setRelationships(data.relationships)
      setTrips(data.trips)

      const brandData = brandLearning.exportData()
      setLearnedBrands(brandData)
      
      const tripCount = data.trips.length
      const brandStats = brandLearning.getBrandStats()
      
      if (tripCount === 1) {
        toast.success('🎉 First trip recorded! One more trip and I\'ll start learning your store layout.')
      } else if (tripCount === 2) {
        toast.success('🧠 Learning activated! Your lists will now organize by store layout.')
      } else {
        const messages = [`✨ Trip ${tripCount} recorded! Getting smarter with each trip.`]
        if (brandStats.highConfidence > 0) {
          messages.push(`Learned ${brandStats.highConfidence} brand patterns`)
        }
        toast.success(messages.join(' • '))
      }
    }

    // Bulk clear: wipe these rows off the sheet right away instead of leaving
    // them as lingering tombstone rows (see deleteItemsPermanently for the trade-off).
    googleSheetsSync.deleteItemsPermanently(completedItems.map(item => item.id));
    
    if (completedItems.length < 2) {
      toast.success(`Cleared ${completedItems.length} items`)
    }
  }

  const recordTripAndClear = () => {
    const completedItems = safeItems.filter(item => item.checked)
    
    if (completedItems.length >= 2) {
      algorithm.recordCheckoff(safeItems)
      const data = algorithm.exportData()
      setRelationships(data.relationships)
      setTrips(data.trips)
    }
  }

  const clearAll = () => {
    if (safeItems.length === 0) return
    setShowClearConfirm(true)
  }

  const clearLearningData = () => {
    setRelationships([])
    setTrips([])
    setLearnedBrands([])
    toast.success('Learning data cleared')
  }

  const handleConfirmClear = () => {
    // Bulk clear: wipe every row off the sheet right away instead of leaving
    // them as lingering tombstone rows (see deleteItemsPermanently for the trade-off).
    googleSheetsSync.deleteItemsPermanently(safeItems.map(item => item.id));
    setShowClearConfirm(false)
    toast.success('List cleared')
  }

  const reorganizeList = () => {
    toast.success('List reorganized!')
  }

  const handleRenameSection = (sectionId: string, newName: string) => {
    setSectionCustomNames(currentNames => ({
      ...(currentNames ?? {}),
      [sectionId]: newName
    }))
    toast.success('Section renamed!')
  }

  const handleReorderSections = (newSections: Section[]) => {
    setSections(newSections)
    setSectionOrder(newSections.map(s => s.id))
  }

  const handleToggleCollapse = (sectionId: string) => {
    setCollapsedSections(current => ({
      ...(current ?? {}),
      [sectionId]: !(current?.[sectionId] ?? false)
    }))
  }

  const handleShowSection = (sectionName: string) => {
    const normalizedQuery = sectionName.toLowerCase().trim()
    
    const matchingSection = sections.find(section => {
      const sectionDisplayName = (section.customName || section.name).toLowerCase()
      return sectionDisplayName.includes(normalizedQuery) || normalizedQuery.includes(sectionDisplayName)
    })

    if (matchingSection) {
      setFilteredSection(matchingSection.id)
      const displayName = matchingSection.customName || matchingSection.name
      toast.success(`Showing ${displayName} section`)
    } else {
      toast.error(`Section "${sectionName}" not found`)
    }
  }

  const handleCheckItemByName = (itemName: string) => {
    const normalizedQuery = itemName.toLowerCase().trim()
    const userId = googleSheetsSync.userEmail || 'local'

    const matchingItem = safeItems.find(item =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(item.name.toLowerCase())
    )

    if (matchingItem) {
      if (matchingItem.checked) {
        toast.info(`${matchingItem.name} is already checked`)
      } else {
        const containingSection = sections.find(section => section.items.some(item => item.id === matchingItem.id))
        const sectionItemIds = new Set(containingSection?.items.map(item => item.id) ?? [])

        setItems(currentItems =>
          {
            const nextItems = (currentItems ?? []).map(item =>
              item.id === matchingItem.id
                ? prepareItemForMutation(item, userId, { checked: true, checkedAt: Date.now() })
                : item
            )

            collapseSectionIfComplete(containingSection?.id, sectionItemIds, nextItems)
            return nextItems
          }
        )
        toast.success(`Checked off ${matchingItem.name}`)
      }
    } else {
      toast.error(`Item "${itemName}" not found`)
    }
  }

  const handleUncheckItemByName = (itemName: string) => {
    const normalizedQuery = itemName.toLowerCase().trim()
    const userId = googleSheetsSync.userEmail || 'local'

    const matchingItem = safeItems.find(item =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(item.name.toLowerCase())
    )

    if (matchingItem) {
      if (!matchingItem.checked) {
        toast.info(`${matchingItem.name} is not checked`)
      } else {
        setItems(currentItems =>
          (currentItems ?? []).map(item =>
            item.id === matchingItem.id
              ? prepareItemForMutation(item, userId, { checked: false, checkedAt: undefined })
              : item
          )
        )
        toast.success(`Unchecked ${matchingItem.name}`)
      }
    } else {
      toast.error(`Item "${itemName}" not found`)
    }
  }

  const { handleTranscript } = useVoiceCommands({
    onCommand: (command) => {
      switch (command.type) {
        case 'add_item':
          addItem(command.text)
          break
        case 'check_item':
          handleCheckItemByName(command.itemName)
          break
        case 'uncheck_item':
          handleUncheckItemByName(command.itemName)
          break
        case 'increase_quantity':
          handleIncreaseQuantity(command.itemName, command.amount)
          break
        case 'decrease_quantity':
          handleDecreaseQuantity(command.itemName, command.amount)
          break
        case 'set_quantity':
          handleSetQuantity(command.itemName, command.amount)
          break
        case 'clear_completed':
          clearCompleted()
          toast.success('Voice command: Clear completed')
          break
        case 'clear_all':
          clearAll()
          break
        case 'show_section':
          handleShowSection(command.section)
          break
        case 'show_all':
          setFilteredSection(null)
          toast.success('Showing all sections')
          break
        case 'reorganize':
          reorganizeList()
          break
        case 'show_stats':
          setShowStats(true)
          toast.success('Voice command: Show stats')
          break
        case 'show_favorites':
          setIsFavoritesOpen(true)
          toast.success('Voice command: Show favorites')
          break
        default:
          break
      }
    }
  })
  
  const { isListening, isSupported, toggleListening } = useVoiceInput({
    continuous: true,
    onResult: (transcript) => {
      if (transcript.trim()) {
        handleTranscript(transcript.trim())
      }
    },
    onError: (error) => {
      toast.error(error)
    }
  })

  const handleVoiceButtonClick = () => {
    if (!isSupported) {
      toast.info('Voice input is unavailable in this browser or installed app. Try opening in Chrome/Safari, or use your keyboard dictation.')
      return
    }

    toggleListening()
  }

  const visibleSections = useMemo(() => {
    if (!filteredSection) return sections
    return sections.filter(section => section.id === filteredSection)
  }, [sections, filteredSection])

  const shellTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const }

  const feedbackTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }

  return showStats ? (
    <div className="min-h-dvh bg-background">
      <Toaster position="top-center" />
      <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading…</div>}>
        <StatsView onBack={() => setShowStats(false)} />
      </Suspense>
    </div>
  ) : (
    <>
      <div className="bg-background pb-0">
      <Toaster position="top-center" />
      
      {pwaInstall.canInstall && (
        <Suspense fallback={null}>
          <InstallBanner {...pwaInstall} />
        </Suspense>
      )}

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -10, filter: 'blur(10px)' }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={shellTransition}
      >
        <AppHeader
          isOnline={isOnline}
          serviceWorkerReady={serviceWorkerReady}
          pwaStatusLabel={pwaStatusLabel}
          onSettingsClick={() => setIsDiagnosticsOpen(true)}
          pwaInstall={pwaInstall}
          totalItems={safeItems.length}
          unresolvedItems={unresolvedItems}
          progress={progress}
          canToggleLearningProgress={safeTrips.length > 0}
          learningProgressVisible={showLearningProgressNearSearch}
          onToggleLearningProgress={() => setShowLearningProgressNearSearch(current => !current)}
          googleSheetsSyncStatus={syncState?.status}
          googleSheetsLastSync={syncState?.lastSyncAt}
        />
      </motion.div>

      <div className="w-full mx-auto px-4 sm:px-5 py-1 coarse:py-0 space-y-1 coarse:space-y-0.5">
        <motion.div
          ref={searchSectionRef}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(12px)' }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={shellTransition}
        >
          <ItemInputBar
            newItemName={newItemName}
            onNewItemNameChange={setNewItemName}
            onAddItem={handleAddItem}
            onKeyPress={handleKeyPress}
            isListening={isListening}
            isSupported={isSupported}
            onVoiceToggle={toggleListening}
            onRecipeClick={() => setIsRecipeOpen(true)}
            onScanClick={() => setIsScanOpen(true)}
            onBulkAddClick={() => setIsBulkTextOpen(true)}
            onClearCompleted={clearCompleted}
            onReorganize={reorganizeList}
            onClearAll={clearAll}
            onToggleOrganizeMode={() => setIsOrganizeMode(current => !current)}
            hasCheckedItems={safeItems.filter(item => item.checked).length > 0}
            hasItems={safeItems.length > 0}
            isOrganizeMode={isOrganizeMode}
          />

          <AnimatePresence initial={false}>
            {showLearningProgressNearSearch && isSearchSectionVisible && (
              <motion.div
                key="floating-learning-progress"
                initial={shouldReduceMotion ? false : { opacity: 0, y: -8, filter: 'blur(8px)' }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6, filter: 'blur(6px)' }}
                transition={feedbackTransition}
                className="pt-1"
              >
                <StatsCard
                  tripCount={safeTrips.length}
                  itemsLearned={safeRelationships.length}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence initial={false}>
          {filteredSection && (
            <motion.div
              key="filtered-section-banner"
              initial={shouldReduceMotion ? false : { opacity: 0, y: -8, filter: 'blur(8px)' }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8, filter: 'blur(8px)' }}
              transition={feedbackTransition}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent bg-accent/10 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-accent text-accent-foreground">
                  Filtered View
                </Badge>
                <span className="text-sm font-medium text-muted-foreground">
                  Showing {visibleSections.length} of {sections.length} sections
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilteredSection(null)
                  toast.success('Showing all sections')
                }}
                className="text-xs"
              >
                Clear Filter
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      <div className="w-full mx-auto px-4 sm:px-5 pt-0 pb-3 coarse:pb-2 space-y-1 coarse:space-y-0.5">
        <AnimatePresence mode="wait" initial={false}>
          {safeItems.length === 0 ? (
            <motion.div
              key="empty-state"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.985, filter: 'blur(12px)' }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -12, scale: 0.985, filter: 'blur(8px)' }}
              transition={shellTransition}
              className="text-center py-12 coarse:py-6 space-y-3 coarse:space-y-2"
            >
              <motion.div
                initial={shouldReduceMotion ? false : { scale: 0.92, rotate: -6 }}
                animate={shouldReduceMotion ? undefined : { scale: 1, rotate: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
                className="text-6xl coarse:text-5xl"
              >
                🛒
              </motion.div>
              <h2 className="text-lg coarse:text-base font-semibold text-foreground">Your list is empty</h2>
              <p className="text-sm coarse:text-xs text-muted-foreground max-w-sm mx-auto">
                Add items manually, use voice input, or use the camera to scan a list. The app will learn your store layout as you shop!
              </p>
              <Button
                variant="outline"
                onClick={() => setShowLearningTip(true)}
                className="mx-auto gap-2"
              >
                <Lightbulb weight="fill" className="h-4 w-4" />
                How does learning work?
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="list-state"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, filter: 'blur(10px)' }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -10, filter: 'blur(8px)' }}
              transition={shellTransition}
              className="space-y-1 coarse:space-y-0.5"
            >
              {hasSufficientDataForSuggestions && showSuggestions && (
                <SmartSuggestions
                  items={safeItems}
                  relationships={safeRelationships}
                  onAddItem={addItem}
                  onDismiss={() => setShowSuggestions(false)}
                />
              )}
              
              <Reorder.Group
                axis="y"
                values={visibleSections}
                onReorder={handleReorderSections}
                className="space-y-1 coarse:space-y-0.5"
              >
                {visibleSections.map(section => (
                  <SectionItem
                    key={section.id}
                    section={section}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                    onEdit={editItem}
                    onQuantityChange={handleQuantityChange}
                    onCategoryChange={handleCategoryChange}
                    onRenameSection={handleRenameSection}
                    showConfidence={hasLearningData && (showConfidenceIndicators ?? true)}
                    isCollapsed={collapsedSections?.[section.id] ?? false}
                    onToggleCollapse={handleToggleCollapse}
                    isOrganizeMode={isOrganizeMode}
                    learnedBrands={safeLearnedBrands}
                  />
                ))}
              </Reorder.Group>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Suspense fallback={null}>
        <UnifiedScanDialog
          open={isScanOpen}
          onClose={() => setIsScanOpen(false)}
          onProductScanned={addItem}
          onItemsExtracted={handleOCRItems}
          learnedBrands={safeLearnedBrands}
        />

        <RecipeDialog
          open={isRecipeOpen}
          onClose={() => setIsRecipeOpen(false)}
          onRecipeParsed={handleRecipeItems}
        />

        <FavoritesDialog
          open={isFavoritesOpen}
          onClose={() => setIsFavoritesOpen(false)}
          favorites={favorites ?? []}
          onSelectFavorite={handleSelectFavorite}
          onDeleteFavorite={handleDeleteFavorite}
        />

        <BrandTrainingDialog
          open={isBrandTrainingOpen}
          onClose={() => setIsBrandTrainingOpen(false)}
          learnedBrands={learnedBrands ?? []}
          onAddBrand={handleAddBrand}
          onDeleteBrand={handleDeleteBrand}
          onUpdateBrand={handleUpdateBrand}
        />

        <LearningTipDialog
          open={showLearningTip ?? false}
          onClose={() => setShowLearningTip(false)}
        />

        <DiagnosticsPanel
          open={isDiagnosticsOpen}
          onClose={() => setIsDiagnosticsOpen(false)}
          showSuggestions={showSuggestions ?? true}
          onToggleSuggestions={setShowSuggestions}
          showConfidenceIndicators={showConfidenceIndicators ?? true}
          onToggleConfidenceIndicators={setShowConfidenceIndicators}
          hasLearningData={safeTrips.length > 0 || safeRelationships.length > 0 || safeLearnedBrands.length > 0}
          onClearLearningData={clearLearningData}
          favoriteCount={(favorites ?? []).length}
          onOpenFavorites={() => setIsFavoritesOpen(true)}
          learnedBrandCount={(learnedBrands ?? []).length}
          onOpenBrandTraining={() => setIsBrandTrainingOpen(true)}
          onOpenStats={() => setShowStats(true)}
          onOpenLearningTip={() => setShowLearningTip(true)}
          // Google Sheets sync props
          sheetId={googleSheetsSync.config?.sheetId ?? ''}
          setSheetId={(id) => googleSheetsSync.setConfig({ sheetId: id })}
          syncState={googleSheetsSync.syncState}
          onConnect={googleSheetsSync.connect}
          onDisconnect={googleSheetsSync.disconnect}
          onSyncNow={googleSheetsSync.syncNow}
          userEmail={googleSheetsSync.userEmail}
          lastSyncTime={googleSheetsSync.lastSyncTime}
        />
      </Suspense>

      <Dialog
        open={isBulkTextOpen}
        onOpenChange={(open) => {
          setIsBulkTextOpen(open)
          if (!open) {
            setBulkAddText('')
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Add Items</DialogTitle>
            <DialogDescription>
              Paste or type one item per line. Quantities like "2 milk", "milk x3", and "3 cans of beans" are supported.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea
              value={bulkAddText}
              onChange={(e) => setBulkAddText(e.target.value)}
              placeholder="milk&#10;bread x2&#10;3 apples"
              className="min-h-52 font-medium"
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsBulkTextOpen(false)
                  setBulkAddText('')
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleBulkAddSubmit}>Add Items</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOtherCategoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetOtherCategoryDialog()
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Help categorize this item</DialogTitle>
            <DialogDescription>
              {pendingOtherItem
                ? `"${pendingOtherItem.name}" is about to go into Other.`
                : 'This item is about to go into Other.'}
            </DialogDescription>
          </DialogHeader>

          {otherCategoryDialogStep === 'brand-check' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Is this a brand item?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button onClick={() => setOtherCategoryDialogStep('brand-mapping')}>
                  Yes, it is a brand
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setOtherCategoryDialogStep('category-mapping')}
                >
                  No, choose category
                </Button>
              </div>
            </div>
          )}

          {otherCategoryDialogStep === 'brand-mapping' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brand-mapping-name">Brand name</Label>
                <Input
                  id="brand-mapping-name"
                  value={pendingBrandName}
                  onChange={(e) => setPendingBrandName(e.target.value)}
                  placeholder="e.g., Oreos"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-mapping-category">Map brand to category</Label>
                <Select
                  value={pendingMappedCategory}
                  onValueChange={(value) => setPendingMappedCategory(value as StoreCategory)}
                >
                  <SelectTrigger id="brand-mapping-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        <span className="flex items-center gap-2">
                          <span>{category.icon}</span>
                          <span>{category.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOtherCategoryDialogStep('brand-check')}>
                  Back
                </Button>
                <Button onClick={handleSaveBrandMapping}>
                  Save brand mapping
                </Button>
              </DialogFooter>
            </div>
          )}

          {otherCategoryDialogStep === 'category-mapping' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="item-category">Which category should this item go in?</Label>
                <Select
                  value={pendingMappedCategory}
                  onValueChange={(value) => setPendingMappedCategory(value as StoreCategory)}
                >
                  <SelectTrigger id="item-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        <span className="flex items-center gap-2">
                          <span>{category.icon}</span>
                          <span>{category.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOtherCategoryDialogStep('brand-check')}>
                  Back
                </Button>
                <Button onClick={handleSaveCategoryMapping}>
                  Save category
                </Button>
              </DialogFooter>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => addPendingOtherItem()}>
              Keep in Other
            </Button>
            <Button variant="ghost" onClick={resetOtherCategoryDialog}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will not save learning data from uncompleted items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClear}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default App
