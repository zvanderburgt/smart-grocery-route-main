import type { StoreCategory, LearnedBrand } from "./types";
import { recognizeBrand, findLearnedBrandMatch } from "./brand-recognition";

interface CategoryDefinition {
  name: string;
  icon: string;
  keywords: string[];
}

export const STORE_CATEGORIES: Record<StoreCategory, CategoryDefinition> = {
  produce: {
    name: "Produce",
    icon: "🥬",
    keywords: [
      "apple",
      "banana",
      "orange",
      "grape",
      "berry",
      "berries",
      "strawberry",
      "blueberry",
      "raspberry",
      "melon",
      "watermelon",
      "cantaloupe",
      "peach",
      "pear",
      "plum",
      "cherry",
      "mango",
      "pineapple",
      "kiwi",
      "avocado",
      "lime",
      "lemon",
      "grapefruit",
      "tangerine",
      "clementine",
      "lettuce",
      "spinach",
      "kale",
      "arugula",
      "cabbage",
      "broccoli",
      "cauliflower",
      "carrot",
      "celery",
      "cucumber",
      "tomato",
      "pepper",
      "bell pepper",
      "onion",
      "garlic",
      "potato",
      "sweet potato",
      "mushroom",
      "zucchini",
      "squash",
      "eggplant",
      "asparagus",
      "green bean",
      "bean sprout",
      "radish",
      "beet",
      "turnip",
      "parsnip",
      "corn",
      "peas",
      "salad",
      "greens",
      "herb",
      "parsley",
      "cilantro",
      "basil",
      "mint",
      "thyme",
      "rosemary",
      "dill",
      "tofu",
      "kimchi",
    ],
  },
  meat: {
    name: "Meat & Poultry",
    icon: "🥩",
    keywords: [
      "chicken",
      "beef",
      "pork",
      "turkey",
      "lamb",
      "veal",
      "duck",
      "bacon",
      "sausage",
      "ham",
      "steak",
      "ground beef",
      "ground turkey",
      "ground chicken",
      "ground pork",
      "roast",
      "ribs",
      "brisket",
      "tenderloin",
      "chop",
      "cutlet",
      "wing",
      "breast",
      "thigh",
      "drumstick",
      "patty",
      "meatball",
      "hot dog",
      "bratwurst",
      "kielbasa",
      "salami",
      "pepperoni",
      "prosciutto",
      "chorizo",
      "chuck",
    ],
  },
  seafood: {
    name: "Seafood",
    icon: "🐟",
    keywords: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "tilapia",
      "halibut",
      "trout",
      "mahi",
      "swordfish",
      "shrimp",
      "prawn",
      "crab",
      "lobster",
      "clam",
      "mussel",
      "oyster",
      "scallop",
      "calamari",
      "squid",
      "octopus",
      "anchovy",
      "sardine",
      "mackerel",
      "herring",
      "catfish",
      "bass",
      "snapper",
      "grouper",
      "flounder",
      "sole",
    ],
  },
  dairy: {
    name: "Dairy & Eggs",
    icon: "🥛",
    keywords: [
      "milk",
      "heavy cream",
      "light cream",
      "double cream",
      "half and half",
      "butter",
      "cheese",
      "cheddar",
      "mozzarella",
      "parmesan",
      "swiss",
      "provolone",
      "brie",
      "feta",
      "goat cheese",
      "cream cheese",
      "cottage cheese",
      "ricotta",
      "yogurt",
      "greek yogurt",
      "sour cream",
      "whipped cream",
      "egg",
      "eggs",
      "eggnog",
      "buttermilk",
      "kefir",
      "whipping cream",
      "creamer",
    ],
  },
  frozen: {
    name: "Frozen Foods",
    icon: "❄️",
    keywords: [
      "frozen",
      "ice cream",
      "frozen pizza",
      "frozen dinner",
      "frozen meal",
      "tv dinner",
      "frozen vegetable",
      "frozen fruit",
      "frozen fries",
      "tater tots",
      "frozen waffle",
      "frozen pancake",
      "frozen burrito",
      "frozen lasagna",
      "frozen chicken nugget",
      "frozen fish stick",
      "popsicle",
      "ice pop",
      "sorbet",
      "gelato",
      "sherbet",
      "frozen yogurt",
      "whipped topping",
      "cool whip",
      "frozen berries",
    ],
  },
  bakery: {
    name: "Bakery",
    icon: "🍞",
    keywords: [
      "bread",
      "baguette",
      "roll",
      "bun",
      "bagel",
      "croissant",
      "muffin",
      "donut",
      "cake",
      "pie",
      "cookie",
      "pastry",
      "danish",
      "scone",
      "biscuit",
      "cornbread",
      "tortilla",
      "pita",
      "naan",
      "english muffin",
      "crumpet",
      "pretzel",
      "brownie",
      "cupcake",
      "tart",
      "eclair",
      "cinnamon roll",
      "sourdough",
      "loaf",
    ],
  },
  deli: {
    name: "Deli",
    icon: "🥪",
    keywords: [
      "deli meat",
      "lunch meat",
      "cold cut",
      "sliced turkey",
      "sliced ham",
      "sliced chicken",
      "roast beef",
      "pastrami",
      "corned beef",
      "bologna",
      "liverwurst",
      "mortadella",
      "hummus",
      "olive",
      "pickle",
      "pickles",
      "coleslaw",
      "potato salad",
      "macaroni salad",
      "prepared meal",
      "rotisserie chicken",
      "sandwich",
      "wrap",
    ],
  },
  pantry: {
    name: "Pantry & Dry Goods",
    icon: "🏺",
    keywords: [
      "pasta",
      "spaghetti",
      "noodle",
      "macaroni",
      "penne",
      "rigatoni",
      "linguine",
      "fettuccine",
      "rice",
      "quinoa",
      "couscous",
      "barley",
      "oat",
      "oatmeal",
      "cereal",
      "granola",
      "flour",
      "sugar",
      "brown sugar",
      "powdered sugar",
      "baking powder",
      "baking soda",
      "yeast",
      "cornstarch",
      "cornmeal",
      "breadcrumb",
      "cracker",
      "nut",
      "almond",
      "walnut",
      "pecan",
      "cashew",
      "peanut",
      "peanut butter",
      "almond butter",
      "seed",
      "sunflower seed",
      "chia seed",
      "flaxseed",
      "dried fruit",
      "raisin",
      "cranberry",
    ],
  },
  beverages: {
    name: "Beverages",
    icon: "🥤",
    keywords: [
      "water",
      "juice",
      "soda",
      "pop",
      "cola",
      "sprite",
      "ginger ale",
      "lemonade",
      "tea",
      "coffee",
      "espresso",
      "beer",
      "wine",
      "liquor",
      "alcohol",
      "vodka",
      "rum",
      "whiskey",
      "tequila",
      "gin",
      "cocktail mix",
      "sports drink",
      "gatorade",
      "energy drink",
      "milk alternative",
      "almond milk",
      "soy milk",
      "oat milk",
      "coconut milk",
      "sparkling water",
      "seltzer",
      "tonic water",
      "club soda",
      "cold brew",
    ],
  },
  snacks: {
    name: "Snacks",
    icon: "🍿",
    keywords: [
      "chip",
      "chips",
      "pretzels",
      "popcorn",
      "crackers",
      "trail mix",
      "granola bar",
      "protein bar",
      "energy bar",
      "fruit snack",
      "gummy",
      "candy",
      "chocolate",
      "gum",
      "breath mint",
      "beef jerky",
      "pork rind",
      "cheese puff",
      "dorito",
      "cheeto",
      "corn chip",
      "tortilla chip",
      "salsa",
      "guacamole",
      "dip",
      "cheese dip",
      "queso",
      "pretzel sticks",
    ],
  },
  canned: {
    name: "Canned & Jarred",
    icon: "🥫",
    keywords: [
      "canned",
      "can",
      "soup",
      "broth",
      "stock",
      "tomato sauce",
      "pasta sauce",
      "marinara",
      "canned tomato",
      "tomato paste",
      "canned bean",
      "canned corn",
      "canned pea",
      "canned vegetable",
      "canned fruit",
      "applesauce",
      "jam",
      "jelly",
      "preserve",
      "marmalade",
      "jar",
      "jarred",
      "canned tuna",
      "canned chicken",
      "canned salmon",
      "spam",
    ],
  },
  condiments: {
    name: "Condiments & Sauces",
    icon: "🧂",
    keywords: [
      "ketchup",
      "mustard",
      "mayo",
      "mayonnaise",
      "relish",
      "hot sauce",
      "bbq sauce",
      "barbecue sauce",
      "soy sauce",
      "teriyaki",
      "worcestershire",
      "vinegar",
      "balsamic",
      "olive oil",
      "vegetable oil",
      "canola oil",
      "coconut oil",
      "cooking spray",
      "salad dressing",
      "ranch",
      "italian dressing",
      "caesar",
      "salt",
      "spice",
      "seasoning",
      "garlic powder",
      "onion powder",
      "paprika",
      "cumin",
      "cinnamon",
      "oregano",
      "chili powder",
      "curry",
      "syrup",
      "maple syrup",
      "honey",
      "agave",
      "vanilla extract",
      "black pepper",
      "ground pepper",
      "red pepper flakes",
    ],
  },
  household: {
    name: "Household & Cleaning",
    icon: "🧹",
    keywords: [
      "paper towel",
      "toilet paper",
      "tissue",
      "kleenex",
      "napkin",
      "plate",
      "cup",
      "utensil",
      "plastic wrap",
      "aluminum foil",
      "foil",
      "ziplock",
      "storage bag",
      "trash bag",
      "garbage bag",
      "dish soap",
      "dishwasher",
      "detergent",
      "laundry",
      "bleach",
      "cleaner",
      "cleaning",
      "disinfectant",
      "wipe",
      "sponge",
      "scrubber",
      "mop",
      "broom",
      "vacuum bag",
      "air freshener",
      "candle",
      "lighter",
      "match",
      "battery",
      "batteries",
      "light bulb",
      "bulb",
    ],
  },
  "personal-care": {
    name: "Personal Care",
    icon: "🧴",
    keywords: [
      "shampoo",
      "conditioner",
      "body wash",
      "soap",
      "lotion",
      "moisturizer",
      "deodorant",
      "toothpaste",
      "toothbrush",
      "mouthwash",
      "floss",
      "dental",
      "razor",
      "shaving cream",
      "aftershave",
      "perfume",
      "cologne",
      "hairspray",
      "gel",
      "mousse",
      "sunscreen",
      "chapstick",
      "lip balm",
      "makeup",
      "cosmetic",
      "nail polish",
      "cotton ball",
      "q-tip",
      "cotton swab",
      "band-aid",
      "bandage",
      "medicine",
      "aspirin",
      "ibuprofen",
      "tylenol",
      "allergy",
      "vitamin",
      "supplement",
      "diaper",
      "baby",
      "formula",
      "baby food",
      "baby wipe",
      "multivitamin",
    ],
  },
  other: {
    name: "Other",
    icon: "📦",
    keywords: [],
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 'berry' must also match 'berries'; 'turkey' still takes a plain 's'.
function pluralPattern(keyword: string): string {
  const escaped = `${escapeRegExp(keyword)}(e?s)?`;
  return /[^aeiou]y$/.test(keyword)
    ? `(?:${escaped}|${escapeRegExp(keyword.slice(0, -1))}ies)`
    : escaped;
}

// Whole-word (plus optional plural) keyword matchers, compiled once at module
// load. Unanchored substrings used to match inside other words ('chocolate'
// contains 'cola', 'crushed' contains 'rush').
const KEYWORD_MATCHERS: Array<{
  keyword: string;
  matcher: RegExp;
  category: StoreCategory;
}> = Object.entries(STORE_CATEGORIES)
  .filter(([category]) => category !== "other")
  .flatMap(([category, definition]) =>
    definition.keywords.map((keyword) => ({
      keyword,
      category: category as StoreCategory,
      matcher: new RegExp(`(^|[^a-z])${pluralPattern(keyword)}([^a-z]|$)`),
    })),
  );

// 'frozen peas' and 'chicken broth canned' are about how the item is sold, not
// what it is made of, so these words decide the category wherever they appear.
const STATE_MODIFIERS: Array<{ matcher: RegExp; category: StoreCategory }> = [
  { matcher: /(^|[^a-z])frozen([^a-z]|$)/, category: "frozen" },
  { matcher: /(^|[^a-z])ice cream([^a-z]|$)/, category: "frozen" },
  { matcher: /(^|[^a-z])canned([^a-z]|$)/, category: "canned" },
];

// Brands this long are distinctive enough to outrank a product keyword
// ('doritos nacho cheese'); shorter ones ('extra', 'dove') are ordinary words.
const STRONG_BRAND_MIN_LENGTH = 6;

// Packaging words that are also keywords. They trail the real noun
// ('paper towels 6 rolls', 'seltzer cans'), so they only count when nothing
// else matched ('dinner rolls').
const PACKAGING_WORDS = new Set(["roll", "can", "cup", "jar"]);

// English noun phrases are head-final: 'chicken broth' is broth, 'apple juice'
// is juice. The keyword that ends furthest right wins; ties (a keyword nested
// in a longer one, 'butter' in 'peanut butter') go to the longer keyword.
interface KeywordHit {
  end: number;
  length: number;
  category: StoreCategory;
}

function bestKeywordCategory(normalized: string): StoreCategory | null {
  let best: KeywordHit | null = null;
  let bestPackaging: KeywordHit | null = null;

  for (const { keyword, matcher, category } of KEYWORD_MATCHERS) {
    const match = matcher.exec(normalized);
    if (!match) continue;
    const candidate: KeywordHit = {
      end: match.index + match[0].length,
      length: keyword.length,
      category,
    };
    const slot = PACKAGING_WORDS.has(keyword) ? "packaging" : "main";
    const current = slot === "main" ? best : bestPackaging;
    if (
      !current ||
      candidate.end > current.end ||
      (candidate.end === current.end && candidate.length > current.length)
    ) {
      if (slot === "main") best = candidate;
      else bestPackaging = candidate;
    }
  }

  return (best ?? bestPackaging)?.category ?? null;
}

export function categorizeItem(
  itemName: string,
  learnedBrands?: LearnedBrand[],
): StoreCategory {
  const normalized = itemName.toLowerCase().trim();

  const learned = learnedBrands
    ? findLearnedBrandMatch(normalized, learnedBrands)
    : null;
  if (learned) return learned.category;

  for (const { matcher, category } of STATE_MODIFIERS) {
    if (matcher.test(normalized)) return category;
  }

  const strongBrand = recognizeBrand(normalized, STRONG_BRAND_MIN_LENGTH);
  if (strongBrand) return strongBrand.category;

  const keywordCategory = bestKeywordCategory(normalized);
  if (keywordCategory) return keywordCategory;

  // Short brands are a last resort for the same reason they cannot outrank
  // keywords above.
  return recognizeBrand(normalized)?.category ?? "other";
}

export function getCategoryInfo(category: StoreCategory): CategoryDefinition {
  return STORE_CATEGORIES[category];
}
