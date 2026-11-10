/**
 * BLIND HELD-OUT EVALUATION SET for the grocery-item store-section classifier.
 *
 * This file was written BLIND: the author never opened, read, grepped or
 * otherwise inspected src/lib/ (the classifier and its keyword lists),
 * src/test/fixtures/categorization-eval.ts, src/test/categorization-accuracy.test.ts,
 * or docs/plans/. The only source file consulted was src/lib/types.ts, purely to
 * copy the exact StoreCategory string union.
 *
 * THIS SET MUST NOT BE USED FOR TUNING. Do not add keywords, synonyms, regexes or
 * brand entries to the classifier because an item here failed. Doing so destroys
 * the only unbiased accuracy estimate this repo has. If a label here is genuinely
 * wrong (not merely store-dependent), fix the label in a reviewed commit and note it.
 *
 * Labels reflect a typical large US supermarket layout:
 *   produce       fresh fruit/veg/herbs, bagged salads, pre-cut fruit
 *   meat          fresh/packaged raw meat & poultry, sausage, bacon
 *   seafood       fresh & counter seafood, shellfish, smoked/imitation seafood
 *   dairy         refrigerated milk/cheese/yogurt/butter/eggs/creamers
 *   frozen        anything whose home is the freezer case
 *   bakery        in-store bakery + bread aisle, tortillas, flatbreads
 *   deli          deli counter, cheese counter, prepared/hot bar foods, olive bar
 *   pantry        dry goods: pasta, rice, grains, cereal, flour, sugar, baking,
 *                 nuts, dried fruit, nut butters
 *   beverages     coffee, tea, soda, juice, water, sports/energy drinks, beer/wine
 *   snacks        chips, crackers-as-snacks, candy, bars, cookies, dips & salsa
 *   canned        canned & jarred: soups, broths, canned veg/fruit/fish/beans,
 *                 pasta sauce in jars, jam, pickles
 *   condiments    condiments, sauces, oils, vinegars, spices, sweeteners & syrups
 *   household     cleaning, paper goods, bags/foil, batteries, bulbs, PET supplies
 *   personal-care health & beauty, pharmacy/OTC, vitamins, baby diapers & wipes
 *   other         non-grocery goods with no real food/household section
 *
 * Conventions chosen up front and applied consistently:
 *   - Pet food, treats and litter  -> household (per task instruction).
 *   - Coffee and tea               -> beverages (coffee/tea aisle), not pantry.
 *   - Bacon, sausage, hot dogs     -> meat (packaged meat case).
 *   - Broths/stocks                -> canned (soup aisle), even in cartons.
 *   - Jarred pasta sauce, jam,
 *     pickles, applesauce          -> canned (canned & jarred goods).
 *   - Salsa and refrigerated dips  -> snacks (eaten with chips).
 *   - Tortillas, naan, pita        -> bakery (bread).
 *   - Diapers, wipes, baby bath    -> personal-care; baby FOOD -> pantry.
 *   - Beer and wine                -> beverages (ignores state liquor-law splits).
 *   - Flowers, cards, gift cards,
 *     charcoal, chargers           -> other.
 *
 * `// store-dependent` marks entries where a reasonable shopper or a reasonable
 * store could justify a different section. Those are fair to treat as soft
 * failures when reporting accuracy.
 */

export const CATEGORIZATION_HOLDOUT: Array<[string, string]> = [
  // ---- produce (22) ----
  ["bananna", "produce"],
  ["2 lbs honeycrisp apples", "produce"],
  ["baby spinach 5oz", "produce"],
  ["cilantro", "produce"],
  ["plantains", "produce"],
  ["3 avocados", "produce"],
  ["romaine hearts", "produce"],
  ["yellow onions 3lb bag", "produce"],
  ["sweet potatoes", "produce"],
  ["cherry tomatoes pint", "produce"],
  ["bagged caesar salad kit", "produce"], // store-dependent (sometimes merchandised in deli/refrigerated)
  ["cauliflower rice", "produce"], // store-dependent (fresh produce vs frozen case)
  ["fresh ginger root", "produce"],
  ["seedless watermelon", "produce"],
  ["mushrooms 8oz", "produce"],
  ["jalapenos", "produce"],
  ["bell peppers x3", "produce"],
  ["lemons bag", "produce"],
  ["scallions", "produce"],
  ["pre cut pineapple", "produce"],
  ["brussel sprouts", "produce"],
  ["kale bunch", "produce"],

  // ---- meat (16) ----
  ["2 lbs ground turkey", "meat"],
  ["boneless skinless chicken breast", "meat"],
  ["bacon", "meat"], // store-dependent (packaged meat case vs near deli)
  ["ribeye steak", "meat"],
  ["pork tenderloin", "meat"],
  ["italian sausage links", "meat"],
  ["1lb ground beef 80/20", "meat"],
  ["chicken thighs family pack", "meat"],
  ["lamb chops", "meat"],
  ["ground pork", "meat"],
  ["turkey bacon", "meat"],
  ["beef stew meat", "meat"],
  ["hot dogs", "meat"], // store-dependent (often shelved with lunch meat near deli)
  ["chorizo", "meat"],
  ["whole chicken", "meat"],
  ["jimmy dean breakfast sausage", "meat"],

  // ---- seafood (12) ----
  ["salmon fillet 1lb", "seafood"],
  ["shrimp 16-20 ct", "seafood"],
  ["tilapia", "seafood"],
  ["ahi tuna steaks", "seafood"],
  ["bay scallops", "seafood"],
  ["cod fillets", "seafood"],
  ["crab legs", "seafood"],
  ["smoked salmon", "seafood"], // store-dependent (frequently in the deli/cheese case)
  ["mussels", "seafood"],
  ["imitation crab meat", "seafood"],
  ["lobster tail", "seafood"],
  ["fresh oysters", "seafood"],

  // ---- dairy (20) ----
  ["milk x2", "dairy"],
  ["2% milk gallon", "dairy"],
  ["cream cheese", "dairy"], // store-dependent (dairy case vs deli/cheese case)
  ["greek yogurt", "dairy"],
  ["yoghurt 4 pk", "dairy"],
  ["shredded mozzarella", "dairy"],
  ["unsalted butter", "dairy"],
  ["heavy whipping cream", "dairy"],
  ["sour cream", "dairy"],
  ["eggs dozen", "dairy"], // store-dependent (some stores give eggs their own section)
  ["half and half", "dairy"],
  ["string cheese", "dairy"],
  ["cottage cheese", "dairy"],
  ["oat milk", "dairy"], // store-dependent (shelf-stable cartons live in the beverage/pantry aisle)
  ["babybel", "dairy"],
  ["chobani flip", "dairy"],
  ["parmesan wedge", "dairy"], // store-dependent (specialty cheese counter = deli)
  ["paneer", "dairy"], // store-dependent (often in the international refrigerated set)
  ["whipped cream can", "dairy"],
  ["coffee creamer", "dairy"], // store-dependent (shelf-stable creamer sits in the coffee aisle)

  // ---- frozen (16) ----
  ["ice cream sandwiches", "frozen"],
  ["frozen orange juice concentrate", "frozen"],
  ["digiorno pizza", "frozen"],
  ["frozen peas", "frozen"],
  ["eggo waffles", "frozen"],
  ["ben & jerrys half baked", "frozen"],
  ["tater tots", "frozen"],
  ["frozen pierogies", "frozen"],
  ["bag of ice", "frozen"], // store-dependent (ice chest is often by the front end)
  ["hot pockets", "frozen"],
  ["frozen blueberries", "frozen"],
  ["totinos pizza rolls", "frozen"],
  ["frozen chicken nuggets", "frozen"],
  ["frozen edamame", "frozen"],
  ["cool whip", "frozen"], // store-dependent (freezer case, occasionally by the dairy)
  ["frozen shrimp ring", "frozen"], // store-dependent (sometimes stocked by the seafood counter)

  // ---- bakery (14) ----
  ["sourdough loaf", "bakery"],
  ["hamburger buns", "bakery"],
  ["everything bagels", "bakery"],
  ["naan", "bakery"], // store-dependent (bakery vs international aisle)
  ["tortillas", "bakery"], // store-dependent (bread aisle, international aisle, or by produce)
  ["croissants 4 pk", "bakery"],
  ["birthday cake", "bakery"],
  ["dinner rolls", "bakery"],
  ["english muffins", "bakery"], // store-dependent (bread aisle vs refrigerated)
  ["donuts half dozen", "bakery"],
  ["pita bread", "bakery"],
  ["wonder bread", "bakery"],
  ["blueberry muffins", "bakery"],
  ["baguette", "bakery"],

  // ---- deli (13) ----
  ["rotisserie chicken", "deli"],
  ["sliced turkey breast 1/2 lb", "deli"],
  ["boars head ham", "deli"],
  ["hummus", "deli"], // store-dependent (deli case vs refrigerated dips near produce)
  ["kalamata olives", "deli"], // store-dependent (olive bar vs jarred in the canned aisle)
  ["potato salad", "deli"],
  ["prosciutto", "deli"],
  ["swiss cheese slices deli", "deli"],
  ["chicken salad from deli", "deli"],
  ["mac and cheese from hot bar", "deli"],
  ["salami", "deli"], // store-dependent (deli counter vs packaged lunch meat)
  ["sushi tray", "deli"], // store-dependent (some stores treat sushi as its own counter)
  ["guacamole cups", "deli"], // store-dependent (refrigerated dips often sit in produce)

  // ---- pantry (24) ----
  ["cheerios", "pantry"],
  ["spaghetti 1 lb", "pantry"],
  ["jasmine rice 5lb", "pantry"],
  ["all purpose flour", "pantry"],
  ["almond flour", "pantry"], // store-dependent (baking aisle vs natural/gluten-free set)
  ["masa harina", "pantry"], // store-dependent (baking aisle vs international aisle)
  ["brown sugar", "pantry"],
  ["creamy peanut butter", "pantry"],
  ["quaker oats", "pantry"],
  ["raw almonds", "pantry"],
  ["craisins", "pantry"],
  ["elbow macaroni", "pantry"],
  ["panko breadcrumbs", "pantry"],
  ["chocolate chips", "pantry"],
  ["baking soda", "pantry"],
  ["quinoa", "pantry"],
  ["lentils dried", "pantry"],
  ["ramen noodles 12 pk", "pantry"],
  ["kraft mac and cheese box", "pantry"],
  ["pancake mix", "pantry"],
  ["vanilla extract", "pantry"], // store-dependent (baking aisle vs spice rack = condiments)
  ["honey nut cheerios 2 boxes", "pantry"],
  ["graham crackers", "pantry"], // store-dependent (baking aisle vs snack aisle)
  ["gerber baby food pouches", "pantry"], // store-dependent (baby aisle, often next to personal care)

  // ---- beverages (16) ----
  ["la croix 12 pk", "beverages"],
  ["coconut water", "beverages"],
  ["orange juice 59oz", "beverages"], // store-dependent (refrigerated juice sits by the dairy)
  ["diet coke 2 liter", "beverages"],
  ["gatorade blue", "beverages"],
  ["tea bags", "beverages"],
  ["seltzer water case", "beverages"],
  ["almond milk shelf stable", "beverages"], // store-dependent (aseptic cartons vs dairy case)
  ["red wine", "beverages"], // store-dependent (separate liquor store in many states)
  ["bud light 12 pk", "beverages"],
  ["kombucha", "beverages"], // store-dependent (refrigerated, often near dairy/natural foods)
  ["apple juice box 8pk", "beverages"],
  ["red bull 4 pack", "beverages"],
  ["ground coffee folgers", "beverages"],
  ["coffee beans", "beverages"], // store-dependent (coffee aisle; some lists treat it as pantry)
  ["sparkling water lime", "beverages"],

  // ---- snacks (16) ----
  ["goldfish", "snacks"],
  ["doritos nacho cheese", "snacks"],
  ["peanut butter cups", "snacks"], // store-dependent (candy aisle vs checkout lane)
  ["kind bars", "snacks"],
  ["tostitos salsa", "snacks"], // store-dependent (salsa is sometimes shelved as jarred/canned)
  ["ritz crackers", "snacks"],
  ["pretzel sticks", "snacks"],
  ["m&ms share size", "snacks"],
  ["popcorn 6 pk", "snacks"],
  ["clif bar chocolate chip", "snacks"],
  ["french onion dip", "snacks"], // store-dependent (refrigerated dip case near dairy)
  ["pirates booty", "snacks"],
  ["trail mix", "snacks"], // store-dependent (snack aisle vs bulk/baking nuts = pantry)
  ["oreos", "snacks"], // store-dependent (cookie aisle is sometimes grouped with bakery)
  ["tortilla chips", "snacks"],
  ["beef jerky", "snacks"], // store-dependent (snack aisle vs checkout vs meat dept)

  // ---- canned (16) ----
  ["chicken stock", "canned"], // store-dependent (soup aisle; cartons sometimes shelved separately)
  ["canned black beans", "canned"],
  ["campbells tomato soup", "canned"],
  ["diced tomatoes 28oz", "canned"],
  ["tuna in water 5 cans", "canned"],
  ["coconut milk can", "canned"], // store-dependent (international aisle in many stores)
  ["jar of marinara", "canned"], // store-dependent (usually shelved with pasta)
  ["strawberry jam", "canned"], // store-dependent (jam often sits with peanut butter in pantry)
  ["canned corn", "canned"],
  ["apple sauce cups", "canned"], // store-dependent (snack-cup sets wander to the snack aisle)
  ["chickpeas can", "canned"],
  ["canned pumpkin", "canned"], // store-dependent (moves to baking around the holidays)
  ["green chiles can", "canned"], // store-dependent (international/mexican aisle)
  ["mandarin oranges cups", "canned"],
  ["pickles jar", "canned"], // store-dependent (frequently with ketchup/mustard = condiments)
  ["refried beans", "canned"], // store-dependent (international/mexican aisle)

  // ---- condiments (20) ----
  ["heinz ketchup", "condiments"],
  ["olive oil 16oz", "condiments"],
  ["rice vinegar", "condiments"], // store-dependent (vinegar shelf vs international aisle)
  ["gochujang", "condiments"], // store-dependent (international aisle)
  ["tahini", "condiments"], // store-dependent (international or natural-foods aisle)
  ["miso paste", "condiments"], // store-dependent (often refrigerated in the international set)
  ["soy sauce", "condiments"],
  ["chocolate syrup", "condiments"], // store-dependent (ice cream toppings vs baking aisle)
  ["maple syrup", "condiments"], // store-dependent (often with pancake mix in pantry)
  ["ground cumin", "condiments"],
  ["hellmans mayo", "condiments"],
  ["sriracha", "condiments"],
  ["ranch dressing", "condiments"], // store-dependent (shelf dressing vs refrigerated dressing)
  ["dijon mustard", "condiments"],
  ["ghee", "condiments"], // store-dependent (cooking-oil shelf, international aisle, or dairy)
  ["taco seasoning packet", "condiments"], // store-dependent (spice rack vs mexican aisle)
  ["worcestershire sauce", "condiments"],
  ["balsamic vinegar", "condiments"],
  ["honey", "condiments"], // store-dependent (sweeteners vs jam/peanut butter shelf)
  ["hot sauce", "condiments"],

  // ---- household (18) ----
  ["tide", "household"],
  ["kleenex", "household"],
  ["tp", "household"],
  ["bounty paper towels", "household"],
  ["clorox wipes", "household"],
  ["dish soap dawn", "household"],
  ["13 gallon trash bags", "household"],
  ["swiffer refills", "household"],
  ["ziploc gallon bags", "household"],
  ["aluminum foil", "household"],
  ["laundry pods", "household"],
  ["purina cat food", "household"], // store-dependent (pet aisle; some apps use its own section)
  ["dog treats", "household"], // store-dependent (pet aisle)
  ["cat litter", "household"], // store-dependent (pet aisle)
  ["lightbulbs 60w", "household"],
  ["sponges 3 pk", "household"],
  ["dishwasher pods", "household"],
  ["batteries aa", "household"], // store-dependent (general merchandise or checkout endcap)

  // ---- personal-care (16) ----
  ["colgate toothpaste", "personal-care"],
  ["dove body wash", "personal-care"],
  ["ibuprofen 200mg", "personal-care"], // store-dependent (pharmacy counter area)
  ["tampons", "personal-care"],
  ["deodorant secret", "personal-care"],
  ["shampoo and conditioner", "personal-care"],
  ["band aids", "personal-care"],
  ["zyrtec 30ct", "personal-care"], // store-dependent (pharmacy)
  ["razors", "personal-care"],
  ["baby wipes", "personal-care"], // store-dependent (baby aisle)
  ["pampers size 4", "personal-care"], // store-dependent (baby aisle)
  ["sunscreen spf 50", "personal-care"], // store-dependent (seasonal endcap in summer)
  ["contact solution", "personal-care"],
  ["cough drops", "personal-care"], // store-dependent (pharmacy vs candy/checkout)
  ["vitamin d3", "personal-care"],
  ["hand sanitizer", "personal-care"], // store-dependent (health aisle vs front end)

  // ---- other (8) ----
  ["gift card", "other"],
  ["birthday card", "other"],
  ["flowers bouquet", "other"], // store-dependent (floral department)
  ["charcoal", "other"], // store-dependent (seasonal/grilling endcap, sometimes household)
  ["newspaper", "other"],
  ["reusable tote bag", "other"], // store-dependent (front end; arguably household)
  ["phone charger", "other"],
  ["propane tank exchange", "other"],
];
