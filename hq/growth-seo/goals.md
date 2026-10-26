# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [~] First run (Mon/Thu): pull Search Console crawl-error and indexing
  status via the service account (blocked: GSC Wizard subscription lapsed,
  all tool calls return payment_required — flagged to Matthew 2026-10-24)
- [~] Check Bing Webmaster Tools via its API key (blocked: same GSC Wizard
  subscription lapse)
- [x] Audit product pages for missing Product/Rich Pin schema and draft
  fixes for Product & Engineering (done 2026-10-24 — audited
  app/products/[slug]/page.tsx, Product JSON-LD + OG/Twitter metadata
  already complete, nothing to draft)
- [x] Audit remaining public page templates (homepage, catalog, brands,
  brand page, collections) for missing metadata/structured data (done
  2026-10-24 — found app/collections/[slug]/page.tsx missing
  description/canonical/OG/Twitter metadata that every other template
  has; QA-approved fix drafted and filed in questions.md for
  Product & Engineering)
- [x] Audit the last remaining public templates (privacy, terms, returns,
  brands/apply, cart, saved) and check sitemap.ts coverage (done
  2026-10-24 — privacy/terms have adequate title+description; returns/
  cart/saved/brands-apply are low-priority (personal-state or thin
  utility pages); bigger find: active collection pages are missing from
  app/sitemap.ts entirely despite being real curated landing pages with
  live products — QA-approved fix filed in questions.md for Product &
  Engineering)
- [x] Self-directed: GSC Wizard still payment_required, so audit the
  codebase (not GSC data) for a concrete structured-data gap on an
  already-reviewed template (done 2026-10-25 — product pages render a
  visible breadcrumb nav with no matching BreadcrumbList JSON-LD, so
  Google can't show breadcrumb rich results for them; QA-approved fix
  filed in questions.md for Product & Engineering)
- [x] Self-directed: GSC Wizard still payment_required, so audit the
  remaining page templates (brands, collections) for the same
  duplicate-content/canonical risk the catalog page was already fixed
  for (done 2026-10-25 — app/brands/[slug]/page.tsx has the identical
  availability/sort/page filter UI as catalog but never got the
  matching noindex+canonical treatment, and its generateMetadata calls
  the same getCatalogPage() Supabase read catalog's robots.ts disallow
  rule was written to protect; QA-approved with notes (add a matching
  robots.ts disallow for /brands/* params) and filed in questions.md
  for Product & Engineering)
- [x] Self-directed: GSC Wizard still payment_required, so audit the
  catalog and brand-directory templates for missing openGraph/twitter
  metadata (done 2026-10-26 — app/catalog/page.tsx's generateMetadata
  sets title/description/canonical but never openGraph/twitter on any
  of its three indexable branches, and app/brands/page.tsx has the
  identical gap; QA sent it back once for understating scope (claimed
  other templates already covered this when brand directory and
  collections share the gap), then confirmed the diffs are sound once
  the framing was corrected; filed in questions.md for Product &
  Engineering)
