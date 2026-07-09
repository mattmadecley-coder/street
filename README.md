# Street — independent streetwear discovery

Street is a discovery-first catalog for independent streetwear brands. People browse and search on Street, then click through to buy directly from the original brand.

The first catalog source is **Seventy Four Uniform**.

## What is built now

- Homepage with a replaceable hero image/video and an admin-selectable featured-brand spotlight, plus a featured-brands grid
- Mobile-first catalog
- Global search (header search overlay, not just the Shop All filter bar) across product name, product category, colors, sizes, tags, and brand name — case-insensitive
- Filters for category (nested sidebar), color (swatches), size (contextual — only shown once a category implies what "size" means, e.g. shoe sizes under Footwear, waist sizes under Jeans/Pants), price (slider), and availability
- In-stock is selected by default; shoppers can include sold-out products
- Product cards swap to the second catalog photo on hover; product images render on a page-matching background so transparent PNGs actually look transparent
- Product detail pages with image gallery, sizes/colors where the source offers them, product tags, and a direct-to-brand button
- Cached, ISR-served pages (hourly TTL) that revalidate instantly whenever the daily catalog sync (or an admin edit) writes new data
- Safe fallback catalog if the source store is temporarily unavailable
- `/admin` dashboard (password-gated via `ADMIN_PASSWORD`): swap the homepage hero/featured brand, fix a brand's logo or store link, manually override a product's category/tags when the AI classifier gets it wrong, and view analytics (top searches, search → click, category popularity, price ranges people browse, outbound clicks per brand, traffic sources)
- Analytics event log (`site_events` table) plus outbound-click tracking (`outbound_clicks`) feeding the admin analytics view

## Data source

Street reads the public Shopify-style endpoint at:

```text
https://www.seventyfouruniform.com/products.json?limit=250
```

The importer maps the data into Street products with title, price, availability, images, colors, sizes, category, source tags, generated search tags, product URL, and pre-order detection.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy on Vercel

1. Open Vercel and choose **Add New → Project**.
2. Import `mattmadecley-coder/street`.
3. Leave the framework set to Next.js.
4. Add this environment variable if you want to explicitly set the source store:

```text
STREET_FIRST_BRAND_URL=https://www.seventyfouruniform.com
```

5. Deploy.

## Important launch rule

This is an early product-discovery test. Before scaling to lots of brands, get brand permission, an affiliate relationship, or a sanctioned product feed. Do not bypass logins, anti-bot controls, or access restrictions. Make it easy for a brand to claim, correct, or remove its listing.

## Next build priorities

1. ~~Add a real database with Supabase so product history and stock changes persist.~~ Done.
2. ~~Add outbound-click tracking so Street can prove how much traffic it sends brands.~~ Done — "Shop at {brand}" links route through `/api/out`, which logs to `outbound_clicks` before redirecting. The `outbound_clicks` table itself hadn't actually been created in the database until this pass (silent no-op), so treat click history before now as incomplete. A brand-facing traffic report on top of that table is still open.
3. ~~Add a Vercel Cron sync route for daily database updates.~~ Done.
4. ~~Add an admin dashboard for homepage/brand/product edits.~~ Done — see `/admin` above.
5. ~~Add analytics tracking (searches, category popularity, price ranges, traffic sources).~~ Done — see `/admin/analytics`.
6. Add a brand application / claim page.
7. Bring in the next 5–10 brands through approved feeds or direct onboarding.
8. Add verified size charts. Do not tell people an item runs large or small unless the brand provides measurements or a clear fit note.
9. Product `sizes` values are whatever free-form strings each brand's Shopify feed provides, so the Shop All size filter (curated per-category options like shoe half-sizes or S/M/L) only matches products whose scraped size strings happen to line up exactly. Worth a normalization pass if size filtering needs to be reliable across all 32 brands.
