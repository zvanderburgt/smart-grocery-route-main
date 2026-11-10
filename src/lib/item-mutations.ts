import type { GroceryItem } from '@/lib/types';

/**
 * Prepare an existing item for mutation by stamping the sync metadata.
 *
 * `updatedAt` is the content clock (name/quantity/category) and `checkedAt` the
 * check clock. They are separate so that checking an item off on one device
 * cannot discard a rename made on another. Any check-state change must carry a
 * `checkedAt`, including un-checking - without it the un-check looks "older than
 * zero" and loses to the remote checked state on the next merge.
 */
export function prepareItemForMutation(
  item: GroceryItem,
  userId: string,
  updates: Partial<GroceryItem>
): GroceryItem {
  const now = Date.now();
  const touchesCheckState =
    typeof updates.checked === 'boolean' && updates.checked !== item.checked;

  return {
    ...item,
    ...updates,
    updatedAt: touchesCheckState ? item.updatedAt : now,
    checkedAt: touchesCheckState ? (updates.checkedAt ?? now) : item.checkedAt,
    updatedBy: userId,
  };
}

/**
 * Create a new item with proper sync metadata initialized.
 */
export function createNewItemWithSync(
  base: Omit<GroceryItem, 'id' | 'addedAt' | 'updatedAt' | 'updatedBy'>,
  userId: string
): GroceryItem {
  const now = Date.now();
  return {
    ...base,
    id: `item-${now}-${Math.random().toString(16).slice(2)}`,
    addedAt: now,
    updatedAt: now,
    updatedBy: userId,
  };
}

/**
 * Undo of a deletion. `revivedAt` is what lets a restore outrank the deletion
 * record that removed the item; without it the merge (correctly) keeps the
 * deletion and the item silently disappears again on the next sync.
 */
export function markItemRevived(item: GroceryItem, userId: string, now = Date.now()): GroceryItem {
  return {
    ...item,
    isTombstone: false,
    revivedAt: now,
    updatedAt: now,
    updatedBy: userId,
  };
}
