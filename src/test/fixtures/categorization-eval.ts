// Labelled basket for categorization accuracy measurement.
//
// ⚠️ SYNTHETIC DATA. Every entry below is hand-written by a developer to look
// like a realistic US-supermarket basket line. None of it comes from a real
// user's list history. The real labelled data lives in localStorage under
// `item-category-hints` (every manual correction is literally an
// `(itemName, userTruth)` pair) and in the Google Sheets sync; when that is
// available it should REPLACE or AUGMENT these entries, because accuracy
// measured here is only indicative of the bug classes, not calibrated to any
// actual usage.
//
// Labels are the author's intent for a typical US supermarket. Entries marked
// `// store-dependent` are genuinely ambiguous — a different store (or a
// different shopper) would file them elsewhere, so they are expected to be a
// permanent floor on accuracy rather than a bug to fix.
//
// The first 60 entries are the original fixture used for the baseline numbers
// in docs/plans/laya-categorization-plan.md; the rest were added in Phase 0 to
// widen coverage over all 14 non-`other` categories and the known hard classes
// (modifier ordering, "frozen X", brand-like short words appearing as
// substrings, plurals, quantities/sizes, multi-word names).
export const CATEGORIZATION_EVAL: Array<[string, string]> = [
  // --- original 60 ---------------------------------------------------------
  ["bananas", "produce"],
  ["organic baby spinach", "produce"],
  ["roma tomatoes", "produce"],
  ["red bell peppers", "produce"],
  ["chicken thighs", "meat"],
  ["80/20 ground chuck", "meat"],
  ["atlantic salmon fillet", "seafood"],
  ["whole milk gallon", "dairy"],
  ["oat milk", "dairy"], // store-dependent (dairy case vs beverage aisle)
  ["almond milk unsweetened", "dairy"], // store-dependent
  ["shredded mozzarella", "dairy"],
  ["string cheese", "dairy"],
  ["large eggs", "dairy"],
  ["sourdough loaf", "bakery"],
  ["hamburger buns", "bakery"],
  ["frozen peas", "frozen"],
  ["ben & jerry's", "frozen"],
  ["frozen blueberries", "frozen"],
  ["digiorno", "frozen"],
  ["rotisserie chicken", "deli"],
  ["sliced provolone", "deli"], // store-dependent (deli counter vs dairy case)
  ["jasmine rice", "pantry"],
  ["elbow macaroni", "pantry"],
  ["old fashioned oats", "pantry"],
  ["cheerios", "pantry"],
  ["creamy peanut butter", "pantry"],
  ["black beans canned", "canned"],
  ["chicken broth", "canned"],
  ["crushed tomatoes 28oz", "canned"],
  ["rao's marinara", "canned"],
  ["dijon mustard", "condiments"],
  ["extra virgin olive oil", "condiments"],
  ["sriracha", "condiments"],
  ["ranch dressing", "condiments"],
  ["tortilla chips", "snacks"],
  ["dark chocolate bar", "snacks"],
  ["clif bar", "snacks"],
  ["la croix", "beverages"],
  ["cold brew concentrate", "beverages"],
  ["orange juice", "beverages"], // store-dependent (refrigerated produce vs beverages)
  ["bounty paper towels", "household"],
  ["tide pods", "household"],
  ["dawn dish soap", "household"],
  ["13 gallon trash bags", "household"],
  ["crest toothpaste", "personal-care"],
  ["dove body wash", "personal-care"],
  ["advil", "personal-care"],
  ["huggies size 4", "personal-care"],
  ["tofu firm", "produce"], // store-dependent (produce cooler vs refrigerated/other)
  ["kimchi", "produce"], // store-dependent
  ["sushi rice vinegar", "condiments"],
  ["maple syrup", "condiments"],
  ["heavy whipping cream", "dairy"],
  ["corn tortillas", "bakery"],
  ["pita bread", "bakery"],
  ["cream of mushroom soup", "canned"],
  ["baby carrots", "produce"],
  ["sparkling water lime", "beverages"],
  ["greek yogurt plain", "dairy"],
  ["chicken nuggets frozen", "frozen"],

  // --- Phase 0 additions: produce -----------------------------------------
  ["yellow onions 3lb bag", "produce"],
  ["english cucumber", "produce"],
  ["honeycrisp apples", "produce"],
  ["russet potatoes 5lb", "produce"],
  ["broccoli crowns", "produce"],
  ["seedless green grapes", "produce"],
  ["iceberg lettuce head", "produce"],
  ["white mushrooms 8oz", "produce"],
  ["jalapeno peppers", "produce"],
  ["fresh cilantro bunch", "produce"],
  ["bag of lemons", "produce"],
  ["sweet potatoes", "produce"],

  // --- Phase 0 additions: meat --------------------------------------------
  ["boneless skinless chicken breast", "meat"],
  ["pork tenderloin", "meat"],
  ["ground turkey 93/7", "meat"],
  ["ribeye steak", "meat"],
  ["italian sausage links", "meat"],
  ["thick cut bacon", "meat"],
  ["beef stew meat", "meat"],
  ["lamb chops", "meat"],
  ["chicken drumsticks", "meat"],
  ["pork chops bone in", "meat"],

  // --- Phase 0 additions: seafood -----------------------------------------
  ["jumbo shrimp 16oz", "seafood"],
  ["tilapia fillets", "seafood"],
  ["cod loin", "seafood"],
  ["sea scallops", "seafood"],
  ["ahi tuna steaks", "seafood"],
  ["crab legs", "seafood"],
  ["smoked salmon", "seafood"], // store-dependent (seafood counter vs deli)
  ["littleneck clams", "seafood"],

  // --- Phase 0 additions: dairy -------------------------------------------
  ["unsalted butter sticks", "dairy"],
  ["sharp cheddar block", "dairy"],
  ["cottage cheese 16oz", "dairy"],
  ["sour cream 8oz", "dairy"],
  ["half and half quart", "dairy"],
  ["2% milk half gallon", "dairy"],
  ["egg whites carton", "dairy"],
  ["feta crumbles", "dairy"],
  ["grated parmesan", "dairy"],
  ["chocolate milk", "dairy"],
  ["extra sharp cheddar", "dairy"],
  ["coffee creamer", "dairy"], // store-dependent (dairy case vs coffee aisle)

  // --- Phase 0 additions: frozen ------------------------------------------
  ["frozen waffles", "frozen"],
  ["frozen broccoli florets", "frozen"],
  ["vanilla ice cream pint", "frozen"],
  ["frozen shrimp", "frozen"],
  ["tater tots", "frozen"],
  ["frozen chicken tenders", "frozen"],
  ["frozen strawberries", "frozen"],
  ["frozen cheese pizza", "frozen"],
  ["frozen fish sticks", "frozen"],
  ["frozen edamame", "frozen"],
  ["popsicles", "frozen"],

  // --- Phase 0 additions: bakery ------------------------------------------
  ["whole wheat sandwich bread", "bakery"],
  ["everything bagels", "bakery"],
  ["flour tortillas 10 count", "bakery"],
  ["blueberry muffins", "bakery"],
  ["dinner rolls", "bakery"],
  ["french baguette", "bakery"],
  ["hot dog buns", "bakery"],
  ["english muffins", "bakery"],
  ["chocolate chip cookies", "bakery"], // store-dependent (in-store bakery vs cookie aisle)

  // --- Phase 0 additions: deli --------------------------------------------
  ["boar's head turkey", "deli"],
  ["sliced ham deli", "deli"],
  ["hummus container", "deli"],
  ["macaroni salad", "deli"],
  ["kalamata olives", "deli"],
  ["dill pickle spears", "deli"], // store-dependent (deli vs condiments aisle)
  ["oscar mayer cold cuts", "deli"],
  ["deli potato salad", "deli"],

  // --- Phase 0 additions: pantry ------------------------------------------
  ["spaghetti noodles 1lb", "pantry"],
  ["white rice 5lb bag", "pantry"],
  ["all purpose flour", "pantry"],
  ["granulated sugar", "pantry"],
  ["baking soda box", "pantry"],
  ["quick oats", "pantry"],
  ["honey nut cheerios", "pantry"],
  ["granola cereal", "pantry"],
  ["raw almonds", "pantry"],
  ["chicken ramen noodles", "pantry"],
  ["panko breadcrumbs", "pantry"],
  ["post shredded wheat", "pantry"],

  // --- Phase 0 additions: beverages ---------------------------------------
  ["diet coke 12 pack", "beverages"],
  ["gatorade variety pack", "beverages"],
  ["ground coffee dark roast", "beverages"],
  ["green tea bags", "beverages"],
  ["apple juice 64oz", "beverages"],
  ["seltzer water cans", "beverages"],
  ["red wine cabernet", "beverages"],
  ["lemonade gallon", "beverages"],
  ["coconut water", "beverages"],
  ["mug root beer", "beverages"],

  // --- Phase 0 additions: snacks ------------------------------------------
  ["doritos nacho cheese", "snacks"],
  ["pretzel sticks", "snacks"],
  ["beef jerky original", "snacks"],
  ["fruit snacks gummies", "snacks"],
  ["microwave popcorn", "snacks"],
  ["cheez-it crackers", "snacks"],
  ["m&m's peanut", "snacks"],
  ["kettle potato chips", "snacks"],
  ["guacamole cups", "snacks"],
  ["trail mix bag", "snacks"],
  ["kind bars", "snacks"],

  // --- Phase 0 additions: canned ------------------------------------------
  ["canned corn", "canned"],
  ["chicken noodle soup", "canned"],
  ["tomato paste small can", "canned"],
  ["beef broth carton", "canned"],
  ["canned chickpeas", "canned"],
  ["refried beans can", "canned"],
  ["pasta sauce jar", "canned"],
  ["canned pineapple chunks", "canned"],
  ["cream of chicken soup", "canned"],
  ["vegetable stock", "canned"],
  ["strawberry jam", "canned"],
  ["canned tuna in water", "canned"],

  // --- Phase 0 additions: condiments --------------------------------------
  ["ketchup bottle", "condiments"],
  ["mayonnaise 30oz", "condiments"],
  ["soy sauce low sodium", "condiments"],
  ["apple cider vinegar", "condiments"],
  ["ground cinnamon", "condiments"],
  ["black pepper grinder", "condiments"],
  ["vanilla extract", "condiments"],
  ["pam cooking spray", "condiments"],
  ["italian dressing bottle", "condiments"],
  ["garlic powder", "condiments"],
  ["taco seasoning packet", "condiments"],
  ["crushed red pepper flakes", "condiments"],

  // --- Phase 0 additions: household ---------------------------------------
  ["paper towels 6 rolls", "household"],
  ["toilet paper 12 mega rolls", "household"],
  ["dishwasher pods", "household"],
  ["clorox wipes", "household"],
  ["aluminum foil heavy duty", "household"],
  ["laundry detergent liquid", "household"],
  ["sponges 4 pack", "household"],
  ["aa batteries", "household"],
  ["trash bags 30 gallon", "household"],
  ["glass cleaner spray", "household"],
  ["paper plates", "household"],

  // --- Phase 0 additions: personal-care -----------------------------------
  ["shampoo and conditioner", "personal-care"],
  ["bar soap 3 pack", "personal-care"],
  ["deodorant stick", "personal-care"],
  ["soft toothbrush", "personal-care"],
  ["ibuprofen 200mg", "personal-care"],
  ["daily multivitamin", "personal-care"],
  ["sunscreen spf 50", "personal-care"],
  ["razor blades refill", "personal-care"],
  ["baby wipes refill", "personal-care"],
  ["floss picks", "personal-care"],
  ["hand lotion", "personal-care"],
  ["dove soap bar", "personal-care"],
  ["sure deodorant", "personal-care"],
];
