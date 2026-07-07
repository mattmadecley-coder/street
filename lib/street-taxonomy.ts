export const STREET_TAXONOMY = {
  Apparel: ["T-Shirts", "Long Sleeves", "Hoodies & Sweatshirts", "Sweaters & Knitwear", "Shirts & Overshirts", "Jerseys & Polos", "Tanks"],
  Bottoms: ["Jeans", "Cargos & Utility Pants", "Pants & Trousers", "Sweatpants & Joggers", "Track Pants", "Shorts", "Jorts"],
  Outerwear: ["Jackets", "Coats", "Vests", "Windbreakers", "Leather Jackets", "Denim Jackets"],
  Footwear: ["Sneakers", "Boots", "Slides & Sandals", "Other Footwear"],
  Accessories: ["Hats & Headwear", "Bags", "Jewelry", "Belts", "Eyewear", "Scarves & Gloves", "Socks", "Other Accessories"],
  Lifestyle: ["Stickers & Decals", "Keychains", "Collectibles", "Home & Objects", "Other"],
} as const;

export type StreetGroup = keyof typeof STREET_TAXONOMY;
export type StreetCategory = (typeof STREET_TAXONOMY)[StreetGroup][number];

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
  camouflage: "camo",
  "camo print": "camo",
  woodland: "camo",
  "digital camo": "camo",
  "desert camo": "camo",
  "tiger stripe": "camo",
  "military print": "camo",
  "animal print": "animal-print",
  checker: "checkerboard",
  stripes: "striped",
  plaid: "plaid",
  tartan: "plaid",
  "zip hoodie": "zip-up",
  "zip-up hoodie": "zip-up",
  "double knee": "double-knee",
  "cargo pockets": "cargo-pocket",
  carpenter: "carpenter",
  distressed: "distressed",
  ripped: "distressed",
  baggy: "baggy",
  oversized: "oversized",
  washed: "washed",
  vintage: "vintage",
  racing: "racing",
  moto: "moto",
};

const categoryToGroup = new Map<StreetCategory, StreetGroup>(
  Object.entries(STREET_TAXONOMY).flatMap(([group, categories]) => categories.map((category) => [category, group as StreetGroup] as const)),
);

export function isStreetGroup(value: string): value is StreetGroup {
  return value in STREET_TAXONOMY;
}

export function isStreetCategoryForGroup(group: StreetGroup, category: string): category is StreetCategory {
  return (STREET_TAXONOMY[group] as readonly string[]).includes(category);
}

export function groupForStreetCategory(category: string): StreetGroup | null {
  return categoryToGroup.get(category as StreetCategory) ?? null;
}

export function normalizeStreetSearchToken(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if ((STREET_TAGS as readonly string[]).includes(normalized)) return normalized;
  return STREET_TAG_ALIASES[normalized] ?? null;
}
