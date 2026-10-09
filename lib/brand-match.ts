/**
 * Brand-aware, typo-tolerant helpers for storefront search.
 *
 * Why this exists: the search index only matches whole words, so a shopper
 * typing "revice hoodie" (or misspelling it "revise hoodie") found nothing for
 * the brand "Revicedenim" -- "revice" is not a word in the index. These helpers
 * resolve a typed word to the brand(s) it most plausibly means (exact, prefix
 * or a small edit-distance typo, against the brand name, each word of it, and
 * its slug), so the query builder can OR the brand's real name in next to the
 * literal word. They are pure and have no imports, so they are cheap to test.
 */

export type SearchBrand = { slug: string; name: string };

function norm(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Optimal-string-alignment (Damerau-Levenshtein) distance; a swap counts as 1. Bails out early past `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** How many typos a word of this length may contain: none under 5 letters, one up to 7, two beyond. */
function allowedTypos(length: number) {
  return length >= 8 ? 2 : length >= 5 ? 1 : 0;
}

function brandKeys(brand: SearchBrand): string[] {
  const words = norm(brand.name).split(" ").filter((word) => word.length >= 3);
  const compact = norm(brand.name).replace(/ /g, "");
  const slugCompact = norm(brand.slug).replace(/ /g, "");
  return [...new Set([compact, slugCompact, ...words].filter((key) => key.length >= 3))];
}

/**
 * Brands a typed word plausibly refers to. `isReserved` flags ordinary
 * product words ("hoodie", "black", "shorts") that must never be fuzzily
 * pulled toward a brand -- they may still match a brand whose name is exactly
 * that word. Short words (< 4 letters) never match a brand.
 */
export function matchBrandsForTerm(
  word: string,
  brands: readonly SearchBrand[],
  isReserved: (term: string) => boolean = () => false,
): SearchBrand[] {
  const term = norm(word).replace(/ /g, "");
  if (term.length < 4) return [];
  const reserved = isReserved(term);
  const typos = allowedTypos(term.length);
  const exact: SearchBrand[] = [];
  const loose: SearchBrand[] = [];

  for (const brand of brands) {
    const keys = brandKeys(brand);
    if (keys.includes(term)) {
      exact.push(brand);
      continue;
    }
    if (reserved) continue;
    const matched = keys.some((key) => {
      if (key.startsWith(term)) return true; // "revic" -> revicedenim
      if (!typos || term[0] !== key[0]) return false; // typos are almost never in the first letter
      if (editDistance(term, key, typos) <= typos) return true; // "greddy" -> greedy
      // typo inside the prefix of a longer key: "revise" vs "revice|denim"
      return key.length > term.length && editDistance(term, key.slice(0, term.length), typos) <= typos;
    });
    if (matched) loose.push(brand);
  }

  // A fragment matching lots of brands ("stre") is too generic to trust; keep only exact hits then.
  return exact.length + loose.length > 4 ? exact : [...exact, ...loose];
}

/** The phrase to OR into the search for a brand: its normalized name ("greedy unit"). */
export function brandSearchPhrase(brand: SearchBrand): string {
  return norm(brand.name);
}

/**
 * Best-effort spelling correction for a whole query against a vocabulary of
 * known words (brand words plus category/color terms). Only fixes words of 4+
 * letters that are not already known, within the same typo allowance and the
 * same first letter. Returns the corrected query, or null when nothing changed.
 */
export function correctQueryTypos(query: string, vocabulary: Iterable<string>): string | null {
  const vocab = [...new Set([...vocabulary].map((term) => norm(term)).filter((term) => term.length >= 4 && !term.includes(" ")))];
  const known = new Set(vocab);
  let changed = false;
  const words = norm(query).split(" ").filter(Boolean).map((word) => {
    const typos = allowedTypos(word.length);
    if (word.length < 4 || !typos || known.has(word) || known.has(word.replace(/s$/, ""))) return word;
    let best: { term: string; distance: number } | null = null;
    for (const term of vocab) {
      if (term[0] !== word[0]) continue;
      const distance = editDistance(word, term, typos);
      if (distance <= typos && (!best || distance < best.distance)) best = { term, distance };
    }
    if (!best) return word;
    changed = true;
    return best.term;
  });
  return changed ? words.join(" ") : null;
}
