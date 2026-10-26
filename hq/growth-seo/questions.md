# Questions for Matthew

## Open

**Q:** GSC Wizard (the MCP tool this department uses for Search Console
crawl/indexing data and Bing Webmaster data) is returning
`payment_required` on every call — "trial has ended or you have no active
subscription." I can't pull crawl errors, indexing status, ranking changes,
or Bing data until it's resubscribed at
https://tool.gscwizard.com/settings/subscription. Recommendation: resub if
you want this department's Mon/Thu checks to keep working — otherwise this
department is flying blind on Search Console/Bing health until it's back.
(2026-10-24)

**Q (for Product & Engineering, via GM):** Collection pages (`/collections/[slug]`) are the one public page template missing SEO metadata — every other template (products, brands, brand directory, catalog) sets title/description/canonical/OG/Twitter, but `app/collections/[slug]/page.tsx`'s `generateMetadata` (lines 7-12) returns only `{ title: collection.title }`. QA-reviewed (approved with notes 2026-10-24) — recommendation:
1. `lib/collections-store.ts`, `getPublicCollection()` (~lines 191-220): add `cover_image_url` to the select string (`collections?slug=eq.${...}&select=id,title,subtitle,is_active` → add `,cover_image_url`), return it as `coverImageUrl` in both return statements, **and update the function's explicit return-type annotation** (line 191: `Promise<{ title: string; subtitle: string | null; products: StreetProduct[] } | null>`) to add `coverImageUrl: string | null` — otherwise TS's excess-property check fails on the literal returns.
2. `app/collections/[slug]/page.tsx`: expand `generateMetadata` to mirror the pattern already used in `app/brands/[slug]/page.tsx` (lines 15-28):
   - `description`: use `` `Shop the ${collection.title} collection on Street — independent streetwear, bought straight from the brand.` `` (exact fallback copy; don't leave this to improvisation since `subtitle` is often null)
   - `alternates: { canonical: \`/collections/${slug}\` }`
   - `openGraph: { title, description, type: "website", images: coverImageUrl ? [{ url: coverImageUrl }] : undefined }`
   - `twitter: { card: "summary_large_image", title, description, images: coverImageUrl ? [coverImageUrl] : undefined }`
   - Type the function `Promise<Metadata>` with `import type { Metadata } from "next"` for consistency with the other templates.
   No caching concern — the page already has `export const dynamic = "force-dynamic"`.
(2026-10-24)

**Q (for Product & Engineering, via GM):** Active collection pages (`/collections/[slug]`) are curated landing pages with real products — they're shown as shelves on the homepage — but `app/sitemap.ts` never includes them, so Google has no path to discover or index them (unlike brand pages, which do get a sitemap entry). QA-reviewed (approved with notes 2026-10-24) — recommendation:
1. In `app/sitemap.ts`, add a new import: `import { getActiveCollectionsForHomepage } from "@/lib/collections-store";` (separate from the existing `@/lib/catalog-store` import).
2. In `sitemap()`, call `const collections = await getActiveCollectionsForHomepage();` alongside the existing `brands` fetch — it already filters to `is_active=eq.true` collections with at least one live, visible product, so no extra filtering is needed.
3. Add `collectionRoutes`, mirroring the existing `brandRoutes` block: `collections.map((collection) => ({ url: \`${siteUrl}/collections/${collection.slug}\`, changeFrequency: "daily", priority: 0.5 }))` — same priority Street already gives brand pages.
4. Spread `...collectionRoutes` into the returned array alongside `...staticRoutes, ...brandRoutes, ...productRoutes`.

QA's note: `getActiveCollectionsForHomepage()` also fetches full product rows (images/variants/description), which is more than the sitemap needs (only `slug`) — not a bug, same cost profile as the existing `getBrandDirectory()` call, fine to ship as-is now. If collection count or product fan-out grows later, consider a lighter `getActiveCollectionSlugsForSitemap()` that only selects `slug`.

Pairs with the collection-metadata fix already filed above — that one fixes what crawlers see once they land on a collection page; this one is what gets them there in the first place.
(2026-10-24)

**Q (for Product & Engineering, via GM):** Product pages (`/products/[slug]`) already render a visible breadcrumb nav (`app/products/[slug]/page.tsx` line 73: `Shop / [Category] / [Product Title]`) but have no matching `BreadcrumbList` structured data, so Google can't show breadcrumb rich results for them in search (every other piece of schema on this template — Product/Offer JSON-LD — is already in place). QA-reviewed (approved with notes 2026-10-25) — recommendation:
1. Add near the top of `app/products/[slug]/page.tsx` (module scope, same pattern already used in `app/layout.tsx`, `app/sitemap.ts`, `app/robots.ts`): `const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";`
2. Inside `ProductPage`, after the existing `jsonLd` const (~line 65), add:
```ts
const categoryLabel = product.streetCategory ?? product.category;
const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Shop", item: `${siteUrl}/catalog` },
    ...(categoryLabel
      ? [{ "@type": "ListItem", position: 2, name: categoryLabel, item: `${siteUrl}/catalog?category=${encodeURIComponent(categoryLabel)}` }]
      : []),
    { "@type": "ListItem", position: categoryLabel ? 3 : 2, name: product.title },
  ],
};
```
3. Render a second `<script type="application/ld+json">` tag right after the existing one (line 69): `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }} />`

This exactly mirrors the labels/hrefs in the visible breadcrumb at line 73 (`categoryLabel` matches the data source already used for `jsonLd.category` at line 55) and correctly omits `item`/URL on the last entry per Google's BreadcrumbList guidance since it's the current page. QA's notes: a second JSON-LD script tag (vs. merging into one `@graph`) is valid and fine; no security or scope issues.
(2026-10-25)

**Q (for Product & Engineering, via GM):** Brand pages (`/brands/[slug]`) have the same filter/pagination UI as the catalog page (an `availability`/`sort` form plus `?page=` pagination, `app/brands/[slug]/page.tsx` lines 82-98) and call the same `getCatalogPage()` Supabase read underneath (line 59) — but unlike the catalog page, their `generateMetadata` (lines 15-28) always returns one static canonical (`/brands/${brand.slug}`) regardless of those params, and never sets a `robots` directive. This is the exact bug class the catalog page was already fixed for once (GSC had flagged the homepage as "Duplicate without user-selected canonical" from filtered catalog URLs) — same risk here, just on brand pages instead. QA-reviewed (approved with notes 2026-10-25) — recommendation, two parts:

1. **Metadata fix** — in `app/brands/[slug]/page.tsx`, change `generateMetadata`'s signature to also accept `searchParams` (same `Params` type already declared at line 30 for the page component) and add a filtered-URL branch:
```tsx
export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const filters = await searchParams;
  const brand = (await getBrandDirectory()).find((entry) => entry.slug === slug);
  if (!brand) return {};
  const title = brand.name;
  const description = `Shop ${brand.name} on Street — ${brand.productCount ? `${brand.productCount} pieces ` : ""}independent streetwear, bought straight from the brand.`;
  const canonical = `/brands/${brand.slug}`;
  if (Boolean(filters.availability || filters.sort || filters.page)) {
    return { robots: { index: false, follow: true }, alternates: { canonical } };
  }
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", images: brand.logoUrl ? [{ url: brand.logoUrl }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: brand.logoUrl ? [brand.logoUrl] : undefined },
  };
}
```
(`Params` being referenced before its line-30 declaration is fine — it's a `type` alias, which TS resolves at compile time regardless of source order.)

2. **Crawl-budget fix** — QA's note: a `noindex` meta tag alone doesn't stop Googlebot from crawling (and triggering the Supabase read) in the first place. `app/robots.ts` already disallows this exact param combination for `/catalog` with a comment explaining why ("each combination triggers a fresh Supabase read") — brand pages hit the same `getCatalogPage()` call, so they should get the same treatment. In `app/robots.ts`:
```tsx
const NON_INDEXABLE_BRAND_PARAMS = ["sort", "availability", "page"];
```
and extend the `disallow` array:
```tsx
disallow: [
  ...NON_INDEXABLE_CATALOG_PARAMS.map((param) => `/catalog?*${param}=*`),
  ...NON_INDEXABLE_BRAND_PARAMS.map((param) => `/brands/*?*${param}=*`),
],
```
(2026-10-25)

**Q (for Product & Engineering, via GM):** `app/catalog/page.tsx`'s `generateMetadata` (lines 86-125) already sets `title`/`description`/`alternates.canonical` (and `robots: { index: false }` for filtered, non-indexable URLs) but never sets `openGraph`/`twitter` for any of its three indexable branches — the plain "Shop all" `/catalog` page, a brand-filtered catalog URL, or a taxonomy-heading URL (`/catalog?category=Jackets`, etc.). Because Next.js only merges in a parent layout's metadata for fields the child omits, every one of those indexable, shareable URLs falls back to the root layout's generic homepage preview (title "Street — Discover independent streetwear", the homepage description, and the static `/opengraph-image` graphic) instead of its own content. `app/brands/page.tsx` (the brand directory) has the identical gap — its static `metadata` export (lines 10-14) sets `title`/`description`/`alternates.canonical` but no `openGraph`/`twitter` either. (`app/collections/[slug]/page.tsx` has a related but already-filed gap — see the collections-metadata question below — no need to duplicate that one here.)

QA-reviewed (sent back once on an overstated "every other template already does this" framing — brand directory and collections actually share the gap; corrected here) — recommendation:

1. `app/catalog/page.tsx`, add `openGraph`/`twitter` to each of the three indexable returns, reusing the title/description each branch already computes:
```tsx
// "Shop all" branch (no heading, no brand):
const title = "Shop all";
const description = "Shop every independent streetwear brand on Street in one catalog — filter by category, size, and price.";
return { title, description, alternates: { canonical }, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };

// brand-filter branch (params.brand set):
const description = `Shop ${label} on Street — independent streetwear, bought straight from the brand.`;
return { title: label, description, alternates: { canonical }, openGraph: { title: label, description, type: "website", images: brand?.logoUrl ? [{ url: brand.logoUrl }] : undefined }, twitter: { card: "summary_large_image", title: label, description, images: brand?.logoUrl ? [brand.logoUrl] : undefined } };

// taxonomy-heading branch (group/category/type/detail, no brand) — no logo available, falls back to the default /opengraph-image, which is correct:
const description = `Shop ${heading} from independent streetwear brands on Street.`;
return { title: heading, description, alternates: { canonical }, openGraph: { title: heading, description, type: "website" }, twitter: { card: "summary_large_image", title: heading, description } };
```
(`getAllBrands()` from `@/lib/catalog-store` is already imported and called in this file; its `StreetBrand.logoUrl` field is `string | undefined` per `lib/brands.ts` line 5, so `brand?.logoUrl ? [...] : undefined` is the correct guard.) Leave the earlier `hasNonIndexableFilter` (noindex) branch untouched — those URLs are intentionally kept out of search, so a share-preview fix there is lower value.

2. `app/brands/page.tsx`, add to the existing static `metadata` export:
```tsx
export const metadata: Metadata = {
  title: "Independent streetwear brands",
  description: "Browse every independent streetwear brand on Street and shop directly from the brand's own store.",
  alternates: { canonical: "/brands" },
  openGraph: { title: "Independent streetwear brands", description: "Browse every independent streetwear brand on Street and shop directly from the brand's own store.", type: "website" },
  twitter: { card: "summary_large_image", title: "Independent streetwear brands", description: "Browse every independent streetwear brand on Street and shop directly from the brand's own store." },
};
```

QA confirmed both diffs are correct TypeScript against the Next.js `Metadata` type and match the pattern already used on `app/products/[slug]/page.tsx` and `app/brands/[slug]/page.tsx`, with no regressions — the only issue was the original framing understating scope, fixed above.
(2026-10-26)

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
