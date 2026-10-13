import { isStreetGroup } from "@/lib/street-taxonomy";

/**
 * One description of "which products", shared by the admin product filters, saved views and smart
 * collections. Every field is optional; an empty criteria matches every live product. Values come
 * from forms or stored JSON, so `cleanCriteria` validates everything before it reaches a query.
 */
export type ProductCriteria = {
  /** Words that must all appear in the product title. */
  q?: string;
  /** Brand slugs (any of). */
  brands?: string[];
  group?: string;
  category?: string;
  type?: string;
  /** Street tags (all of). */
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  stock?: "in_stock" | "sold_out";
  /** Only products first imported within this many days. */
  addedWithinDays?: number;
  /** Only products with a markdown (compare-at price above price). Checked after the query. */
  onSale?: boolean;
};

export const MAX_BRANDS = 40;
export const MAX_TAGS = 10;

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const number = (value: unknown): number | undefined => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 100000 ? Math.round(parsed * 100) / 100 : undefined;
};

/** Validates and trims criteria from untrusted input. Unknown or malformed fields are dropped. */
export function cleanCriteria(input: unknown): ProductCriteria {
  const raw = (typeof input === "object" && input ? input : {}) as Record<string, unknown>;
  const out: ProductCriteria = {};
  const q = text(raw.q, 120);
  if (q) out.q = q;
  const brandInput = Array.isArray(raw.brands) ? raw.brands : typeof raw.brands === "string" ? raw.brands.split(",") : [];
  const brands = [...new Set(brandInput.map((slug) => String(slug).trim().toLowerCase()).filter((slug) => SLUG.test(slug)))].slice(0, MAX_BRANDS);
  if (brands.length) out.brands = brands;
  const group = text(raw.group, 60);
  if (group && isStreetGroup(group)) out.group = group;
  const category = text(raw.category, 80);
  if (category && out.group) out.category = category;
  const type = text(raw.type, 80);
  if (type && out.category) out.type = type;
  const tagInput = Array.isArray(raw.tags) ? raw.tags : typeof raw.tags === "string" ? raw.tags.split(",") : [];
  const tags = [...new Set(tagInput.map((tag) => text(tag, 40)).filter(Boolean))].slice(0, MAX_TAGS);
  if (tags.length) out.tags = tags;
  const minPrice = number(raw.minPrice);
  const maxPrice = number(raw.maxPrice);
  if (minPrice !== undefined) out.minPrice = minPrice;
  if (maxPrice !== undefined && (minPrice === undefined || maxPrice >= minPrice)) out.maxPrice = maxPrice;
  if (raw.stock === "in_stock" || raw.stock === "sold_out") out.stock = raw.stock;
  const days = Number(raw.addedWithinDays);
  if (Number.isInteger(days) && days >= 1 && days <= 3650) out.addedWithinDays = days;
  if (raw.onSale === true || raw.onSale === "true" || raw.onSale === "on") out.onSale = true;
  return out;
}

export function isEmptyCriteria(criteria: ProductCriteria): boolean {
  return Object.keys(criteria).length === 0;
}

const quote = (value: string) => `"${value.replace(/["\\]/g, "")}"`;

/**
 * PostgREST query parameters for the criteria, as [name, value] pairs (a name can repeat). Only
 * covers live catalog products: active, not hidden. The caller adds select, order and paging.
 */
export function criteriaToParams(criteria: ProductCriteria, nowMs: number = Date.now()): Array<[string, string]> {
  const params: Array<[string, string]> = [["is_active", "eq.true"], ["is_hidden", "eq.false"]];
  for (const word of (criteria.q ?? "").split(/\s+/).filter(Boolean)) params.push(["title", `ilike.*${word.replace(/[%,()*]/g, " ").trim()}*`]);
  if (criteria.brands?.length) params.push(["brands.slug", `in.(${criteria.brands.map(quote).join(",")})`]);
  if (criteria.group) params.push(["street_group", `eq.${criteria.group}`]);
  if (criteria.category) params.push(["street_category", `eq.${criteria.category}`]);
  if (criteria.type) params.push(["street_type", `eq.${criteria.type}`]);
  if (criteria.tags?.length) params.push(["street_tags", `cs.{${criteria.tags.map(quote).join(",")}}`]);
  if (criteria.minPrice !== undefined) params.push(["price", `gte.${criteria.minPrice}`]);
  if (criteria.maxPrice !== undefined) params.push(["price", `lte.${criteria.maxPrice}`]);
  if (criteria.stock) params.push(["stock_status", `eq.${criteria.stock}`]);
  if (criteria.addedWithinDays) params.push(["created_at", `gte.${new Date(nowMs - criteria.addedWithinDays * 86_400_000).toISOString()}`]);
  return params;
}

/** Encodes the pairs as a query string. Values are percent-encoded; names are fixed identifiers. */
export function paramsToQuery(params: Array<[string, string]>): string {
  return params.map(([name, value]) => `${name}=${encodeURIComponent(value).replace(/%2A/g, "*").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%2C/g, ",")}`).join("&");
}

/** A short human description, for lists and previews. */
export function describeCriteria(criteria: ProductCriteria): string {
  const parts: string[] = [];
  if (criteria.brands?.length) parts.push(criteria.brands.length === 1 ? `brand ${criteria.brands[0]}` : `${criteria.brands.length} brands`);
  const taxonomy = [criteria.group, criteria.category, criteria.type].filter(Boolean).join(" / ");
  if (taxonomy) parts.push(taxonomy);
  if (criteria.tags?.length) parts.push(`tagged ${criteria.tags.join(", ")}`);
  if (criteria.q) parts.push(`title has "${criteria.q}"`);
  if (criteria.minPrice !== undefined && criteria.maxPrice !== undefined) parts.push(`$${criteria.minPrice}–$${criteria.maxPrice}`);
  else if (criteria.minPrice !== undefined) parts.push(`over $${criteria.minPrice}`);
  else if (criteria.maxPrice !== undefined) parts.push(`under $${criteria.maxPrice}`);
  if (criteria.stock) parts.push(criteria.stock === "in_stock" ? "in stock" : "sold out");
  if (criteria.addedWithinDays) parts.push(`added in the last ${criteria.addedWithinDays} days`);
  if (criteria.onSale) parts.push("on sale");
  return parts.length ? parts.join(" · ") : "Every live product";
}
