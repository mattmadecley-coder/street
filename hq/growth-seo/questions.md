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

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
