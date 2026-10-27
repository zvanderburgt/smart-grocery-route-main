import { GroceryItem } from '@/lib/types';

/**
 * Prepare an existing item for mutation by adding sync metadata
 */
export function prepareItemForMutation(
  item: GroceryItem,
  userId: string,
  updates: Partial<GroceryItem>
): GroceryItem {
  return {
    ...item,
    ...updates,
    updatedAt: Date.now(),
    updatedBy: userId,
  };
}

/**
 * Create a new item with proper sync metadata initialized
 */
export function createNewItemWithSync(
  base: Omit<GroceryItem, 'id' | 'addedAt' | 'updatedAt' | 'updatedBy'>,
  userId: string
): GroceryItem {
  const now = Date.now();
  return {
    ...base,
    id: `item-${now}-${Math.random()}`,
    addedAt: now,
    updatedAt: now,
    updatedBy: userId,
  };
}

/**
 * Create a tombstone for a deleted item (wrapper around sync-engine's createTombstone)
 */
export { createTombstone } from '@/lib/sync-engine';