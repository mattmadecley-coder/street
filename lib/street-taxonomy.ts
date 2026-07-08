export const STREET_TAXONOMY = {
  Footwear: ["Sneakers", "Cleats", "Sandals", "Slides", "Boots", "Slip-Ons", "Mules", "Slippers", "Loafers", "Flats", "Clogs", "Espadrilles", "Heels"],
  Apparel: ["Tops", "T-Shirts", "Shirts and Tops", "Hoodies", "Sweatshirts", "Knitwear"],
  Bottoms: ["Shorts", "Pants", "Jeans", "Sweatpants", "Skirts", "Trousers", "Joggers"],
  Outerwear: ["Jackets", "Vests", "Coats", "Parkas", "Anoraks", "Capes and Ponchos"],
  Dresses: ["Short Dresses", "Mid Dresses", "Long Dresses"],
  Swimwear: ["Swim Shorts", "Bikinis", "One Piece"],
  Tailoring: ["Blazers", "Suits", "Waistcoats"],
  "Underwear and Loungewear": ["Underwear", "Lingerie", "Loungewear"],
  Activewear: ["Leggings", "Sport Bras", "Sports Tops"],
  "Jumpsuits and Overalls": ["Jumpsuits and Overalls"],
  Sleepwear: ["Sleepwear"],
  Accessories: ["Hats", "Eyewear", "Socks and Tights", "Wallets", "Scarves", "Belts", "Technology", "Keychains and Lanyards", "Gloves", "Masks", "Hair Accessories", "Ties", "Travel", "Water Bottles", "Sports", "Umbrellas"],
  Bags: ["Shoulder Bags", "Tote Bags", "Top Handles", "Backpacks", "Crossbody Bags", "Pouches", "Duffles", "Belt Bags", "Clutches", "Bucket Bags"],
  Collectibles: ["Cards", "Figures", "Plushes", "Comics", "Objects"],
  Jewelry: ["Watches", "Necklaces", "Bracelets", "Rings", "Earrings", "Pins", "Brooches", "Fine Jewelry"],
  Home: ["Media", "Sports", "Objects", "Accessories", "Toys", "Art"],
  Other: ["Other"],
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

export const STREET_MENU_TAGS = [
  "camo", "graphic", "washed", "baggy", "moto", "racing", "workwear", "utility", "gothic", "skate", "y2k", "denim", "leather",
] as const satisfies readonly StreetTag[];

export const STREET_COLLECTIONS = [
  { label: "Just Dropped", href: "/catalog?sort=newest" },
  { label: "New In", href: "/catalog?sort=newest&availability=in_stock" },
  { label: "Most Wanted", href: "/catalog?tag=streetwear" },
  { label: "Street Selects", href: "/catalog?tag=luxury-streetwear" },
  { label: "Iconic Archival", href: "/catalog?tag=archive" },
  { label: "Under $100", href: "/catalog?max=100" },
  { label: "Under $200", href: "/catalog?max=200" },
  { label: "Instant", href: "/catalog?availability=in_stock&instant=1" },
] as const;

export const STREET_SORT_OPTIONS = [
  { label: "Newest", value: "" },
  { label: "Price (Low - High)", value: "price-low" },
  { label: "Price (High - Low)", value: "price-high" },
] as const;

export const STREET_FILTER_OPTIONS = {
  gender: ["Men", "Women", "Unisex"],
  condition: ["New", "Used"],
  instant: ["Instant"],
  availability: ["Available Now"],
} as const;

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
