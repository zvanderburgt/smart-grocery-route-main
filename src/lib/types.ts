export interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
  checkedAt?: number;
  addedAt: number;
  category?: string;
  quantity?: number;
  updatedAt?: number; // Last content modification timestamp
  updatedBy?: string; // Email/user/device who last modified
  isTombstone?: boolean; // Legacy deletion marker (read-only; deletions now live in the Deletions tab)
  revivedAt?: number; // Set on Undo so a restore can outrank the deletion that removed the item
}

export interface ItemRelationship {
  item1: string;
  item2: string;
  strength: number;
  lastUpdated: number;
  coOccurrences?: number;
}

export interface Section {
  id: string;
  name: string;
  items: GroceryItem[];
  averagePosition: number;
  confidence: number;
  icon?: string;
  isLearned?: boolean;
  customName?: string;
}

export type StoreCategory =
  | "produce"
  | "meat"
  | "seafood"
  | "dairy"
  | "frozen"
  | "bakery"
  | "deli"
  | "pantry"
  | "beverages"
  | "snacks"
  | "canned"
  | "condiments"
  | "household"
  | "personal-care"
  | "other";

export interface ShoppingTrip {
  id: string;
  date: number;
  items: Array<{
    name: string;
    checkedAt: number;
    position: number;
  }>;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  ingredients: Array<{
    name: string;
    quantity: number;
    unit?: string;
  }>;
  createdAt: number;
}

export interface SavedRecipe {
  id: string;
  name: string;
  servings: number;
  url?: string;
  ingredients: Array<{
    name: string;
    quantity: number;
    unit?: string;
  }>;
  createdAt: number;
  lastUsed?: number;
  useCount: number;
}

export interface LearnedBrand {
  brand: string;
  category: StoreCategory;
  commonName?: string;
  confidence: number;
  occurrences: number;
  lastSeen: number;
  createdAt: number;
}

/**
 * Google Sheets integration types
 */
export interface GoogleSheetsConfig {
  sheetId: string;
  sheetName: string; // e.g., "GroceryList"
  connectedAccountEmail?: string;
  lastSyncAt?: number;
  syncEnabled: boolean;
}

export interface SyncState {
  status: 'disconnected' | 'connecting' | 'synced' | 'syncing' | 'conflict' | 'error';
  lastSyncAt?: number;
  lastError?: string;
  pendingWrites: number;
  remoteVersion?: number;
}
