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

// Every group below fixes the same class of bug: "jeans" used to be lumped
// into the same flat synonym list as "pant"/"bottom"/"trouser", so it
// inherited every variant in that list and matched track pants, joggers,
// cargo pants -- anything tagged as a "pant" -- not just jeans (reported by
// Matthew, fixed, then generalized here to every group that had the same
// shape). The fix: split each group into `broad` umbrella terms and
// `specific` sibling terms. An umbrella term ("footwear") fans out to every
// specific type below it (sneaker, boot, sandal, slide, ...) since a broad
// search should surface the whole category. A specific term ("sneaker")
// only bubbles UP to the umbrella terms -- never sideways to another
// specific sibling ("boot") -- because a boot is not a sneaker, the same
// way a jogger is not a pair of jeans. Where a group has no real
// umbrella/sibling structure (jean/denim, tee/tshirt, color names -- these
// are just alternate names for the same thing), `specific` stays empty and
// the group behaves as a plain mutual synonym set, same as before.
type SearchEquivalenceGroup = { broad: readonly string[]; specific: readonly string[] };
const SEARCH_EQUIVALENCE_GROUPS: readonly SearchEquivalenceGroup[] = [
  // "Jackets" and "Coats" are distinct sibling categories in the catalog
  // (Track/Bomber/Denim/Puffer... Jackets vs Trench/Overcoat/Peacoat...
  // Coats) -- searching one must not pull in the other. "outerwear" is the
  // umbrella that legitimately covers both.
  { broad: ["outerwear"], specific: ["jacket", "coat"] },
  // Genuinely interchangeable shopper vocabulary ("red denim" == "red
  // jeans"), and neither term is an umbrella over the other, so this stays
  // its own tight mutual pair -- deliberately not merged into the general
  // bottoms group below (that merge was the original "jeans" bug).
  { broad: ["jean", "denim"], specific: [] },
  // "pant" and "trouser" are the same garment (US/UK terms) and "bottom" is
  // the plain-English umbrella for both -- all three are true synonyms of
  // each other, so this stays a flat mutual group. Jeans, joggers,
  // sweatpants, shorts and skirts are siblings elsewhere in the catalog and
  // deliberately excluded here.
  { broad: ["pant", "bottom", "trouser"], specific: [] },
  // Sneakers, boots, sandals and slides are distinct sibling categories --
  // searching "sneakers" must not surface boots. "shoe" and "footwear" are
  // the umbrella terms that legitimately cover all of them.
  { broad: ["shoe", "footwear"], specific: ["sneaker", "boot", "sandal", "slide"] },
  // Same garment, two names -- a flat mutual pair. "shirt" alone is
  // deliberately left out: in this catalog it usually means a button-up/
  // collared shirt, a distinct sibling category from T-shirts.
  { broad: ["tee", "tshirt"], specific: [] },
  // "sweatshirt" and "pullover" are the umbrella terms; "hoodie" (has a
  // hood) and "crewneck" (doesn't) are distinct sibling categories that
  // must not match each other.
  { broad: ["sweatshirt", "pullover"], specific: ["hoodie", "crewneck"] },
  // "hat" is used colloquially as the umbrella for all headwear, but "cap"
  // and "beanie" are distinct sibling categories that must not match each
  // other.
  { broad: ["hat"], specific: ["cap", "beanie"] },
  // True alternate names for the same shade, not sibling categories -- a
  // full mutual group is correct here.
  { broad: ["black", "charcoal", "onyx", "jet black"], specific: [] },
];

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
    beanies: "beanie",
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

  for (const group of SEARCH_EQUIVALENCE_GROUPS) {
    const isBroad = group.broad.some((item) => singularizeSearchTerm(item) === canonical);
    const isSpecific = !isBroad && group.specific.some((item) => singularizeSearchTerm(item) === canonical);
    if (!isBroad && !isSpecific) continue;

    // Broad/umbrella terms fan out to the whole group; a specific term only
    // bubbles up to the umbrella terms, never sideways to a sibling -- see
    // the comment on SEARCH_EQUIVALENCE_GROUPS above.
    const additions = isBroad ? [...group.broad, ...group.specific] : group.broad;
    for (const item of additions) {
      const normalized = normalizeSearchText(item);
      const singular = singularizeSearchTerm(normalized);
      variants.add(normalized);
      variants.add(singular);
      variants.add(pluralizeSearchTerm(singular));
    }
    break; // a term belongs to at most one group
  }

  return [...variants].filter(Boolean);
}

/**
 * Builds a Postgres `to_tsquery`-compatible boolean expression from the same
 * synonym/equivalence logic as the in-memory ranker above, so the database
 * index (products.search_vector, see the search_products_ranked migration)
 * can do the matching instead of pulling every candidate row into Node to
 * string-match. Distinct user words are AND'd together; each word's
 * synonym variants are OR'd within it. A multi-word variant (e.g. "jet
 * black") becomes a `<->`-joined phrase. Returns null when the query has no
 * meaningful terms (all stop words / empty) -- callers should fall back to
 * the in-memory path in that case rather than sending an empty tsquery.
 */
export function buildSearchTsQuery(query: string): string | null {
  const terms = meaningfulSearchTerms(query);
  if (!terms.length) return null;

  const groups = terms.map(({ variants }) => {
    const lexemes = variants
      .map((variant) => variant.split(" ").filter(Boolean).join("<->"))
      .filter(Boolean);
    const unique = [...new Set(lexemes)];
    if (!unique.length) return null;
    return unique.length > 1 ? `(${unique.join(" | ")})` : unique[0];
  }).filter((group): group is string => Boolean(group));

  return groups.length ? groups.join(" & ") : null;
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

export type RankedSearchEntry = { id: string; brandSlug: string; rank: number };

/**
 * Same tiering idea as balanceProductsForRelevance, adapted for results that
 * already came back ranked and filtered from search_products_ranked (a
 * Postgres ts_rank score per id, no per-field matchedTerms breakdown
 * available client-side). Buckets by rank relative to the top score in
 * 10%-wide bands, then balances brands within each band -- so one brand
 * with many strong matches still can't bury a weaker match from another
 * brand within the same relevance band.
 */
export function balanceRankedEntriesForRelevance(entries: RankedSearchEntry[]): RankedSearchEntry[] {
  if (entries.length < 2) return entries;

  const maxRank = entries.reduce((max, entry) => Math.max(max, entry.rank), 0);
  const tiers = new Map<number, RankedSearchEntry[]>();
  const tierOrder: number[] = [];
  for (const entry of entries) {
    const band = maxRank > 0 ? Math.min(10, Math.floor((entry.rank / maxRank) * 10)) : 0;
    if (!tiers.has(band)) {
      tiers.set(band, []);
      tierOrder.push(band);
    }
    tiers.get(band)?.push(entry);
  }

  const output: RankedSearchEntry[] = [];
  let previousBrand = "";
  for (const band of tierOrder) {
    const balanced = balanceProductsByBrand(
      (tiers.get(band) ?? []).map((entry) => ({ ...entry, brandSlug: entry.brandSlug || "__unbranded" })),
      previousBrand
    );
    output.push(...balanced);
    previousBrand = balanced.length ? brandKey(balanced[balanced.length - 1]) : previousBrand;
  }
  return output;
}
