// Street's product taxonomy, rebuilt to mirror GOAT's real category menu
// (goat.com header nav + sidebar filters + __NEXT_DATA__ query params:
// categories / types / activities). Reconstructed from partial data — GOAT
// doesn't expose the full tree in one place, so parent/child assignments in
// the more obscure groups (Media, Objects, Art, Sports) are inferred and
// worth double-checking against the live site if those ever matter for
// Street. Apparel, Footwear, Accessories, Bags, Jewelry, Collectibles are
// the groups most likely to matter soon and are the best-sourced here.
//
// Shape: Group -> Category -> Type -> Detail[]. A category or type with no
// further breakdown yet is just `{}`. This is a 4-level hierarchy; not every
// branch uses all 4 levels.

export const STREET_TAXONOMY = {
  Footwear: {
    Sneakers: {},
    Boots: {},
    Cleats: {},
    Sandals: {},
    "Slip-Ons": {},
    Clogs: {},
    Heels: {},
    Espadrilles: {},
  },
  Apparel: {
    Tops: {
      "T-Shirts": ["Short Sleeve T-Shirts", "Long Sleeve T-Shirts", "Tanks"],
      Hoodies: ["Zip Ups", "Half Zips"],
      Sweatshirts: ["Crewnecks"],
      "Shirts and Tops": ["Button Up Shirts", "Polos", "Jerseys", "Flannels", "Overshirts", "Cropped Tops", "Bodysuits", "Blouses"],
      Knitwear: ["Sweaters", "Cardigans", "Turtlenecks"],
    },
    Bottoms: {
      Jeans: {},
      Sweatpants: {},
      Joggers: {},
      Trousers: {},
      Skirts: {},
      Pants: ["Track Pants", "Cargo Pants", "Leather Pants"],
      Shorts: ["Cargo Shorts"],
    },
    Outerwear: {
      Jackets: ["Track Jackets", "Bomber Jackets", "Denim Jackets", "Puffer Jackets", "Varsity Jackets", "Down Jackets", "Fleece Jackets", "Coach Jackets", "Leather Jackets", "Shearling Jackets", "Faux Fur Jackets"],
      Coats: ["Trench Coats", "Overcoats", "Peacoats"],
      Vests: {},
      Parkas: {},
      Anoraks: {},
      "Capes and Ponchos": {},
    },
    Dresses: {
      "Short Dresses": {},
      "Mid Dresses": {},
      "Long Dresses": {},
    },
    Swimwear: {
      "Swim Shorts": {},
      Bikinis: ["Bikini Tops", "Bikini Bottoms"],
      "One Piece": {},
    },
    Tailoring: {
      Blazers: {},
      Waistcoats: {},
      Sets: {},
    },
    "Underwear and Loungewear": {
      Underwear: {},
      Lingerie: {},
      Loungewear: {},
    },
    Activewear: {
      Leggings: {},
      "Sport Bras": {},
      "Sports Tops": {},
    },
    Sleepwear: {},
    "Jumpsuits and Overalls": {},
  },
  Accessories: {
    Hats: {
      Caps: ["Snapbacks", "Baseball Caps", "Truckers"],
      Beanies: {},
      "Bucket Hats": {},
      Balaclavas: {},
      Berets: {},
      Fedoras: {},
      "Beach Hats": {},
      "Aviator Hats": {},
      Western: {},
    },
    Eyewear: { Sunglasses: {}, Glasses: {}, Goggles: {} },
    "Socks and Tights": {},
    Wallets: { Cardholders: {}, Bifolds: {}, "Coin Pouches": {}, "Money Clips": {} },
    Scarves: { "Neck Scarves": {} },
    Belts: {},
    Technology: { "Phone Cases and Holders": {}, "Earpod Holders": {}, Headphones: {}, "Phone Accessories": {} },
    Gloves: {},
    "Keychains and Lanyards": {},
    Ties: {},
    "Hair Accessories": { Headbands: {}, Hairbands: {}, Chokers: {} },
    Travel: {},
    Masks: {},
    "Water Bottles": {},
    Umbrellas: {},
    // Added after real catalog data surfaced branded towels with nowhere to go.
    Towels: {},
    // Added after real catalog data surfaced brand decals/stickers with no
    // home — the classifier was outputting category:"none" for these, which
    // isn't a valid enum value and made the whole classification fail.
    "Decals and Stickers": {},
  },
  Bags: {
    "Shoulder Bags": {},
    "Tote Bags": {},
    Backpacks: {},
    "Top Handles": {},
    Pouches: {},
    "Crossbody Bags": {},
    Duffles: {},
    Clutches: {},
    "Belt Bags": {},
    "Bucket Bags": {},
  },
  Jewelry: {
    Necklaces: {},
    Bracelets: {},
    Rings: {},
    Earrings: {},
    Watches: {},
    Pins: {},
    Brooches: {},
    "Fine Jewelry": {},
  },
  Collectibles: {
    Toys: {},
    Comics: {},
    "Trading Cards": {},
    Plushes: {},
    "Skate Boards": {},
  },
  // Media, Objects, Art, Sports below: Street doesn't sell in these today,
  // and GOAT's own tree for them is thinner in the data we pulled — treat
  // these as a starting point, not verified against the live site.
  Media: { Music: {}, Books: {}, Magazines: {} },
  Objects: { Vases: {}, Furniture: {}, Cushions: {}, Glassware: {}, Incense: {}, Rugs: {} },
  Art: { Prints: {}, Photography: {} },
  // Added Football after real catalog data included a branded football with
  // no matching category — Basketball/Soccer/Baseball were already covered
  // but American football (the ball itself) wasn't.
  Sports: { Ski: {}, Skate: {}, Racing: {}, Soccer: {}, Tennis: {}, Basketball: {}, Baseball: {}, Football: {}, "Soccer Balls": {}, Mouthguards: {} },
  // Added Automotive/Gift Cards after real catalog data surfaced a car-culture
  // brand (license plate frames, floormats, detailing spray, valve stem caps)
  // that has no equivalent anywhere in GOAT's taxonomy — Other was previously
  // an empty catch-all group with no categories, so nothing could validly
  // classify into it at all.
  Other: { Automotive: {}, "Gift Cards": {} },
} as const;

// Footwear-only facet (GOAT's "activity" filter on sneakers/boots/etc).
// Distinct from the group/category/type/detail hierarchy above — it's an
// orthogonal tag, not a taxonomy level, so a sneaker is e.g.
// Footwear > Sneakers *and* activity = "Running".
export const FOOTWEAR_ACTIVITIES = ["Lifestyle", "Running", "Basketball", "Skateboarding", "Other"] as const;
export type FootwearActivity = (typeof FOOTWEAR_ACTIVITIES)[number];

export type StreetTaxonomy = typeof STREET_TAXONOMY;
export type StreetGroup = keyof StreetTaxonomy;

// --- Facets unrelated to the group/category/type/detail hierarchy above ---
// (colors, free-form descriptive tags). Unchanged from the original taxonomy.

export const STREET_COLORS = [
  "black", "white", "grey", "silver", "brown", "tan", "beige", "cream", "blue", "navy", "green", "olive", "red", "pink", "purple", "yellow", "orange", "gold", "multicolor",
] as const;

export const STREET_TAGS = [
  "camo", "animal-print", "checkerboard", "striped", "plaid", "floral", "tie-dye", "all-over-print", "graphic", "logo", "text-print", "photo-print", "skull", "flame", "racing-graphic", "sports-graphic", "abstract",
  "washed", "vintage-wash", "acid-wash", "faded", "distressed", "destroyed", "bleached", "raw-denim", "light-wash", "medium-wash", "dark-wash", "coated", "cracked-print", "sun-faded",
  "oversized", "boxy", "cropped", "fitted", "slim", "straight-leg", "relaxed", "baggy", "wide-leg", "flare", "stacked", "low-rise", "high-rise", "longline",
  "streetwear", "vintage", "archive", "gothic", "punk", "skate", "moto", "racing", "workwear", "utility", "military", "minimal", "collegiate", "sportswear", "y2k", "western", "techwear", "luxury-streetwear",
  "zip-up", "pullover", "button-up", "double-knee", "carpenter", "cargo-pocket", "multi-pocket", "panelled", "patchwork", "embroidered", "rhinestone", "studded", "frayed", "raw-hem", "reversible", "quilted", "puffer", "layered", "cut-out", "lace-up",
  "denim", "leather", "faux-leather", "cotton", "fleece", "nylon", "canvas", "mesh", "knit", "wool", "suede", "corduroy", "jersey",
  "water-resistant", "waterproof", "insulated", "lightweight", "breathable", "thermal", "summer", "winter",
] as const;

export type StreetTag = (typeof STREET_TAGS)[number];
export type StreetColor = (typeof STREET_COLORS)[number];

export const STREET_TAG_ALIASES: Record<string, StreetTag> = {
  camouflage: "camo", "camo print": "camo", woodland: "camo", "digital camo": "camo", "desert camo": "camo", "tiger stripe": "camo", "military print": "camo",
  "animal print": "animal-print", checker: "checkerboard", stripes: "striped", plaid: "plaid", tartan: "plaid",
  "zip hoodie": "zip-up", "zip-up hoodie": "zip-up", "double knee": "double-knee", "cargo pockets": "cargo-pocket", carpenter: "carpenter",
  distressed: "distressed", ripped: "distressed", baggy: "baggy", oversized: "oversized", washed: "washed", vintage: "vintage", racing: "racing", moto: "moto",
};

// --- Hierarchy helpers -----------------------------------------------------

type CategoryNode = Record<string, unknown>;

function categoryNode(group: string, category: string): CategoryNode | null {
  const groupNode = (STREET_TAXONOMY as Record<string, Record<string, CategoryNode>>)[group];
  return groupNode?.[category] ?? null;
}

export function isStreetGroup(value: string): value is StreetGroup {
  return value in STREET_TAXONOMY;
}

export function categoriesForGroup(group: string): string[] {
  const groupNode = (STREET_TAXONOMY as Record<string, Record<string, CategoryNode>>)[group];
  return groupNode ? Object.keys(groupNode) : [];
}

export function isStreetCategory(group: string, category: string): boolean {
  return categoryNode(group, category) !== null;
}

/** Level-3 "types" under a category. Empty array if this category has no further breakdown. */
export function typesForCategory(group: string, category: string): string[] {
  const node = categoryNode(group, category);
  return node ? Object.keys(node) : [];
}

export function isStreetType(group: string, category: string, type: string): boolean {
  return typesForCategory(group, category).includes(type);
}

/** Level-4 "details" under a type. Empty array if this type has no further breakdown. */
export function detailsForType(group: string, category: string, type: string): string[] {
  const node = categoryNode(group, category);
  const typeValue = node?.[type];
  return Array.isArray(typeValue) ? [...typeValue] : [];
}

export function isStreetDetail(group: string, category: string, type: string, detail: string): boolean {
  return detailsForType(group, category, type).includes(detail);
}

const categoryToGroup = new Map<string, StreetGroup>(
  Object.entries(STREET_TAXONOMY).flatMap(([group, categories]) => Object.keys(categories).map((category) => [category, group as StreetGroup] as const)),
);

/** Reverse lookup: given just a category name, which group is it under. */
export function groupForStreetCategory(category: string): StreetGroup | null {
  return categoryToGroup.get(category) ?? null;
}

export function isFootwearActivity(value: string): value is FootwearActivity {
  return (FOOTWEAR_ACTIVITIES as readonly string[]).includes(value);
}

export function normalizeFootwearActivity(value: string): FootwearActivity | null {
  const normalized = value.trim();
  const match = FOOTWEAR_ACTIVITIES.find((activity) => activity.toLowerCase() === normalized.toLowerCase());
  return match ?? null;
}

export function normalizeStreetSearchToken(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if ((STREET_TAGS as readonly string[]).includes(normalized)) return normalized;
  return STREET_TAG_ALIASES[normalized] ?? null;
}

// --- Flat lists, for building AI schema enums (hierarchy consistency is
// then checked in code — see ai-product-classifier.ts — rather than trying
// to express "type must belong to category" as JSON-schema branching across
// a tree this size). Category names are unique across groups in this tree,
// same for types and details, so flattening doesn't lose information.

export const ALL_STREET_CATEGORIES = Object.values(STREET_TAXONOMY).flatMap((categories) => Object.keys(categories));

export const ALL_STREET_TYPES = Object.values(STREET_TAXONOMY).flatMap((categories) =>
  Object.values(categories).flatMap((category) => Object.keys(category as CategoryNode)),
);

export const ALL_STREET_DETAILS = Object.values(STREET_TAXONOMY).flatMap((categories) =>
  Object.values(categories).flatMap((category) =>
    Object.values(category as CategoryNode).flatMap((types) => (Array.isArray(types) ? types : [])),
  ),
);
