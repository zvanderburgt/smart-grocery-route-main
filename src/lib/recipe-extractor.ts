// Recipe extraction from HTML using multiple strategies
// 1. Schema.org JSON-LD detection (80% of modern sites)
// 2. Regex-based parsing (fallback for older sites)
// 3. Optional: AI model (only if both fail and user opts-in)

interface RecipeData {
  title: string;
  servings: number;
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
  }>;
}

/**
 * Extract recipe data from HTML using JSON-LD schema
 * Most modern recipe sites embed structured data in <script type="application/ld+json">
 */
export function extractRecipeSchema(html: string): RecipeData | null {
  try {
    // Find JSON-LD script tags
    const schemaPattern =
      /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let schemaMatch;

    while ((schemaMatch = schemaPattern.exec(html)) !== null) {
      try {
        const schemaJson = JSON.parse(schemaMatch[1]);

        // Check if it's a Recipe schema
        if (isRecipeSchema(schemaJson)) {
          return parseRecipeSchema(schemaJson);
        }

        // Check if it's nested in a GraphQL-style array
        if (Array.isArray(schemaJson)) {
          for (const item of schemaJson) {
            if (isRecipeSchema(item)) {
              return parseRecipeSchema(item);
            }
          }
        }
      } catch {
        // Not valid JSON or not a recipe, continue
        continue;
      }
    }
  } catch {
    // Silently fail, return null
  }

  return null;
}

/**
 * Check if a schema object is a Recipe type
 */
function isRecipeSchema(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== "object" || obj === null) return false;
  const schema = obj as Record<string, unknown>;
  const type = schema["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

/**
 * Parse JSON-LD Recipe schema into RecipeData format
 */
function parseRecipeSchema(schema: Record<string, unknown>): RecipeData | null {
  try {
    const title = (schema.name as string) || "Recipe";
    const servings = parseServings(schema.recipeYield) || 4;

    const ingredients = parseIngredients(schema.recipeIngredient);
    if (ingredients.length === 0) {
      return null; // No ingredients found, probably not a valid recipe
    }

    return { title, servings, ingredients };
  } catch {
    return null;
  }
}

/**
 * Parse servings from schema (can be string, number, or array)
 */
function parseServings(yield_: unknown): number | null {
  if (typeof yield_ === "number") {
    return yield_;
  }

  if (typeof yield_ === "string") {
    const match = yield_.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  if (Array.isArray(yield_) && yield_.length > 0) {
    return parseServings(yield_[0]);
  }

  return null;
}

/**
 * Parse ingredients array from schema
 * Can be strings like "1.5 cups flour" or structured objects
 */
function parseIngredients(
  ingredients: unknown,
): Array<{ name: string; quantity: number; unit: string }> {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients
    .map((ing) => {
      if (typeof ing === "string") {
        return parseIngredientString(ing);
      }

      if (typeof ing === "object" && ing !== null) {
        return parseIngredientObject(ing as Record<string, unknown>);
      }

      return null;
    })
    .filter(
      (x): x is { name: string; quantity: number; unit: string } => x !== null,
    );
}

/**
 * Parse ingredient from string like "1.5 cups flour"
 */
function parseIngredientString(
  text: string,
): { name: string; quantity: number; unit: string } | null {
  // Pattern: optional quantity + optional unit + ingredient name
  // Examples: "1 cup flour", "2-3 tbsp sugar", "1/2 tsp salt", "flour"
  const pattern =
    /^([0-9]*\.?[0-9]+(?:\/[0-9]+)?)\s*(-\s*[0-9]*\.?[0-9]+(?:\/[0-9]+)?)?\s*([a-z]+)?\s+(.+)$/i;

  const match = text.trim().match(pattern);
  if (!match) {
    // No quantity, just treat whole thing as ingredient name
    return {
      name: text.trim(),
      quantity: 1,
      unit: "",
    };
  }

  const quantity1 = parseQuantityString(match[1]);
  const quantity2 = match[2]
    ? parseQuantityString(match[2].replace(/\s/g, ""))
    : null;
  const quantity = quantity2 ? (quantity1 + quantity2) / 2 : quantity1;
  const unit = normalizeUnit(match[3] || "");
  const name = match[4].trim();

  return {
    name,
    quantity: quantity || 1,
    unit,
  };
}

/**
 * Parse ingredient from structured object
 */
function parseIngredientObject(
  obj: Record<string, unknown>,
): { name: string; quantity: number; unit: string } | null {
  const name = (obj.name as string) || "";
  if (!name) return null;

  let quantity = 1;
  let unit = "";

  if (obj.amount) {
    quantity = Number(obj.amount) || 1;
  }

  if (obj.unitCode) {
    unit = normalizeUnit(obj.unitCode as string);
  } else if (obj.unitText) {
    unit = normalizeUnit(obj.unitText as string);
  }

  return { name, quantity, unit };
}

/**
 * Parse quantity strings like "1.5" or "1/2"
 */
function parseQuantityString(str: string): number {
  str = str.trim();

  // Handle fractions like "1/2"
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0]);
      const denominator = parseFloat(parts[1]);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
  }

  // Handle decimal/whole numbers
  const num = parseFloat(str);
  return !isNaN(num) ? num : 1;
}

/**
 * Normalize unit names to standard abbreviations
 */
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim().replace(/s$/, ""); // Remove plural 's'

  const unitMap: Record<string, string> = {
    cup: "cup",
    tbsp: "tbsp",
    tablespoon: "tbsp",
    tsp: "tsp",
    teaspoon: "tsp",
    g: "g",
    gram: "g",
    kg: "kg",
    oz: "oz",
    ounce: "oz",
    lb: "lb",
    pound: "lb",
    ml: "ml",
    l: "l",
    liter: "l",
    pinch: "pinch",
    dash: "dash",
    drop: "drop",
  };

  return unitMap[normalized] || unit;
}

/**
 * Extract recipe by regex parsing of HTML content
 * Fallback when schema extraction fails
 */
export function extractRecipeByRegex(html: string): RecipeData | null {
  try {
    // Try to find title in common locations
    let title = "Recipe";

    // Look for h1 with recipe keyword
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) {
      title = cleanHtmlText(h1Match[1]);
    }

    // Try to find ingredient list
    const ingredients = extractIngredientsFromRegex(html);
    if (ingredients.length === 0) {
      return null;
    }

    const servings = extractServingsFromRegex(html);

    return {
      title,
      servings: servings || 4,
      ingredients,
    };
  } catch {
    return null;
  }
}

/**
 * Extract ingredients using regex on HTML
 */
function extractIngredientsFromRegex(
  html: string,
): Array<{ name: string; quantity: number; unit: string }> {
  const ingredients: Array<{ name: string; quantity: number; unit: string }> =
    [];

  // Common ingredient list patterns
  const patterns = [
    // <li> items with quantity + unit + ingredient
    /<li[^>]*>(.*?)<\/li>/gi,
    // Lines that look like ingredients
    /^([^:]{0,50}:)?\s*([\d.\/]+)\s*([a-z]+)?\s+(.+?)$/gim,
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const text = cleanHtmlText(match[0]);

      // Skip obvious non-ingredients
      if (text.length < 3 || text.length > 200) continue;
      if (/^(instructions|directions|method|preparation)/i.test(text)) continue;
      if (/^(prep|cook|bake|total)\s*(time)?:/i.test(text)) continue;

      const parsed = parseIngredientString(text);
      if (parsed && parsed.name.length >= 2) {
        // Avoid duplicates
        if (
          !ingredients.some(
            (i) => i.name.toLowerCase() === parsed.name.toLowerCase(),
          )
        ) {
          ingredients.push(parsed);
        }
      }
    }

    if (ingredients.length > 0) break; // Success with first pattern
  }

  return ingredients.slice(0, 50); // Limit to 50 ingredients max
}

/**
 * Extract servings from HTML using regex
 */
function extractServingsFromRegex(html: string): number | null {
  const patterns = [
    /servings?:?\s*(\d+)/i,
    /yields?:?\s*(\d+)/i,
    /makes?:?\s*(\d+)/i,
    /recipe.*?servings?:?\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1]);
    }
  }

  return null;
}

/**
 * Clean HTML text content
 */
function cleanHtmlText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace non-breaking spaces
    .replace(/&quot;/g, '"') // Decode quotes
    .replace(/&amp;/g, "&") // Decode ampersand
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Main extraction function - tries multiple strategies
 */
export function extractRecipe(html: string): RecipeData | null {
  // Strategy 1: Try schema extraction first (most reliable)
  const schemaResult = extractRecipeSchema(html);
  if (schemaResult && schemaResult.ingredients.length > 0) {
    return schemaResult;
  }

  // Strategy 2: Try regex parsing
  const regexResult = extractRecipeByRegex(html);
  if (regexResult && regexResult.ingredients.length > 0) {
    return regexResult;
  }

  // No recipe found
  return null;
}
