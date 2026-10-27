// Offline barcode database for product lookup
// This is a curated sample of common UPC/EAN barcodes
// For production, this can be populated from GS1 data or open barcode databases

interface BarcodeEntry {
  code: string;
  name: string;
  category: string;
}

const LEARNED_BARCODES_KEY = "learned-barcodes";

// UPC manufacturer prefixes (first 3 digits)
const MANUFACTURER_PREFIXES: Record<string, string> = {
  "012": "Coca-Cola",
  "041": "Campbell",
  "049": "Barilla",
  "051": "Best Foods/Hellmanns",
  "052": "Frito-Lay",
  "054": "Wrigleys",
  "070": "General Mills",
  "071": "Kelloggs",
  "072": "Kraft",
  "073": "Heinz",
  "074": "Del Monte",
  "075": "Nestlé",
  "076": "Coca-Cola",
  "078": "Tropicana",
  "079": "Pepsi",
  "080": "Dole",
  "082": "Conagra",
  "084": "General Mills",
  "085": "Mondelez",
  "087": "Borden",
  "088": "Campbell",
  "089": "Del Monte",
};

// Sample barcode database - expand as needed
const BARCODE_DATABASE: Record<string, string> = {
  // Beverages
  "049000050127": "Coca-Cola Classic 12-pack",
  "049000050134": "Sprite 12-pack",
  "049000050141": "Fanta Orange 12-pack",
  "012000013872": "Coca-Cola 2L bottle",
  "012000013889": "Diet Coke 2L bottle",
  "078000055210": "Tropicana Orange Juice 64oz",
  "078000055227": "Tropicana Cranberry 64oz",
  "052000139805": "Gatorade Fruit Punch",
  "052000139812": "Gatorade Lemon Lime",

  // Snacks
  "028400028277": "Doritos Nacho Cheese 2.5oz",
  "028400028284": "Doritos Cool Ranch 2.5oz",
  "028400028291": "Lay's Classic 2.5oz",
  "028400028307": "Lay's Sour Cream & Onion 2.5oz",
  "016000275009": "Oreos Original 14.3oz",
  "016000275016": "Oreos Double Stuff 14.3oz",
  "039000015016": "Pringles Original 5.5oz",
  "039000015023": "Pringles Sour Cream 5.5oz",

  // Dairy
  "041000627900": "Milk (Whole) 1 gallon",
  "041000627917": "Milk (2%) 1 gallon",
  "041000627924": "Milk (Skim) 1 gallon",
  "073466002109": "Kraft Cheddar Cheese 8oz",
  "073466002116": "Kraft American Cheese 8oz",
  "041331152159": "Eggs Large 12-pack",
  "041331152166": "Eggs Large 18-pack",

  // Pantry/Dry Goods
  "049000050288": "Barilla Spaghetti 1lb",
  "049000050295": "Barilla Penne 1lb",
  "028400610130": "Cheez-It Original 13.7oz",
  "028400610147": "Cheez-It White Cheddar 13.7oz",

  // Frozen Foods
  "071600010000": "Ice Cream Vanilla 48oz",
  "071600010017": "Ice Cream Chocolate 48oz",
  "073466001850": "Frozen Pizza Pepperoni 18.3oz",

  // Condiments
  "073466002239": "Heinz Ketchup 20oz",
  "073466002246": "Heinz Mustard 14oz",
  "051000012049": "Best Foods Mayonnaise 30oz",
};

/**
 * Look up a product by barcode
 * Returns product name if found, null otherwise
 */
export function lookupBarcode(barcode: string): string | null {
  // Normalize: remove any spaces, trim to valid length
  const normalized = barcode.trim().replace(/\s/g, "");

  // Try exact match first
  if (BARCODE_DATABASE[normalized]) {
    return BARCODE_DATABASE[normalized];
  }

  // Try UPC prefix match (manufacturer lookup)
  if (normalized.length >= 12) {
    const prefix = normalized.substring(0, 3);
    const manufacturer = MANUFACTURER_PREFIXES[prefix];
    if (manufacturer) {
      // Return manufacturer with barcode as fallback identifier
      return `${manufacturer} Product (${normalized.substring(0, 8)}...)`;
    }
  }

  // Try EAN-8 shortened form
  if (normalized.length === 8) {
    const ean13 = normalized + "000"; // Simple expansion
    if (BARCODE_DATABASE[ean13]) {
      return BARCODE_DATABASE[ean13];
    }
  }

  return null;
}

/**
 * Check if a barcode looks valid (basic validation)
 */
export function isValidBarcode(barcode: string): boolean {
  const normalized = barcode.trim().replace(/\s/g, "");
  // UPC-A: 12 digits, EAN-13: 13 digits, EAN-8: 8 digits
  return /^[0-9]{8}$/.test(normalized) || /^[0-9]{12,13}$/.test(normalized);
}

/**
 * Get a generic product description from barcode format
 */
export function getGenericProductDescription(barcode: string): string {
  const normalized = barcode.trim().replace(/\s/g, "");

  if (!isValidBarcode(normalized)) {
    return "Invalid Barcode";
  }

  if (normalized.length === 8) {
    return `EAN-8 Product (${normalized})`;
  }

  if (normalized.length === 12) {
    return `UPC-A Product (${normalized})`;
  }

  if (normalized.length === 13) {
    return `EAN-13 Product (${normalized})`;
  }

  return `Product (${normalized})`;
}

/**
 * Add or update a barcode entry (for learning system)
 * Useful if user manually corrects a product name
 */
const learnedBarcodes: Record<string, string> = (() => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEARNED_BARCODES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
})();

function persistLearnedBarcodes(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LEARNED_BARCODES_KEY,
      JSON.stringify(learnedBarcodes),
    );
  } catch {
    // localStorage may be unavailable or full
  }
}

export function learnBarcode(barcode: string, productName: string): void {
  const normalized = barcode.trim().replace(/\s/g, "");
  if (isValidBarcode(normalized)) {
    learnedBarcodes[normalized] = productName;
    persistLearnedBarcodes();
  }
}

/**
 * Extended lookup that checks learned barcodes first
 */
export function lookupBarcodeWithLearning(barcode: string): string | null {
  const normalized = barcode.trim().replace(/\s/g, "");

  // Check learned barcodes first
  if (learnedBarcodes[normalized]) {
    return learnedBarcodes[normalized];
  }

  // Fall back to database
  return lookupBarcode(barcode);
}
