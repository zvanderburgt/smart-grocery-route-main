# Sync Metadata Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing sync metadata (updatedAt, updatedBy, versionVector) in all grocery item mutation paths to ensure proper Google Sheets synchronization and conflict detection.

**Architecture:** The app uses a local-first approach with Google Sheets sync via version vectors for concurrent edit detection. All item mutations must set `updatedAt`, `updatedBy`, and `versionVector` to enable incremental sync and conflict resolution. Currently, only some handlers in App.tsx set these fields.

**Tech Stack:** React, TypeScript, Vite, Google Sheets API, localStorage, framer-motion, sonner (toasts)

## Global Constraints

- All item mutations must set: `updatedAt: number`, `updatedBy: string`, `versionVector: Record<string, number>`
- `updatedBy` should use `googleSheetsSync.userEmail || 'local'`
- `versionVector` should be initialized as `{ [userId]: 1 }` where userId = `googleSheetsSync.userEmail || 'local'`
- Tombstones must be created via `googleSheetsSync.createDeletionTombstone(id)` for deletions
- The `useGoogleSheetsSync` hook watches `localItems` and triggers sync automatically via useEffect
- Do NOT modify `use-google-sheets-sync.ts` or `sync-engine.ts` - only fix the callers in `App.tsx` and `use-grocery-items.ts`

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/App.tsx` | Main component with all item mutation handlers |
| `src/hooks/use-grocery-items.ts` | Hook with duplicate/unused mutation functions |
| `src/hooks/use-google-sheets-sync.ts` | Sync hook (read-only for this plan) |
| `src/lib/sync-engine.ts` | Sync utilities (read-only for this plan) |
| `src/lib/types.ts` | Type definitions (read-only for this plan) |

---

## Task 1: Fix addParsedItemToList to Set Sync Metadata

**Files:**
- Modify: `src/App.tsx:272-290`

**Interfaces:**
- Consumes: `googleSheetsSync.userEmail` from hook
- Produces: Items with `updatedAt`, `updatedBy`, `versionVector` fields

- [ ] **Step 1: Write the failing test**

```typescript
// Test: addParsedItemToList creates item with sync metadata
// File: src/App.test.tsx (or similar test location)
import { renderHook, act } from '@testing-library/react';
import { App } from './App';

test('addParsedItemToList sets updatedAt, updatedBy, versionVector', () => {
  // Setup would mock googleSheetsSync.userEmail
  const { result } = renderHook(() => useApp());
  act(() => {
    result.current.addParsedItemToList('Apples', 2, 'produce');
  });
  const items = result.current.items;
  expect(items[0].updatedAt).toBeDefined();
  expect(items[0].updatedBy).toBeDefined();
  expect(items[0].versionVector).toBeDefined();
  expect(items[0].versionVector).toEqual({ 'test@user.com': 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "addParsedItemToList"`
Expected: FAIL - items missing sync fields

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, modify `addParsedItemToList` (lines 272-290):

```typescript
const addParsedItemToList = (name: string, quantity: number, category?: StoreCategory) => {
  const safeName = sanitizeInput(name);
  if (!safeName) return;
  
  const userId = googleSheetsSync.userEmail || 'local';
  const now = Date.now();
  
  const newItem: GroceryItem = {
    id: `item-${now}-${Math.random()}`,
    name: toTitleCase(safeName),
    checked: false,
    addedAt: now,
    quantity,
    ...(category ? { category } : {}),
    // ADD THESE THREE FIELDS:
    updatedAt: now,
    updatedBy: userId,
    versionVector: { [userId]: 1 },
  };

  setItems(currentItems => [...(currentItems ?? []), newItem]);
  if (quantity > 1) {
    toast.success(`Added ${quantity} ${name}`);
  } else {
    toast.success(`Added ${name}`);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx -t "addParsedItemToList"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: add sync metadata to addParsedItemToList"
```

---

## Task 2: Fix handleOCRItems to Set Sync Metadata on New Items

**Files:**
- Modify: `src/App.tsx:561-592`

**Interfaces:**
- Consumes: `googleSheetsSync.userEmail`, `safeItems`, `safeLearnedBrands`, `safeItemCategoryHints`
- Produces: New items with sync metadata; existing items updated with sync metadata

- [ ] **Step 1: Write the failing test**

```typescript
test('handleOCRItems sets sync metadata on new items', () => {
  const { result } = renderHook(() => useApp());
  act(() => {
    result.current.handleOCRItems([{ name: 'Milk', quantity: 1 }]);
  });
  const items = result.current.items;
  expect(items[0].updatedAt).toBeDefined();
  expect(items[0].updatedBy).toBeDefined();
  expect(items[0].versionVector).toBeDefined();
});

test('handleOCRItems updates sync metadata on existing items', () => {
  // First add an item
  // Then call handleOCRItems with same name
  // Verify updatedAt, updatedBy, versionVector are updated
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "handleOCRItems"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, modify `handleOCRItems` (lines 561-592):

```typescript
const handleOCRItems = (extractedItems: Array<{ name: string; quantity: number }>) => {
  const userId = googleSheetsSync.userEmail || 'local';
  const now = Date.now();
  
  extractedItems.forEach(item => {
    const existingItem = safeItems.find(i => i.name.toLowerCase() === item.name.toLowerCase());
    
    if (existingItem) {
      setItems(currentItems =>
        (currentItems ?? []).map(i =>
          i.id === existingItem.id
            ? { 
                ...i, 
                quantity: (i.quantity ?? 1) + item.quantity,
                // ADD SYNC METADATA:
                updatedAt: now,
                updatedBy: userId,
                versionVector: incrementVersionVector(i, userId).versionVector,
              }
            : i
        )
      );
      toast.success(`Updated ${item.name} (${(existingItem.quantity ?? 1) + item.quantity} total)`);
    } else {
      // Categorize the item using learned brands and hints
      const learnedCategory = brandLearning.getCategoryForItem(item.name);
      const inferredCategory = learnedCategory ?? categorizeItem(item.name, safeLearnedBrands);
      const hintedCategory = safeItemCategoryHints[normalizeItemKey(item.name)];
      const finalCategory = inferredCategory === 'other' ? hintedCategory ?? inferredCategory : inferredCategory;

      const newItem: GroceryItem = {
        id: `item-${now}-${Math.random()}`,
        name: toTitleCase(item.name),
        checked: false,
        addedAt: now,
        quantity: item.quantity,
        ...(finalCategory ? { category: finalCategory } : {}),
        // ADD SYNC METADATA:
        updatedAt: now,
        updatedBy: userId,
        versionVector: { [userId]: 1 },
      };
      setItems(currentItems => [...(currentItems ?? []), newItem]);
    }
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx -t "handleOCRItems"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: add sync metadata to handleOCRItems"
```

---

## Task 3: Fix handleRecipeItems to Set Sync Metadata

**Files:**
- Modify: `src/App.tsx:660-704`

**Interfaces:**
- Consumes: `googleSheetsSync.userEmail`, `safeItems`
- Produces: New/updated items with sync metadata

- [ ] **Step 1: Write the failing test**

```typescript
test('handleRecipeItems sets sync metadata on new items', () => {
  const { result } = renderHook(() => useApp());
  act(() => {
    result.current.handleRecipeItems([{ name: 'Flour', quantity: 2, unit: 'cups' }]);
  });
  const items = result.current.items;
  expect(items[0].updatedAt).toBeDefined();
  expect(items[0].updatedBy).toBeDefined();
  expect(items[0].versionVector).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "handleRecipeItems"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, modify `handleRecipeItems` (lines 660-704):

```typescript
const handleRecipeItems = (
  ingredients: Array<{ name: string; quantity: number; unit?: string }>,
  saveOptions?: { save: boolean; name: string; url?: string; servings: number }
) => {
  const userId = googleSheetsSync.userEmail || 'local';
  const now = Date.now();
  
  ingredients.forEach(ingredient => {
    const displayName = ingredient.unit 
      ? `${ingredient.name} (${ingredient.quantity} ${ingredient.unit})`
      : ingredient.name;
    
    const existingItem = safeItems.find(i => i.name.toLowerCase() === ingredient.name.toLowerCase());
    
    if (existingItem) {
      setItems(currentItems =>
        (currentItems ?? []).map(i =>
          i.id === existingItem.id
            ? { 
                ...i, 
                quantity: (i.quantity ?? 1) + ingredient.quantity,
                // ADD SYNC METADATA:
                updatedAt: now,
                updatedBy: userId,
                versionVector: incrementVersionVector(i, userId).versionVector,
              }
            : i
        )
      );
    } else {
      const newItem: GroceryItem = {
        id: `item-${now}-${Math.random()}`,
        name: toTitleCase(ingredient.name),
        checked: false,
        addedAt: now,
        quantity: ingredient.quantity,
        // ADD SYNC METADATA:
        updatedAt: now,
        updatedBy: userId,
        versionVector: { [userId]: 1 },
      };
      setItems(currentItems => [...(currentItems ?? []), newItem]);
    }
  });

  if (saveOptions?.save) {
    // ... existing save logic unchanged
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx -t "handleRecipeItems"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: add sync metadata to handleRecipeItems"
```

---

## Task 4: Fix handleSelectFavorite to Set Sync Metadata

**Files:**
- Modify: `src/App.tsx:706-737`

**Interfaces:**
- Consumes: `googleSheetsSync.userEmail`, `safeItems`, `favorites`
- Produces: New/updated items with sync metadata; updated favorite with useCount

- [ ] **Step 1: Write the failing test**

```typescript
test('handleSelectFavorite sets sync metadata on new items', () => {
  const { result } = renderHook(() => useApp());
  // Setup favorite with ingredients
  act(() => {
    result.current.handleSelectFavorite(mockFavorite);
  });
  const items = result.current.items;
  expect(items[0].updatedAt).toBeDefined();
  expect(items[0].updatedBy).toBeDefined();
  expect(items[0].versionVector).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "handleSelectFavorite"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, modify `handleSelectFavorite` (lines 706-737):

```typescript
const handleSelectFavorite = (recipe: SavedRecipe) => {
  const userId = googleSheetsSync.userEmail || 'local';
  const now = Date.now();
  
  recipe.ingredients.forEach(ingredient => {
    const existingItem = safeItems.find(i => i.name.toLowerCase() === ingredient.name.toLowerCase());
    
    if (existingItem) {
      setItems(currentItems =>
        (currentItems ?? []).map(i =>
          i.id === existingItem.id
            ? { 
                ...i, 
                quantity: (i.quantity ?? 1) + ingredient.quantity,
                // ADD SYNC METADATA:
                updatedAt: now,
                updatedBy: userId,
                versionVector: incrementVersionVector(i, userId).versionVector,
              }
            : i
        )
      );
    } else {
      const newItem: GroceryItem = {
        id: `item-${now}-${Math.random()}`,
        name: toTitleCase(ingredient.name),
        checked: false,
        addedAt: now,
        quantity: ingredient.quantity,
        // ADD SYNC METADATA:
        updatedAt: now,
        updatedBy: userId,
        versionVector: { [userId]: 1 },
      };
      setItems(currentItems => [...(currentItems ?? []), newItem]);
    }
  });

  setFavorites(currentFavorites =>
    (currentFavorites ?? []).map(fav =>
      fav.id === recipe.id
        ? { ...fav, useCount: fav.useCount + 1, lastUsed: Date.now() }
        : fav
    )
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx -t "handleSelectFavorite"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: add sync metadata to handleSelectFavorite"
```

---

## Task 5: Fix Voice Quantity Handlers to Set Sync Metadata

**Files:**
- Modify: `src/App.tsx:486-559` (three functions)

**Interfaces:**
- Consumes: `googleSheetsSync.userEmail`, `safeItems`
- Produces: Updated items with sync metadata

- [ ] **Step 1: Write the failing test**

```typescript
test('handleIncreaseQuantity sets sync metadata', () => {
  const { result } = renderHook(() => useApp());
  // Add item first
  act(() => {
    result.current.handleIncreaseQuantity('Apples', 1);
  });
  const items = result.current.items;
  expect(items[0].updatedAt).toBeDefined();
  expect(items[0].updatedBy).toBeDefined();
  // versionVector should be incremented
});

test('handleDecreaseQuantity sets sync metadata', () => { /* similar */ });
test('handleSetQuantity sets sync metadata', () => { /* similar */ });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "Quantity"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, modify all three functions:

```typescript
// handleIncreaseQuantity (lines 486-507)
const handleIncreaseQuantity = (itemName: string, amount: number) => {
  const userId = googleSheetsSync.userEmail || 'local';
  const now = Date.now();
  
  const normalizedQuery = itemName.toLowerCase().trim();
  const matchingItem = safeItems.find(item => 
    item.name.toLowerCase().includes(normalizedQuery) || 
    normalizedQuery.includes(item.name.toLowerCase())
  );

  if (matchingItem) {
    const newQuantity = (matchingItem.quantity ?? 1) + amount;
    setItems(currentItems =>
      (currentItems ?? []).map(item =>
        item.id === matchingItem.id
          ? { 
              ...item, 
              quantity: newQuantity,
              // ADD SYNC METADATA:
              updatedAt: now,
              updatedBy: userId,
              versionVector: incrementVersionVector(item, userId).versionVector,
            }
          : item
      )
    );
    toast.success(`Increased ${matchingItem.name} to ${newQuantity}`);
  } else {
    toast.error(`Item "${itemName}" not found`);
  }
};

// handleDecreaseQuantity (lines 509-537) - similar changes
const handleDecreaseQuantity = (itemName: string, amount: number) => {
  const userId = googleSheetsSync.userEmail || 'local';
  const now = Date.now();
  
  const normalizedQuery = itemName.toLowerCase().trim();
  const matchingItem = safeItems.find(item => 
    item.name.toLowerCase().includes(normalizedQuery) || 
    normalizedQuery.includes(item.name.toLowerCase())
  );

  if (matchingItem) {
    const currentQty = matchingItem.quantity ?? 1;
    const newQuantity = Math.max(1, currentQty - amount);
    
    setItems(currentItems =>
      (currentItems ?? []).map(item =>
        item.id === matchingItem.id
          ? { 
              ...item, 
              quantity: newQuantity,
              // ADD SYNC METADATA:
              updatedAt: now,
              updatedBy: userId,
              versionVector: incrementVersionVector(item, userId).versionVector,
            }
          : item
      )
    );
    
    if (newQuantity === 1 && currentQty - amount < 1) {
      toast.success(`${matchingItem.name} quantity is now 1 (minimum)`);
    } else {
      toast.success(`Decreased ${matchingItem.name} to ${newQuantity}`);
    }
  } else {
    toast.error(`Item "${itemName}" not found`);
  }
};

// handleSetQuantity (lines 539-559) - similar changes
const handleSetQuantity = (itemName: string, amount: number) => {
  const userId = googleSheetsSync.userEmail || 'local';
  const now = Date.now();
  
  const normalizedQuery = itemName.toLowerCase().trim();
  const matchingItem = safeItems.find(item => 
    item.name.toLowerCase().includes(normalizedQuery) || 
    normalizedQuery.includes(item.name.toLowerCase())
  );

  if (matchingItem) {
    setItems(currentItems =>
      (currentItems ?? []).map(item =>
        item.id === matchingItem.id
          ? { 
              ...item, 
              quantity: amount,
              // ADD SYNC METADATA:
              updatedAt: now,
              updatedBy: userId,
              versionVector: incrementVersionVector(item, userId).versionVector,
            }
          : item
      )
    );
    toast.success(`Set ${matchingItem.name} to ${amount}`);
  } else {
    toast.error(`Item "${itemName}" not found`);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx -t "Quantity"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: add sync metadata to voice quantity handlers"
```

---

## Task 6: Fix clearCompleted to Use Tombstones

**Files:**
- Modify: `src/App.tsx:764-802`

**Interfaces:**
- Consumes: `googleSheetsSync.createDeletionTombstone`, `safeItems`, `algorithm`, `brandLearning`
- Produces: Tombstones for each checked item via createDeletionTombstone, then filters

- [ ] **Step 1: Write the failing test**

```typescript
test('clearCompleted creates tombstones for checked items', () => {
  const { result } = renderHook(() => useApp());
  // Add items, check some
  act(() => {
    result.current.clearCompleted();
  });
  // Verify createDeletionTombstone was called for each checked item
  // Verify remaining items don't include checked ones
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "clearCompleted"`
Expected: FAIL - createDeletionTombstone not called

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, modify `clearCompleted` (lines 764-802):

```typescript
const clearCompleted = () => {
  const completedItems = safeItems.filter(item => item.checked);
  
  if (completedItems.length === 0) {
    toast.error('No completed items to clear');
    return;
  }

  if (completedItems.length >= 2) {
    algorithm.recordCheckoff(safeItems);
    const data = algorithm.exportData();
    setRelationships(data.relationships);
    setTrips(data.trips);

    const brandData = brandLearning.exportData();
    setLearnedBrands(brandData);
    
    const tripCount = data.trips.length;
    const brandStats = brandLearning.getBrandStats();
    
    if (tripCount === 1) {
      toast.success('🎉 First trip recorded! One more trip and I\'ll start learning your store layout.');
    } else if (tripCount === 2) {
      toast.success('🧠 Learning activated! Your lists will now organize by store layout.');
    } else {
      const messages = [`✨ Trip ${tripCount} recorded! Getting smarter with each trip.`];
      if (brandStats.highConfidence > 0) {
        messages.push(`Learned ${brandStats.highConfidence} brand patterns`);
      }
      toast.success(messages.join(' • '));
    }
  }

  // CREATE TOMBSTONES FOR EACH CHECKED ITEM BEFORE FILTERING
  completedItems.forEach(item => {
    googleSheetsSync.createDeletionTombstone(item.id);
  });
  
  // The tombstones are added via onItemsChange in createDeletionTombstone
  // Then we filter them out locally (they'll be synced as tombstones)
  setItems(currentItems => (currentItems ?? []).filter(item => !item.checked));
  
  if (completedItems.length < 2) {
    toast.success(`Cleared ${completedItems.length} items`);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx -t "clearCompleted"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: clearCompleted uses tombstones for sync"
```

---

## Task 7: Fix clearAll to Use Tombstones

**Files:**
- Modify: `src/App.tsx:815-831`

**Interfaces:**
- Consumes: `googleSheetsSync.createDeletionTombstone`, `safeItems`
- Produces: Tombstones for all items, then empty array

- [ ] **Step 1: Write the failing test**

```typescript
test('clearAll creates tombstones for all items', () => {
  const { result } = renderHook(() => useApp());
  // Add items
  act(() => {
    result.current.handleConfirmClear(); // Called after clearAll shows confirm
  });
  // Verify createDeletionTombstone called for each item
  // Verify items array is empty
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "clearAll"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, modify `clearAll` (line 815) and `handleConfirmClear` (line 827):

```typescript
const clearAll = () => {
  if (safeItems.length === 0) return;
  setShowClearConfirm(true);
};

const handleConfirmClear = () => {
  // CREATE TOMBSTONES FOR ALL ITEMS
  safeItems.forEach(item => {
    googleSheetsSync.createDeletionTombstone(item.id);
  });
  
  setItems([]);
  setShowClearConfirm(false);
  toast.success('List cleared');
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx -t "clearAll"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: clearAll uses tombstones for sync"
```

---

## Task 8: Fix useGroceryItems Hook - Add Sync Metadata to addItem and addItemsToList

**Files:**
- Modify: `src/hooks/use-grocery-items.ts:126-199`

**Interfaces:**
- Consumes: No googleSheetsSync access (hook doesn't have it) - will need to accept userId parameter or use a default
- Produces: Items with sync metadata

**Note:** This hook doesn't have access to `googleSheetsSync.userEmail`. We'll need to either:
1. Pass `userId` as a parameter to the hook, or
2. Use a default `'local'` userId

Since the hook is currently not the primary path (App.tsx handlers are used), we'll add a `userId` parameter with default `'local'`.

- [ ] **Step 1: Write the failing test**

```typescript
test('useGroceryItems.addItem sets sync metadata', () => {
  const { result } = renderHook(() => useGroceryItems(..., ..., ..., ..., 'test@user.com'));
  act(() => {
    result.current.addItem('Apples', 'produce');
  });
  expect(result.current.safeItems[0].updatedAt).toBeDefined();
  expect(result.current.safeItems[0].updatedBy).toBe('test@user.com');
  expect(result.current.safeItems[0].versionVector).toEqual({ 'test@user.com': 1 });
});

test('useGroceryItems.addItemsToList sets sync metadata', () => {
  // similar
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/use-grocery-items.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/use-grocery-items.ts`:

1. Add `userId` parameter to hook (line 34):
```typescript
export function useGroceryItems(
  sections: any[],
  collapseSectionIfComplete: (
    sectionId: string,
    sectionItemIds: Set<string>,
    items: GroceryItem[],
  ) => void,
  brandLearning: any,
  safeItemCategoryHints: Record<string, StoreCategory>,
  userId: string = 'local',  // ADD THIS PARAMETER
): UseGroceryItemsReturn {
```

2. Modify `addItem` (lines 126-146):
```typescript
const addItem = useCallback(
  (name: string, category?: StoreCategory) => {
    if (!name.trim()) return;

    const { name: parsedName, quantity } = parseItemWithQuantity(name);
    const titleCaseName = toTitleCase(parsedName);
    const now = Date.now();

    const newItem: GroceryItem = {
      id: `item-${now}-${Math.random()}`,
      name: titleCaseName,
      checked: false,
      addedAt: now,
      ...(quantity && { quantity }),
      ...(category && { category }),
      // ADD SYNC METADATA:
      updatedAt: now,
      updatedBy: userId,
      versionVector: { [userId]: 1 },
    };

    setItems((currentItems) => [...(currentItems ?? []), newItem]);
    toast.success(`Added ${titleCaseName}`);
  },
  [setItems, userId],  // ADD userId DEPENDENCY
);
```

3. Modify `addItemsToList` (lines 150-199):
```typescript
const addItemsToList = useCallback(
  (
    itemsToAdd: Array<{
      name: string;
      quantity?: number;
      category?: StoreCategory;
    }>,
  ) => {
    if (itemsToAdd.length === 0) return;
    const now = Date.now();

    setItems((currentItems) => {
      const baseItems = currentItems ?? [];
      const updatedItems = [...baseItems];

      itemsToAdd.forEach(({ name, quantity = 1, category }) => {
        const titleCaseName = toTitleCase(name);
        const normalizedName = titleCaseName.toLowerCase().trim();

        const existingItem = updatedItems.find(
          (item) => item.name.toLowerCase().trim() === normalizedName,
        );

        if (existingItem) {
          existingItem.quantity =
            (existingItem.quantity ?? 1) + (quantity - 1);
          // ADD SYNC METADATA:
          existingItem.updatedAt = now;
          existingItem.updatedBy = userId;
          existingItem.versionVector = incrementVersionVector(existingItem, userId).versionVector;
        } else {
          const newItem: GroceryItem = {
            id: `item-${now}-${Math.random()}`,
            name: titleCaseName,
            checked: false,
            addedAt: now,
            quantity: quantity > 1 ? quantity : undefined,
            category,
            // ADD SYNC METADATA:
            updatedAt: now,
            updatedBy: userId,
            versionVector: { [userId]: 1 },
          };
          updatedItems.push(newItem);
        }
      });

      return updatedItems;
    });

    toast.success(
      `Added ${itemsToAdd.length} item${itemsToAdd.length !== 1 ? "s" : ""}`,
    );
  },
  [setItems, userId],  // ADD userId DEPENDENCY
);
```

4. Also import `incrementVersionVector` from sync-engine:
```typescript
import { incrementVersionVector } from '@/lib/sync-engine';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/use-grocery-items.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-grocery-items.ts
git commit -m "fix: add sync metadata to useGroceryItems addItem and addItemsToList"
```

---

## Task 9: Remove Unused Mutation Functions from useGroceryItems Hook

**Files:**
- Modify: `src/hooks/use-grocery-items.ts`

**Interfaces:**
- Removes: `toggleItem`, `deleteItem`, `editItem`, `handleQuantityChange` from hook return
- Keeps: `setItemCategoryHints` (only function still used)

**Note:** These functions are duplicated in App.tsx and the App.tsx versions are the ones actually wired to components. The hook versions are not used.

- [ ] **Step 1: Write the failing test**

```typescript
// Test that the hook no longer exports unused functions
test('useGroceryItems only exports used functions', () => {
  const { result } = renderHook(() => useGroceryItems(...));
  // These should be undefined or not exist:
  expect(result.current.toggleItem).toBeUndefined();
  expect(result.current.deleteItem).toBeUndefined();
  expect(result.current.editItem).toBeUndefined();
  expect(result.current.handleQuantityChange).toBeUndefined();
  // This should exist:
  expect(result.current.setItemCategoryHints).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/use-grocery-items.test.ts -t "exports"`
Expected: FAIL - functions still exist

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/use-grocery-items.ts`:

1. Remove `toggleItem` function (lines 52-87)
2. Remove `deleteItem` function (lines 90-98)
3. Remove `editItem` function (lines 101-111)
4. Remove `handleQuantityChange` function (lines 114-123)
5. Update return type (lines 11-28) to remove those functions
6. Update return statement (lines 201-210) to only return used functions:
```typescript
return {
  safeItems,
  addItem,
  addItemsToList,
  setItemCategoryHints,  // ONLY THIS ONE REMAINS
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/use-grocery-items.test.ts -t "exports"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-grocery-items.ts
git commit -m "refactor: remove unused mutation functions from useGroceryItems"
```

---

## Task 10: Update App.tsx to Pass userId to useGroceryItems (if hook is still used)

**Files:**
- Modify: `src/App.tsx:146-152` (where useGroceryItems is called)

**Note:** Looking at the code, `useGroceryItems` is imported but NOT actually called in App.tsx - the handlers are defined directly in App.tsx. The hook is likely used elsewhere or is legacy. We should verify.

- [ ] **Step 1: Search for useGroceryItems usage**

Run: `grep -n "useGroceryItems" src/App.tsx`
Expected: Only import, no usage

- [ ] **Step 2: If unused, remove import**

If confirmed unused, remove the import line.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "cleanup: remove unused useGroceryItems import"
```

---

## Task 11: Integration Test - Full Sync Flow

**Files:**
- Test: Create integration test or manual verification steps

**Interfaces:**
- Verifies: All mutations properly sync to Google Sheets

- [ ] **Step 1: Manual verification checklist**

```
□ Add single item → appears in Google Sheets with updatedAt, updatedBy, versionVector
□ Add bulk text → all items have sync metadata
□ Add from recipe → all items have sync metadata  
□ Add from favorites → all items have sync metadata
□ Add from OCR/scan → all items have sync metadata
□ Toggle item → updatedAt, updatedBy, versionVector incremented
□ Edit item name → updatedAt, updatedBy, versionVector incremented
□ Change quantity → updatedAt, updatedBy, versionVector incremented
□ Change category → updatedAt, updatedBy, versionVector incremented
□ Delete single item → tombstone created, synced to Sheets
□ Clear completed → tombstones for each, synced to Sheets
□ Clear all → tombstones for each, synced to Sheets
□ Voice quantity changes → updatedAt, updatedBy, versionVector incremented
□ Reorder sections → no item changes, no sync triggered
□ Rename section → no item changes, no sync triggered
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test: verify all sync metadata fixes work end-to-end"
```

---

## Summary

This plan addresses all 5 issues from the key observations:

| Task | Issue Addressed |
|------|-----------------|
| 1-4 | Missing sync metadata on item creation (bulk/OCR/recipe/favorites) |
| 5 | Missing sync metadata on voice quantity changes |
| 6-7 | Clear completed/all without tombstones |
| 8 | useGroceryItems hook missing sync metadata |
| 9 | Duplicate/unused code in useGroceryItems hook |
| 10 | Cleanup unused hook import |
| 11 | End-to-end verification |

**Total: 11 tasks, each independently testable and committable.**
