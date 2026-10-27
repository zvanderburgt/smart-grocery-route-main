import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strips HTML tags (including script element content) and trims whitespace
 * from user-supplied text. Prevents stored XSS if content is ever rendered as HTML.
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // strip script body
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // strip style body
    .replace(/<[^>]*>/g, "") // strip remaining tags
    .trim();
}

/** Normalizes an item name for case-insensitive deduplication lookups. */
export function normalizeItemKey(itemName: string): string {
  return itemName.toLowerCase().trim();
}

export function toTitleCase(str: string): string {
  return str.replace(
    /\S+/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}

export function parseItemWithQuantity(input: string): {
  name: string;
  quantity: number;
} {
  const trimmed = input.trim();

  const patterns = [
    /^(\d+)\s*x\s+(.+)$/i,
    /^(.+?)\s+x\s*(\d+)$/i,
    /^(\d+)\s+(bags?|boxes?|cans?|bottles?|jars?|packages?|packs?|containers?|cartons?|loaves?|bunches?|heads?|pounds?|lbs?|pieces?)\s+of\s+(.+)$/i,
    /^(\d+)\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      // Check bags/boxes pattern first — must precede the "x" check because
      // "boxes?" contains the letter "x", causing it to fall into the wrong branch.
      if (pattern.source.includes("bags?|boxes?")) {
        // "N bags/boxes/... of item": match[1]=qty, match[2]=unit, match[3]=item
        const quantity = parseInt(match[1], 10);
        const name = match[3].trim();
        if (quantity > 0 && quantity <= 999) {
          return { name, quantity };
        }
      } else if (pattern.source.includes("x")) {
        if (pattern.source.startsWith("^(\\d+)")) {
          const quantity = parseInt(match[1], 10);
          const name = match[2].trim();
          if (quantity > 0 && quantity <= 999) {
            return { name, quantity };
          }
        } else {
          const name = match[1].trim();
          const quantity = parseInt(match[2], 10);
          if (quantity > 0 && quantity <= 999) {
            return { name, quantity };
          }
        }
      } else if (pattern.source === "^(\\d+)\\s+(.+)$") {
        const quantity = parseInt(match[1], 10);
        const rest = match[2].trim();
        if (quantity > 0 && quantity <= 20 && rest.length > 2) {
          return { name: rest, quantity };
        }
      }
    }
  }

  return { name: trimmed, quantity: 1 };
}
