import type { LearnedBrand, StoreCategory } from "./types";

interface BrandMapping {
  category: StoreCategory;
  commonName?: string;
}

export const BRAND_DATABASE: Record<string, BrandMapping> = {
  doritos: { category: "snacks", commonName: "Chips" },
  lays: { category: "snacks", commonName: "Chips" },
  "lay's": { category: "snacks", commonName: "Chips" },
  pringles: { category: "snacks", commonName: "Chips" },
  ruffles: { category: "snacks", commonName: "Chips" },
  cheetos: { category: "snacks", commonName: "Cheese Puffs" },
  fritos: { category: "snacks", commonName: "Corn Chips" },
  tostitos: { category: "snacks", commonName: "Tortilla Chips" },
  sunchips: { category: "snacks", commonName: "Chips" },
  kettle: { category: "snacks", commonName: "Chips" },
  popchips: { category: "snacks", commonName: "Chips" },

  oreos: { category: "snacks", commonName: "Cookies" },
  oreo: { category: "snacks", commonName: "Cookies" },
  "chips ahoy": { category: "snacks", commonName: "Cookies" },
  nilla: { category: "snacks", commonName: "Cookies" },
  "nutter butter": { category: "snacks", commonName: "Cookies" },
  milano: { category: "snacks", commonName: "Cookies" },
  "famous amos": { category: "snacks", commonName: "Cookies" },
  keebler: { category: "snacks", commonName: "Cookies" },
  "pepperidge farm": { category: "bakery", commonName: "Cookies" },
  nabisco: { category: "snacks", commonName: "Cookies" },

  coke: { category: "beverages", commonName: "Soda" },
  "coca-cola": { category: "beverages", commonName: "Soda" },
  "coca cola": { category: "beverages", commonName: "Soda" },
  pepsi: { category: "beverages", commonName: "Soda" },
  sprite: { category: "beverages", commonName: "Soda" },
  fanta: { category: "beverages", commonName: "Soda" },
  "dr pepper": { category: "beverages", commonName: "Soda" },
  "mountain dew": { category: "beverages", commonName: "Soda" },
  "7up": { category: "beverages", commonName: "Soda" },
  "sierra mist": { category: "beverages", commonName: "Soda" },
  crush: { category: "beverages", commonName: "Soda" },
  sunkist: { category: "beverages", commonName: "Soda" },
  "a&w": { category: "beverages", commonName: "Root Beer" },
  barq: { category: "beverages", commonName: "Root Beer" },
  "barq's": { category: "beverages", commonName: "Root Beer" },
  mug: { category: "beverages", commonName: "Root Beer" },

  gatorade: { category: "beverages", commonName: "Sports Drink" },
  powerade: { category: "beverages", commonName: "Sports Drink" },
  "vitamin water": { category: "beverages", commonName: "Enhanced Water" },
  vitaminwater: { category: "beverages", commonName: "Enhanced Water" },
  "smart water": { category: "beverages", commonName: "Water" },
  smartwater: { category: "beverages", commonName: "Water" },
  dasani: { category: "beverages", commonName: "Water" },
  aquafina: { category: "beverages", commonName: "Water" },
  fiji: { category: "beverages", commonName: "Water" },
  evian: { category: "beverages", commonName: "Water" },
  perrier: { category: "beverages", commonName: "Sparkling Water" },
  lacroix: { category: "beverages", commonName: "Sparkling Water" },
  "la croix": { category: "beverages", commonName: "Sparkling Water" },
  bubly: { category: "beverages", commonName: "Sparkling Water" },
  spindrift: { category: "beverages", commonName: "Sparkling Water" },

  redbull: { category: "beverages", commonName: "Energy Drink" },
  "red bull": { category: "beverages", commonName: "Energy Drink" },
  monster: { category: "beverages", commonName: "Energy Drink" },
  rockstar: { category: "beverages", commonName: "Energy Drink" },
  "5-hour energy": { category: "beverages", commonName: "Energy Drink" },

  starbucks: { category: "beverages", commonName: "Coffee" },
  folgers: { category: "beverages", commonName: "Coffee" },
  "maxwell house": { category: "beverages", commonName: "Coffee" },
  nescafe: { category: "beverages", commonName: "Coffee" },
  dunkin: { category: "beverages", commonName: "Coffee" },
  lavazza: { category: "beverages", commonName: "Coffee" },

  lipton: { category: "beverages", commonName: "Tea" },
  tetley: { category: "beverages", commonName: "Tea" },
  twinings: { category: "beverages", commonName: "Tea" },
  arizona: { category: "beverages", commonName: "Iced Tea" },
  snapple: { category: "beverages", commonName: "Tea" },

  tropicana: { category: "beverages", commonName: "Orange Juice" },
  "minute maid": { category: "beverages", commonName: "Juice" },
  simply: { category: "beverages", commonName: "Juice" },
  "ocean spray": { category: "beverages", commonName: "Cranberry Juice" },
  "naked juice": { category: "beverages", commonName: "Juice" },
  odwalla: { category: "beverages", commonName: "Juice" },
  v8: { category: "beverages", commonName: "Vegetable Juice" },

  heinz: { category: "condiments", commonName: "Ketchup" },
  hunts: { category: "condiments", commonName: "Ketchup" },
  "hunt's": { category: "condiments", commonName: "Ketchup" },
  "french's": { category: "condiments", commonName: "Mustard" },
  frenchs: { category: "condiments", commonName: "Mustard" },
  "grey poupon": { category: "condiments", commonName: "Mustard" },
  "hellmann's": { category: "condiments", commonName: "Mayonnaise" },
  hellmanns: { category: "condiments", commonName: "Mayonnaise" },
  "best foods": { category: "condiments", commonName: "Mayonnaise" },
  "miracle whip": { category: "condiments", commonName: "Mayonnaise" },
  "hidden valley": { category: "condiments", commonName: "Ranch Dressing" },
  kraft: { category: "condiments", commonName: "Dressing" },
  wishbone: { category: "condiments", commonName: "Dressing" },
  tabasco: { category: "condiments", commonName: "Hot Sauce" },
  sriracha: { category: "condiments", commonName: "Hot Sauce" },
  "frank's": { category: "condiments", commonName: "Hot Sauce" },
  franks: { category: "condiments", commonName: "Hot Sauce" },
  cholula: { category: "condiments", commonName: "Hot Sauce" },
  tapatio: { category: "condiments", commonName: "Hot Sauce" },

  ragu: { category: "canned", commonName: "Pasta Sauce" },
  prego: { category: "canned", commonName: "Pasta Sauce" },
  classico: { category: "canned", commonName: "Pasta Sauce" },
  "newman's own": { category: "canned", commonName: "Pasta Sauce" },
  "newmans own": { category: "canned", commonName: "Pasta Sauce" },
  barilla: { category: "pantry", commonName: "Pasta" },
  "de cecco": { category: "pantry", commonName: "Pasta" },
  ronzoni: { category: "pantry", commonName: "Pasta" },
  "mueller's": { category: "pantry", commonName: "Pasta" },
  muellers: { category: "pantry", commonName: "Pasta" },

  "campbell's": { category: "canned", commonName: "Soup" },
  campbells: { category: "canned", commonName: "Soup" },
  progresso: { category: "canned", commonName: "Soup" },
  "amy's": { category: "canned", commonName: "Soup" },
  amys: { category: "canned", commonName: "Soup" },

  "ben & jerry's": { category: "frozen", commonName: "Ice Cream" },
  "ben and jerrys": { category: "frozen", commonName: "Ice Cream" },
  "haagen-dazs": { category: "frozen", commonName: "Ice Cream" },
  "haagen dazs": { category: "frozen", commonName: "Ice Cream" },
  breyers: { category: "frozen", commonName: "Ice Cream" },
  "blue bell": { category: "frozen", commonName: "Ice Cream" },
  talenti: { category: "frozen", commonName: "Gelato" },
  klondike: { category: "frozen", commonName: "Ice Cream Bar" },
  popsicle: { category: "frozen", commonName: "Ice Pops" },

  "stouffer's": { category: "frozen", commonName: "Frozen Meal" },
  stouffers: { category: "frozen", commonName: "Frozen Meal" },
  "lean cuisine": { category: "frozen", commonName: "Frozen Meal" },
  "hungry man": { category: "frozen", commonName: "Frozen Meal" },
  "marie callender's": { category: "frozen", commonName: "Frozen Meal" },
  "marie callenders": { category: "frozen", commonName: "Frozen Meal" },
  "hot pocket": { category: "frozen", commonName: "Hot Pockets" },
  "hot pockets": { category: "frozen", commonName: "Hot Pockets" },
  "totino's": { category: "frozen", commonName: "Frozen Pizza" },
  totinos: { category: "frozen", commonName: "Frozen Pizza" },
  digiorno: { category: "frozen", commonName: "Frozen Pizza" },
  "red baron": { category: "frozen", commonName: "Frozen Pizza" },
  tombstone: { category: "frozen", commonName: "Frozen Pizza" },
  "california pizza kitchen": {
    category: "frozen",
    commonName: "Frozen Pizza",
  },

  "birds eye": { category: "frozen", commonName: "Frozen Vegetables" },
  "green giant": { category: "frozen", commonName: "Frozen Vegetables" },
  "ore-ida": { category: "frozen", commonName: "Frozen Potatoes" },
  "ore ida": { category: "frozen", commonName: "Frozen Potatoes" },

  eggo: { category: "frozen", commonName: "Frozen Waffles" },
  pillsbury: { category: "bakery", commonName: "Baked Goods" },

  "wonder bread": { category: "bakery", commonName: "Bread" },
  sunbeam: { category: "bakery", commonName: "Bread" },
  "thomas'": { category: "bakery", commonName: "English Muffins" },
  thomas: { category: "bakery", commonName: "English Muffins" },
  "sara lee": { category: "bakery", commonName: "Bread" },
  "entenmann's": { category: "bakery", commonName: "Baked Goods" },
  entenmanns: { category: "bakery", commonName: "Baked Goods" },
  hostess: { category: "bakery", commonName: "Snack Cakes" },
  "little debbie": { category: "bakery", commonName: "Snack Cakes" },
  tastykake: { category: "bakery", commonName: "Snack Cakes" },
  "drake's": { category: "bakery", commonName: "Snack Cakes" },
  drakes: { category: "bakery", commonName: "Snack Cakes" },

  mission: { category: "bakery", commonName: "Tortillas" },
  "old el paso": { category: "pantry", commonName: "Taco Shells" },
  "taco bell": { category: "pantry", commonName: "Taco Shells" },

  cheerios: { category: "pantry", commonName: "Cereal" },
  "frosted flakes": { category: "pantry", commonName: "Cereal" },
  "corn flakes": { category: "pantry", commonName: "Cereal" },
  "fruit loops": { category: "pantry", commonName: "Cereal" },
  "froot loops": { category: "pantry", commonName: "Cereal" },
  "lucky charms": { category: "pantry", commonName: "Cereal" },
  "cinnamon toast crunch": { category: "pantry", commonName: "Cereal" },
  "cap'n crunch": { category: "pantry", commonName: "Cereal" },
  "capn crunch": { category: "pantry", commonName: "Cereal" },
  "captain crunch": { category: "pantry", commonName: "Cereal" },
  "rice krispies": { category: "pantry", commonName: "Cereal" },
  "special k": { category: "pantry", commonName: "Cereal" },
  "raisin bran": { category: "pantry", commonName: "Cereal" },
  kix: { category: "pantry", commonName: "Cereal" },
  trix: { category: "pantry", commonName: "Cereal" },
  "cocoa puffs": { category: "pantry", commonName: "Cereal" },
  "honey nut cheerios": { category: "pantry", commonName: "Cereal" },
  quaker: { category: "pantry", commonName: "Oatmeal" },

  "pop-tarts": { category: "pantry", commonName: "Pop-Tarts" },
  "pop tarts": { category: "pantry", commonName: "Pop-Tarts" },
  "nature valley": { category: "snacks", commonName: "Granola Bars" },
  "quaker chewy": { category: "snacks", commonName: "Granola Bars" },
  "clif bar": { category: "snacks", commonName: "Energy Bars" },
  kind: { category: "snacks", commonName: "Snack Bars" },
  larabar: { category: "snacks", commonName: "Energy Bars" },
  rxbar: { category: "snacks", commonName: "Protein Bars" },
  quest: { category: "snacks", commonName: "Protein Bars" },

  jif: { category: "pantry", commonName: "Peanut Butter" },
  skippy: { category: "pantry", commonName: "Peanut Butter" },
  "peter pan": { category: "pantry", commonName: "Peanut Butter" },
  smuckers: { category: "canned", commonName: "Jam" },
  "smucker's": { category: "canned", commonName: "Jam" },
  "welch's": { category: "canned", commonName: "Jelly" },
  welchs: { category: "canned", commonName: "Jelly" },

  planters: { category: "snacks", commonName: "Nuts" },
  "blue diamond": { category: "snacks", commonName: "Almonds" },
  "wonderful pistachios": { category: "snacks", commonName: "Pistachios" },

  "hershey's": { category: "snacks", commonName: "Chocolate" },
  hersheys: { category: "snacks", commonName: "Chocolate" },
  "reese's": { category: "snacks", commonName: "Peanut Butter Cups" },
  reeses: { category: "snacks", commonName: "Peanut Butter Cups" },
  "kit kat": { category: "snacks", commonName: "Chocolate" },
  kitkat: { category: "snacks", commonName: "Chocolate" },
  snickers: { category: "snacks", commonName: "Chocolate Bar" },
  "m&m's": { category: "snacks", commonName: "Candy" },
  "m&ms": { category: "snacks", commonName: "Candy" },
  skittles: { category: "snacks", commonName: "Candy" },
  starburst: { category: "snacks", commonName: "Candy" },
  twix: { category: "snacks", commonName: "Chocolate Bar" },
  "milky way": { category: "snacks", commonName: "Chocolate Bar" },
  "3 musketeers": { category: "snacks", commonName: "Chocolate Bar" },
  dove: { category: "snacks", commonName: "Chocolate" },
  ghirardelli: { category: "snacks", commonName: "Chocolate" },
  lindt: { category: "snacks", commonName: "Chocolate" },
  toblerone: { category: "snacks", commonName: "Chocolate" },
  "ferrero rocher": { category: "snacks", commonName: "Chocolate" },

  trident: { category: "snacks", commonName: "Gum" },
  orbit: { category: "snacks", commonName: "Gum" },
  extra: { category: "snacks", commonName: "Gum" },
  "wrigley's": { category: "snacks", commonName: "Gum" },
  wrigleys: { category: "snacks", commonName: "Gum" },
  altoids: { category: "snacks", commonName: "Mints" },
  "tic tac": { category: "snacks", commonName: "Mints" },
  mentos: { category: "snacks", commonName: "Mints" },

  haribo: { category: "snacks", commonName: "Gummy Bears" },
  trolli: { category: "snacks", commonName: "Gummy Candy" },
  "sour patch kids": { category: "snacks", commonName: "Candy" },
  "swedish fish": { category: "snacks", commonName: "Candy" },
  nerds: { category: "snacks", commonName: "Candy" },
  smarties: { category: "snacks", commonName: "Candy" },

  "jack link's": { category: "snacks", commonName: "Beef Jerky" },
  "jack links": { category: "snacks", commonName: "Beef Jerky" },
  "slim jim": { category: "snacks", commonName: "Meat Sticks" },

  velveeta: { category: "dairy", commonName: "Cheese" },
  "kraft singles": { category: "dairy", commonName: "American Cheese" },
  philadelphia: { category: "dairy", commonName: "Cream Cheese" },
  tillamook: { category: "dairy", commonName: "Cheese" },
  sargento: { category: "dairy", commonName: "Cheese" },
  cabot: { category: "dairy", commonName: "Cheese" },
  "cracker barrel": { category: "dairy", commonName: "Cheese" },
  "laughing cow": { category: "dairy", commonName: "Cheese" },
  babybel: { category: "dairy", commonName: "Cheese" },
  "string cheese": { category: "dairy", commonName: "String Cheese" },

  yoplait: { category: "dairy", commonName: "Yogurt" },
  dannon: { category: "dairy", commonName: "Yogurt" },
  chobani: { category: "dairy", commonName: "Greek Yogurt" },
  fage: { category: "dairy", commonName: "Greek Yogurt" },
  oikos: { category: "dairy", commonName: "Greek Yogurt" },
  activia: { category: "dairy", commonName: "Yogurt" },
  gogurt: { category: "dairy", commonName: "Yogurt Tubes" },
  "greek gods": { category: "dairy", commonName: "Greek Yogurt" },

  horizon: { category: "dairy", commonName: "Organic Milk" },
  "organic valley": { category: "dairy", commonName: "Organic Milk" },
  "land o'lakes": { category: "dairy", commonName: "Butter" },
  "land o lakes": { category: "dairy", commonName: "Butter" },
  kerrygold: { category: "dairy", commonName: "Butter" },
  "country crock": { category: "dairy", commonName: "Margarine" },
  "i can't believe it's not butter": {
    category: "dairy",
    commonName: "Margarine",
  },
  "blue bonnet": { category: "dairy", commonName: "Margarine" },
  "reddi-wip": { category: "dairy", commonName: "Whipped Cream" },
  "reddi wip": { category: "dairy", commonName: "Whipped Cream" },
  "cool whip": { category: "frozen", commonName: "Whipped Topping" },

  daisy: { category: "dairy", commonName: "Sour Cream" },
  "breakstone's": { category: "dairy", commonName: "Sour Cream" },
  breakstones: { category: "dairy", commonName: "Sour Cream" },
  knudsen: { category: "dairy", commonName: "Sour Cream" },

  silk: { category: "beverages", commonName: "Almond Milk" },
  "almond breeze": { category: "beverages", commonName: "Almond Milk" },
  "so delicious": { category: "beverages", commonName: "Non-Dairy Milk" },
  oatly: { category: "beverages", commonName: "Oat Milk" },
  "califia farms": { category: "beverages", commonName: "Plant Milk" },

  "oscar mayer": { category: "deli", commonName: "Deli Meat" },
  "hillshire farm": { category: "deli", commonName: "Deli Meat" },
  "boar's head": { category: "deli", commonName: "Deli Meat" },
  "boars head": { category: "deli", commonName: "Deli Meat" },
  hormel: { category: "deli", commonName: "Deli Meat" },

  "jimmy dean": { category: "meat", commonName: "Sausage" },
  johnsonville: { category: "meat", commonName: "Sausage" },
  "hebrew national": { category: "meat", commonName: "Hot Dogs" },
  "ball park": { category: "meat", commonName: "Hot Dogs" },
  nathans: { category: "meat", commonName: "Hot Dogs" },
  "nathan's": { category: "meat", commonName: "Hot Dogs" },

  perdue: { category: "meat", commonName: "Chicken" },
  tyson: { category: "meat", commonName: "Chicken" },
  "foster farms": { category: "meat", commonName: "Chicken" },

  "bumble bee": { category: "canned", commonName: "Canned Tuna" },
  starkist: { category: "canned", commonName: "Canned Tuna" },
  "chicken of the sea": { category: "canned", commonName: "Canned Tuna" },

  "bush's": { category: "canned", commonName: "Baked Beans" },
  bushs: { category: "canned", commonName: "Baked Beans" },
  goya: { category: "canned", commonName: "Canned Beans" },
  "del monte": { category: "canned", commonName: "Canned Vegetables" },
  dole: { category: "produce", commonName: "Fruit" },
  chiquita: { category: "produce", commonName: "Bananas" },
  "driscoll's": { category: "produce", commonName: "Berries" },
  driscolls: { category: "produce", commonName: "Berries" },

  "uncle ben's": { category: "pantry", commonName: "Rice" },
  "uncle bens": { category: "pantry", commonName: "Rice" },
  "minute rice": { category: "pantry", commonName: "Rice" },
  "rice-a-roni": { category: "pantry", commonName: "Rice Mix" },
  "rice a roni": { category: "pantry", commonName: "Rice Mix" },
  "near east": { category: "pantry", commonName: "Rice Pilaf" },
  knorr: { category: "pantry", commonName: "Side Dishes" },
  "lipton sides": { category: "pantry", commonName: "Side Dishes" },

  "betty crocker": { category: "pantry", commonName: "Baking Mix" },
  bisquick: { category: "pantry", commonName: "Baking Mix" },
  jiffy: { category: "pantry", commonName: "Corn Muffin Mix" },
  "duncan hines": { category: "pantry", commonName: "Cake Mix" },
  "king arthur": { category: "pantry", commonName: "Flour" },
  "gold medal": { category: "pantry", commonName: "Flour" },
  domino: { category: "pantry", commonName: "Sugar" },
  "c&h": { category: "pantry", commonName: "Sugar" },

  crisco: { category: "pantry", commonName: "Shortening" },
  wesson: { category: "condiments", commonName: "Cooking Oil" },
  pam: { category: "condiments", commonName: "Cooking Spray" },

  mccormick: { category: "condiments", commonName: "Spices" },
  morton: { category: "condiments", commonName: "Salt" },

  "aunt jemima": { category: "condiments", commonName: "Syrup" },
  "mrs. butterworth's": { category: "condiments", commonName: "Syrup" },
  "mrs butterworths": { category: "condiments", commonName: "Syrup" },
  "log cabin": { category: "condiments", commonName: "Syrup" },

  "kellogg's": { category: "pantry", commonName: "Cereal" },
  kelloggs: { category: "pantry", commonName: "Cereal" },
  post: { category: "pantry", commonName: "Cereal" },
  "general mills": { category: "pantry", commonName: "Cereal" },

  nabob: { category: "beverages", commonName: "Coffee" },

  charmin: { category: "household", commonName: "Toilet Paper" },
  cottonelle: { category: "household", commonName: "Toilet Paper" },
  scott: { category: "household", commonName: "Toilet Paper" },
  "angel soft": { category: "household", commonName: "Toilet Paper" },
  "quilted northern": { category: "household", commonName: "Toilet Paper" },

  bounty: { category: "household", commonName: "Paper Towels" },
  brawny: { category: "household", commonName: "Paper Towels" },
  viva: { category: "household", commonName: "Paper Towels" },

  kleenex: { category: "household", commonName: "Tissues" },
  puffs: { category: "household", commonName: "Tissues" },

  tide: { category: "household", commonName: "Laundry Detergent" },
  gain: { category: "household", commonName: "Laundry Detergent" },
  downy: { category: "household", commonName: "Fabric Softener" },
  all: { category: "household", commonName: "Laundry Detergent" },
  "arm & hammer": { category: "household", commonName: "Laundry Detergent" },
  "arm and hammer": { category: "household", commonName: "Laundry Detergent" },
  purex: { category: "household", commonName: "Laundry Detergent" },
  oxiclean: { category: "household", commonName: "Stain Remover" },
  shout: { category: "household", commonName: "Stain Remover" },
  clorox: { category: "household", commonName: "Bleach" },

  dawn: { category: "household", commonName: "Dish Soap" },
  palmolive: { category: "household", commonName: "Dish Soap" },
  ajax: { category: "household", commonName: "Dish Soap" },
  cascade: { category: "household", commonName: "Dishwasher Detergent" },
  finish: { category: "household", commonName: "Dishwasher Detergent" },

  lysol: { category: "household", commonName: "Disinfectant" },
  windex: { category: "household", commonName: "Glass Cleaner" },
  "mr. clean": { category: "household", commonName: "All-Purpose Cleaner" },
  "mr clean": { category: "household", commonName: "All-Purpose Cleaner" },
  pledge: { category: "household", commonName: "Furniture Polish" },
  febreze: { category: "household", commonName: "Air Freshener" },
  glade: { category: "household", commonName: "Air Freshener" },
  "air wick": { category: "household", commonName: "Air Freshener" },

  glad: { category: "household", commonName: "Trash Bags" },
  hefty: { category: "household", commonName: "Trash Bags" },
  reynolds: { category: "household", commonName: "Aluminum Foil" },
  "saran wrap": { category: "household", commonName: "Plastic Wrap" },
  ziploc: { category: "household", commonName: "Storage Bags" },

  duracell: { category: "household", commonName: "Batteries" },
  energizer: { category: "household", commonName: "Batteries" },

  crest: { category: "personal-care", commonName: "Toothpaste" },
  colgate: { category: "personal-care", commonName: "Toothpaste" },
  sensodyne: { category: "personal-care", commonName: "Toothpaste" },
  aquafresh: { category: "personal-care", commonName: "Toothpaste" },
  "oral-b": { category: "personal-care", commonName: "Toothbrush" },
  "oral b": { category: "personal-care", commonName: "Toothbrush" },
  listerine: { category: "personal-care", commonName: "Mouthwash" },
  scope: { category: "personal-care", commonName: "Mouthwash" },
  act: { category: "personal-care", commonName: "Mouthwash" },

  "head & shoulders": { category: "personal-care", commonName: "Shampoo" },
  "head and shoulders": { category: "personal-care", commonName: "Shampoo" },
  pantene: { category: "personal-care", commonName: "Shampoo" },
  "herbal essences": { category: "personal-care", commonName: "Shampoo" },
  "irish spring": { category: "personal-care", commonName: "Soap" },
  dial: { category: "personal-care", commonName: "Soap" },
  "lever 2000": { category: "personal-care", commonName: "Soap" },
  olay: { category: "personal-care", commonName: "Moisturizer" },
  nivea: { category: "personal-care", commonName: "Moisturizer" },
  cetaphil: { category: "personal-care", commonName: "Cleanser" },
  neutrogena: { category: "personal-care", commonName: "Skin Care" },
  aveeno: { category: "personal-care", commonName: "Lotion" },
  lubriderm: { category: "personal-care", commonName: "Lotion" },
  eucerin: { category: "personal-care", commonName: "Lotion" },
  vaseline: { category: "personal-care", commonName: "Petroleum Jelly" },
  aquaphor: { category: "personal-care", commonName: "Healing Ointment" },

  gillette: { category: "personal-care", commonName: "Razors" },
  schick: { category: "personal-care", commonName: "Razors" },
  bic: { category: "personal-care", commonName: "Razors" },
  barbasol: { category: "personal-care", commonName: "Shaving Cream" },
  edge: { category: "personal-care", commonName: "Shaving Gel" },

  degree: { category: "personal-care", commonName: "Deodorant" },
  secret: { category: "personal-care", commonName: "Deodorant" },
  sure: { category: "personal-care", commonName: "Deodorant" },
  "old spice": { category: "personal-care", commonName: "Deodorant" },
  axe: { category: "personal-care", commonName: "Body Spray" },
  "right guard": { category: "personal-care", commonName: "Deodorant" },
  speedstick: { category: "personal-care", commonName: "Deodorant" },
  "speed stick": { category: "personal-care", commonName: "Deodorant" },

  chapstick: { category: "personal-care", commonName: "Lip Balm" },
  "burt's bees": { category: "personal-care", commonName: "Lip Balm" },
  "burts bees": { category: "personal-care", commonName: "Lip Balm" },
  eos: { category: "personal-care", commonName: "Lip Balm" },
  blistex: { category: "personal-care", commonName: "Lip Balm" },

  coppertone: { category: "personal-care", commonName: "Sunscreen" },
  "banana boat": { category: "personal-care", commonName: "Sunscreen" },

  "band-aid": { category: "personal-care", commonName: "Bandages" },
  "band aid": { category: "personal-care", commonName: "Bandages" },
  neosporin: { category: "personal-care", commonName: "Antibiotic Ointment" },

  advil: { category: "personal-care", commonName: "Ibuprofen" },
  motrin: { category: "personal-care", commonName: "Ibuprofen" },
  aleve: { category: "personal-care", commonName: "Pain Relief" },
  tylenol: { category: "personal-care", commonName: "Acetaminophen" },
  excedrin: { category: "personal-care", commonName: "Pain Relief" },
  bayer: { category: "personal-care", commonName: "Aspirin" },
  aspirin: { category: "personal-care", commonName: "Aspirin" },
  tums: { category: "personal-care", commonName: "Antacid" },
  "pepto-bismol": {
    category: "personal-care",
    commonName: "Upset Stomach Relief",
  },
  "pepto bismol": {
    category: "personal-care",
    commonName: "Upset Stomach Relief",
  },
  zyrtec: { category: "personal-care", commonName: "Allergy Medicine" },
  claritin: { category: "personal-care", commonName: "Allergy Medicine" },
  allegra: { category: "personal-care", commonName: "Allergy Medicine" },
  benadryl: { category: "personal-care", commonName: "Allergy Medicine" },
  mucinex: { category: "personal-care", commonName: "Cough Medicine" },
  robitussin: { category: "personal-care", commonName: "Cough Syrup" },
  nyquil: { category: "personal-care", commonName: "Cold Medicine" },
  dayquil: { category: "personal-care", commonName: "Cold Medicine" },
  sudafed: { category: "personal-care", commonName: "Decongestant" },
  vicks: { category: "personal-care", commonName: "Cold Relief" },

  centrum: { category: "personal-care", commonName: "Multivitamin" },
  "one a day": { category: "personal-care", commonName: "Multivitamin" },
  flintstones: { category: "personal-care", commonName: "Kids Vitamins" },
  "nature made": { category: "personal-care", commonName: "Vitamins" },
  vitafusion: { category: "personal-care", commonName: "Gummy Vitamins" },

  huggies: { category: "personal-care", commonName: "Diapers" },
  pampers: { category: "personal-care", commonName: "Diapers" },
  luvs: { category: "personal-care", commonName: "Diapers" },
  "baby wipes": { category: "personal-care", commonName: "Baby Wipes" },
  "wet ones": { category: "personal-care", commonName: "Wipes" },
  gerber: { category: "personal-care", commonName: "Baby Food" },
  similac: { category: "personal-care", commonName: "Baby Formula" },
  enfamil: { category: "personal-care", commonName: "Baby Formula" },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word (plus optional plural) match. Unanchored substring matching made
// short brand keys like 'all', 'gain', 'extra', 'crush' and 'dove' fire on
// 'gallon', 'extra virgin olive oil', 'crushed tomatoes', 'dove body wash'.
// Compiled once at module load, longest brand first so the most specific key
// wins (e.g. 'kraft singles' before 'kraft').
const BRAND_MATCHERS: Array<{
  matcher: RegExp;
  mapping: BrandMapping;
  length: number;
}> = Object.entries(BRAND_DATABASE)
  .sort(([a], [b]) => b.length - a.length)
  .map(([brand, mapping]) => ({
    matcher: new RegExp(`(^|[^a-z])${escapeRegExp(brand)}(e?s)?([^a-z]|$)`),
    mapping,
    length: brand.length,
  }));

// minLength lets a caller ask for distinctive brands only: short brand keys
// ('extra', 'dove', 'kind') are also ordinary words and must not outrank
// product keywords.
export function recognizeBrand(
  itemName: string,
  minLength = 0,
): { category: StoreCategory; commonName?: string } | null {
  const normalized = itemName.toLowerCase().trim();

  for (const { matcher, mapping, length } of BRAND_MATCHERS) {
    if (length >= minLength && matcher.test(normalized)) {
      return mapping;
    }
  }

  return null;
}

// A learned brand applies when the item name starts with it. Brands lead a
// name ('wegmans bread'); a learned 'cream' must not capture 'ice cream'. The
// reverse direction (brand contains item) is deliberately absent: after
// correcting 'oat milk' it made a plain 'milk' inherit that category. Only
// trusted brands count, and the longest (most specific) one wins.
export function findLearnedBrandMatch(
  itemName: string,
  learnedBrands: LearnedBrand[],
): LearnedBrand | null {
  const normalized = itemName.toLowerCase().trim();
  let best: LearnedBrand | null = null;

  for (const brand of learnedBrands) {
    if (brand.confidence < 0.5 || brand.occurrences < 2) continue;
    const key = brand.brand.toLowerCase().trim();
    if (!key || (best && key.length <= best.brand.length)) continue;
    if (
      new RegExp(`^${escapeRegExp(key)}(e?s)?([^a-z]|$)`).test(normalized)
    ) {
      best = brand;
    }
  }

  return best;
}

export function normalizeBrandName(itemName: string): string {
  const brandInfo = recognizeBrand(itemName);
  if (brandInfo?.commonName) {
    return brandInfo.commonName;
  }
  return itemName;
}
