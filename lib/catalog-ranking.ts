type SearchableCatalogProduct = {
  brandSlug: string;
  title: string;
  description: string;
  brandName: string;
  category: string;
  tags: string[];
  colors: string[];
  streetGroup?: string;
  streetCategory?: string;
  streetType?: string;
  streetDetail?: string;
};

type SearchRankEntry<T> = {
  product: T;
  index: number;
  matchedTerms: number;
  score: number;
};

const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "or", "the", "to", "with"]);
const SEARCH_EQUIVALENCE_GROUPS = [
  ["jacket", "outerwear", "coat"],
  ["pant", "bottom", "trouser", "jean"],
  ["shoe", "footwear", "sneaker", "boot"],
  ["tee", "tshirt", "shirt"],
  ["hoodie", "sweatshirt", "pullover"],
  ["black", "charcoal", "onyx", "jet black"],
] as const;

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bt[\s-]?shirts?\b/g, "tshirt")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeSearchTerm(value: string) {
  const term = normalizeSearchText(value);
  const irregular: Record<string, string> = {
    bottoms: "bottom",
    boots: "boot",
    coats: "coat",
    hoodies: "hoodie",
    jackets: "jacket",
    jeans: "jean",
    pants: "pant",
    shirts: "shirt",
    shoes: "shoe",
    sneakers: "sneaker",
    tees: "tee",
    trousers: "trouser",
  };
  if (irregular[term]) return irregular[term];
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/.test(term)) return term.slice(0, -2);
  if (term.endsWith("s") && !term.endsWith("ss") && term.length > 3) return term.slice(0, -1);
  return term;
}

function pluralizeSearchTerm(term: string) {
  if (!term || term.includes(" ")) return term;
  if (term.endsWith("y") && !/[aeiou]y$/.test(term)) return `${term.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(term)) return `${term}es`;
  return `${term}s`;
}

function searchTermVariants(term: string) {
  const canonical = singularizeSearchTerm(term);
  const variants = new Set([normalizeSearchText(term), canonical, pluralizeSearchTerm(canonical)]);
  const group = SEARCH_EQUIVALENCE_GROUPS.find((items) => items.some((item) => singularizeSearchTerm(item) === canonical));
  for (const item of group ?? []) {
    const normalized = normalizeSearchText(item);
    const singular = singularizeSearchTerm(normalized);
    variants.add(normalized);
    variants.add(singular);
    variants.add(pluralizeSearchTerm(singular));
  }
  return [...variants].filter(Boolean);
}

function meaningfulSearchTerms(query: string) {
  const seen = new Set<string>();
  return normalizeSearchText(query)
    .split(" ")
    .map(singularizeSearchTerm)
    .filter((term) => term.length > 1 && !SEARCH_STOP_WORDS.has(term))
    .filter((term) => {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    })
    .map((term) => ({ term, variants: searchTermVariants(term) }));
}

function matchStrength(text: string, variants: string[]) {
  if (!text) return 0;
  const padded = ` ${text} `;
  let best = 0;
  for (const variant of variants) {
    if (!variant) continue;
    if (text === variant) best = Math.max(best, 3);
    else if (padded.includes(` ${variant} `)) best = Math.max(best, 2);
    else if (text.includes(variant)) best = Math.max(best, 1);
  }
  return best;
}

function searchRankEntries<T extends SearchableCatalogProduct>(products: T[], query?: string): SearchRankEntry<T>[] {
  const terms = meaningfulSearchTerms(query ?? "");
  if (!terms.length) return products.map((product, index) => ({ product, index, matchedTerms: 0, score: 0 }));

  return products
    .map((product, index) => {
      const fields: Array<[string, number]> = [
        [normalizeSearchText(product.title), 12],
        [normalizeSearchText(product.brandName), 10],
        [normalizeSearchText(product.tags.join(" ")), 9],
        [normalizeSearchText(product.colors.join(" ")), 9],
        [normalizeSearchText(product.streetGroup), 8],
        [normalizeSearchText(product.streetCategory), 9],
        [normalizeSearchText(product.streetType), 9],
        [normalizeSearchText(product.streetDetail), 8],
        [normalizeSearchText(product.category), 6],
        [normalizeSearchText(product.description), 4],
      ];

      let matchedTerms = 0;
      let score = 0;
      for (const term of terms) {
        let termMatched = false;
        let termScore = 0;
        for (const [field, weight] of fields) {
          const strength = matchStrength(field, term.variants);
          if (!strength) continue;
          termMatched = true;
          termScore += weight * strength;
        }
        if (termMatched) {
          matchedTerms += 1;
          score += termScore;
        }
      }
      return { product, index, matchedTerms, score };
    })
    .filter((entry) => entry.matchedTerms > 0)
    .sort((a, b) => b.matchedTerms - a.matchedTerms || b.score - a.score || a.index - b.index);
}

/** Search ranking stays deterministic and database-backed; no model call occurs here. */
export function rankProductsForSearch<T extends SearchableCatalogProduct>(products: T[], query?: string): T[] {
  return searchRankEntries(products, query).map((entry) => entry.product);
}

/** Keep the requested base ordering while removing products that do not match the search. */
export function filterProductsForSearch<T extends SearchableCatalogProduct>(products: T[], query?: string): T[] {
  const matchingIndexes = new Set(searchRankEntries(products, query).map((entry) => entry.index));
  return products.filter((_, index) => matchingIndexes.has(index));
}

type BrandQueue<T> = { brand: string; products: T[] };

function brandKey(product: { brandSlug: string }) {
  return product.brandSlug || "__unbranded";
}

/**
 * Fair deterministic round-robin over complete per-brand queues. Queue order
 * preserves the incoming rank within each brand; brands are visited in first-
 * appearance order, and exhausted queues are skipped automatically.
 */
export function balanceProductsByBrand<T extends { brandSlug: string }>(products: T[], previousBrand = ""): T[] {
  if (products.length < 2) return products;

  const queues = new Map<string, T[]>();
  for (const product of products) {
    const brand = brandKey(product);
    const queue = queues.get(brand);
    if (queue) queue.push(product);
    else queues.set(brand, [product]);
  }

  const active: BrandQueue<T>[] = [...queues.entries()].map(([brand, brandProducts]) => ({ brand, products: brandProducts }));
  const output: T[] = [];
  let cursor = 0;
  let lastBrand = previousBrand;

  while (active.length) {
    let selected = -1;
    for (let offset = 0; offset < active.length; offset += 1) {
      const candidate = (cursor + offset) % active.length;
      if (active[candidate].brand !== lastBrand || active.length === 1) {
        selected = candidate;
        break;
      }
    }
    if (selected < 0) selected = cursor % active.length;

    const queue = active[selected];
    const product = queue.products.shift();
    if (!product) {
      active.splice(selected, 1);
      cursor = active.length ? selected % active.length : 0;
      continue;
    }

    output.push(product);
    lastBrand = queue.brand;
    if (!queue.products.length) {
      active.splice(selected, 1);
      cursor = active.length ? selected % active.length : 0;
    } else {
      cursor = (selected + 1) % active.length;
    }
  }

  return output;
}

/**
 * Relevance tiers protect strong text matches. Matched-term count is the first
 * boundary; within that, a product is assigned to a 10%-wide score band versus
 * the strongest product with the same matched-term count. Brands are balanced
 * only inside a tier, never by promoting a weaker tier above a stronger one.
 */
export function balanceProductsForRelevance<T extends SearchableCatalogProduct>(products: T[], query?: string): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return balanceProductsByBrand(products);

  const ranked = searchRankEntries(products, query);
  if (ranked.length < 2) return ranked.map((entry) => entry.product);

  const maxScoreByMatchedTerms = new Map<number, number>();
  for (const entry of ranked) {
    maxScoreByMatchedTerms.set(entry.matchedTerms, Math.max(maxScoreByMatchedTerms.get(entry.matchedTerms) ?? 0, entry.score));
  }

  const tiers = new Map<string, T[]>();
  const tierOrder: string[] = [];
  for (const entry of ranked) {
    const maxScore = maxScoreByMatchedTerms.get(entry.matchedTerms) ?? entry.score;
    const scoreBand = maxScore > 0 ? Math.min(10, Math.floor((entry.score / maxScore) * 10)) : 0;
    const key = `${entry.matchedTerms}:${scoreBand}`;
    if (!tiers.has(key)) {
      tiers.set(key, []);
      tierOrder.push(key);
    }
    tiers.get(key)?.push(entry.product);
  }

  const output: T[] = [];
  let previousBrand = "";
  for (const key of tierOrder) {
    const balancedTier = balanceProductsByBrand(tiers.get(key) ?? [], previousBrand);
    output.push(...balancedTier);
    previousBrand = balancedTier.length ? brandKey(balancedTier[balancedTier.length - 1]) : previousBrand;
  }
  return output;
}
