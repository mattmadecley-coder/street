# Street — independent streetwear discovery

Street is a discovery-first catalog for independent streetwear brands. People browse and search on Street, then click through to buy directly from the original brand.

The first catalog source is **Seventy Four Uniform**.

## What is built now

- Homepage with a replaceable visual hero area
- Mobile-first catalog
- Search across product name, product category, colors, sizes, tags, and brand name
- Filters for category, color, size, price, and availability
- In-stock is selected by default; shoppers can include sold-out products
- Product detail pages with image gallery, sizes/colors where the source offers them, product tags, and a direct-to-brand button
- Cached, ISR-served pages (hourly TTL) that revalidate instantly whenever the daily catalog sync writes new data
- Safe fallback catalog if the source store is temporarily unavailable

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
2. ~~Add outbound-click tracking so Street can prove how much traffic it sends brands.~~ Done — "Shop at {brand}" links route through `/api/out`, which logs to `outbound_clicks` before redirecting. A brand-facing traffic report on top of that table is still open.
3. ~~Add a Vercel Cron sync route for daily database updates.~~ Done.
4. Add a brand application / claim page.
5. Bring in the next 5–10 brands through approved feeds or direct onboarding.
6. Add verified size charts. Do not tell people an item runs large or small unless the brand provides measurements or a clear fit note.
