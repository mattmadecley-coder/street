export type StreetProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sourceUrl: string;
  price: number;
  compareAtPrice?: number;
  stockStatus: "in_stock" | "sold_out";
  isPreorder: boolean;
  primaryImage: string;
  images: string[];
  colors: string[];
  sizes: string[];
  category: string;
  tags: string[];
  lastSyncedAt: string;
};

type ShopifyVariant = { id: number; price: string; compare_at_price: string | null; available: boolean; option1: string | null; option2: string | null; option3: string | null };
type ShopifyProduct = { id: number; title: string; handle: string; body_html: string | null; product_type: string; tags: string; options: Array<{ name: string; values: string[] }>; variants: ShopifyVariant[]; images: Array<{ src: string; position: number }> };
type ShopifyResponse = { products: ShopifyProduct[] };

const storeUrl = (process.env.STREET_FIRST_BRAND_URL ?? "https://www.seventyfouruniform.com").replace(/\/$/, "");
const candidateStoreUrls = [...new Set([storeUrl, storeUrl.replace("://www.", "://")])];
const colors = ["black", "white", "gray", "grey", "blue", "navy", "green", "army", "brown", "tan", "cream", "red", "purple", "yellow", "pink", "camo"];
const cleanText = (value = "") => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const titleCase = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());

function categoryFor(product: ShopifyProduct) {
  const value = `${product.product_type} ${product.title}`.toLowerCase();
  if (/denim|jean/.test(value)) return "Denim";
  if (/cargo|sweatpant|pants|trouser/.test(value)) return "Pants";
  if (/short/.test(value)) return "Shorts";
  if (/jacket|coat|outerwear/.test(value)) return "Outerwear";
  if (/hoodie|hooded|zip[ -]?up|sweatshirt/.test(value)) return "Hoodies & Sweatshirts";
  if (/tee|t-shirt|t shirt/.test(value)) return "T-Shirts";
  if (/polo|rugby|thermal|shirt/.test(value)) return "Tops";
  return product.product_type ? titleCase(product.product_type) : "Other";
}

function mapProduct(product: ShopifyProduct, sourceBase: string): StreetProduct {
  const body = cleanText(product.body_html ?? "");
  const sourceTags = product.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const haystack = `${product.title} ${product.product_type} ${sourceTags.join(" ")} ${body}`.toLowerCase();
  const colorOption = product.options.find((option) => /color|colour/.test(option.name));
  const productColors = colorOption?.values?.length ? colorOption.values : colors.filter((color) => haystack.includes(color)).map(titleCase);
  const sizeOption = product.options.find((option) => /size/.test(option.name));
  const productSizes = sizeOption?.values?.length ? sizeOption.values : [...new Set(product.variants.flatMap((variant) => [variant.option1, variant.option2, variant.option3]).filter((value): value is string => Boolean(value) && /^(xxs|xs|s|m|l|xl|xxl|\d{2,3})$/i.test(value!)))];
  const category = categoryFor(product);
  const generated = new Set(["streetwear", category.toLowerCase(), ...productColors.map((color) => color.toLowerCase()), ...sourceTags.map((tag) => tag.toLowerCase())]);
  const tagRules: Array<[RegExp, string[]]> = [
    [/moto|bike|motocross|racing/, ["moto", "motorcycle", "racing"]],
    [/baggy|wide/, ["baggy", "wide leg"]],
    [/cargo|utility|military|army|infantry/, ["utility", "workwear", "military"]],
    [/denim|jean|carpenter/, ["denim", "jeans", "workwear"]],
    [/camo|camouflage/, ["camo", "camouflage"]],
    [/faded|washed/, ["washed", "faded"]],
    [/zip/, ["zip-up"]],
  ];
  tagRules.forEach(([pattern, additions]) => { if (pattern.test(haystack)) additions.forEach((tag) => generated.add(tag)); });
  const productImages = [...product.images].sort((a, b) => a.position - b.position).map((image) => image.src);
  const firstVariant = product.variants[0];
  const available = product.variants.some((variant) => variant.available);
  return {
    id: `74-${product.id}`,
    slug: product.handle,
    title: product.title,
    description: body,
    sourceUrl: `${sourceBase}/products/${product.handle}`,
    price: Number.parseFloat(firstVariant?.price ?? "0"),
    compareAtPrice: firstVariant?.compare_at_price ? Number.parseFloat(firstVariant.compare_at_price) : undefined,
    stockStatus: available ? "in_stock" : "sold_out",
    isPreorder: /pre[ -]?order|made to order|made-to-order/.test(haystack),
    primaryImage: productImages[0] ?? "",
    images: productImages,
    colors: productColors,
    sizes: productSizes,
    category,
    tags: [...generated],
    lastSyncedAt: new Date().toISOString(),
  };
}

const fallbackNames = [
  ["Army Moto-Bike Jacket", 220, "Outerwear", ["Army", "Green"]],
  ["Black Moto-Bike Jacket", 220, "Outerwear", ["Black"]],
  ["Collegiate Baggy Denim", 140, "Denim", ["Blue"]],
  ["Camo Militant Zip Up", 140, "Hoodies & Sweatshirts", ["Camo", "Green"]],
  ["Double Knee Carpenter Denim", 140, "Denim", ["Blue"]],
  ["Green Army Utility Cargo", 140, "Pants", ["Green"]],
] as const;

const fallbackProducts: StreetProduct[] = fallbackNames.map(([title, price, category, productColors], index) => {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    id: `fallback-${index}`,
    slug,
    title,
    description: "Catalog information is refreshing from the brand source. Confirm details and availability on the brand website.",
    sourceUrl: `${storeUrl}/products/${slug}`,
    price,
    stockStatus: index === 3 ? "sold_out" : "in_stock",
    isPreorder: false,
    primaryImage: "",
    images: [],
    colors: [...productColors],
    sizes: [],
    category,
    tags: ["streetwear", category.toLowerCase(), ...productColors.map((color) => color.toLowerCase())],
    lastSyncedAt: new Date().toISOString(),
  };
});

export async function getCatalog(): Promise<{ products: StreetProduct[]; source: "live" | "fallback" }> {
  for (const sourceBase of candidateStoreUrls) {
    try {
      const response = await fetch(`${sourceBase}/products.json?limit=250`, {
        cache: "no-store",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)",
        },
      });
      if (!response.ok) continue;
      const text = await response.text();
      const data = JSON.parse(text) as ShopifyResponse;
      if (!data.products?.length) continue;
      return { products: data.products.map((product) => mapProduct(product, sourceBase)), source: "live" };
    } catch {
      // Try the next valid public store address before displaying a small fallback catalog.
    }
  }
  return { products: fallbackProducts, source: "fallback" };
}

export async function getProduct(slug: string) {
  const catalog = await getCatalog();
  return { ...catalog, product: catalog.products.find((product) => product.slug === slug) };
}
