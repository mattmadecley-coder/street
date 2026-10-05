// Finds a brand's PUBLIC business contact email from its own storefront, for
// the daily brand report emails. Only reads ordinary public pages (the same
// way a shopper would) — never submits forms, logs in, or gets around any
// access control. Shopify stores are required to publish a contact address at
// /policies/contact-information, so that's usually the best source.

import { supabaseRest } from "@/lib/supabase-rest";

const PAGES = [
  "/policies/contact-information",
  "/pages/contact",
  "/pages/contact-us",
  "/",
  "/policies/privacy-policy",
  "/policies/refund-policy",
  "/policies/terms-of-service",
  "/pages/about",
  "/pages/faq",
];

const BLOCKED_DOMAINS = [
  "example.com", "domain.com", "email.com", "yourdomain.com", "yourstore.com", "sentry.io", "sentry-next.wixpress.com",
  "wixpress.com", "shopify.com", "myshopify.com", "klaviyo.com", "godaddy.com", "squarespace.com", "w3.org", "schema.org",
];
const PREFERRED_LOCALS = ["hello", "info", "contact", "support", "help", "team", "hi", "customerservice", "customercare", "care", "enquiries", "inquiries", "shop", "store", "admin"];
const AVOID_LOCALS = ["noreply", "no-reply", "donotreply", "privacy", "legal", "dpo", "abuse", "jobs", "careers", "press", "returns"];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

export type FoundContact = { email: string; source: string; score: number };

function rootDomain(host: string) {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  return parts.slice(-2).join(".");
}

/** Cloudflare "email protection" hides addresses as data-cfemail hex; decode them. */
function decodeCfEmail(hex: string) {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function extractEmails(html: string): string[] {
  const found = new Set<string>();
  const text = html.replace(/&#64;|&commat;|%40/gi, "@").replace(/\\u0040/gi, "@");
  for (const match of text.match(EMAIL_RE) ?? []) found.add(match.toLowerCase());
  for (const match of html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) found.add(decodeCfEmail(match[1]).toLowerCase());
  return [...found].filter((email) => {
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) return false;
    const [local, domain] = email.split("@");
    if (!local || !domain || local.length > 40) return false;
    if (BLOCKED_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) return false;
    if (/^[0-9a-f]{16,}$/i.test(local)) return false; // hashes, tracking ids
    return true;
  });
}

function scoreEmail(email: string, storeRoot: string, page: string) {
  const [local, domain] = email.split("@");
  let score = 0;
  if (rootDomain(domain) === storeRoot) score += 4;
  else if (/gmail|outlook|hotmail|icloud|yahoo|proton/.test(domain)) score += 1; // small brands often use a personal-style inbox
  if (PREFERRED_LOCALS.some((preferred) => local === preferred || local.startsWith(preferred))) score += 2;
  if (AVOID_LOCALS.some((avoid) => local.includes(avoid))) score -= 4;
  if (page.includes("contact")) score += 1;
  return score;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StreetBot/1.0; +https://streetdotcom.com)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return null;
    return (await response.text()).slice(0, 800_000);
  } catch {
    return null;
  }
}

/** Visits a handful of standard public pages and returns the most likely business contact address. */
export async function findBrandContactEmail(storeUrl: string): Promise<FoundContact | null> {
  let origin: string;
  try {
    origin = new URL(storeUrl).origin;
  } catch {
    return null;
  }
  const storeRoot = rootDomain(new URL(origin).hostname);
  let best: FoundContact | null = null;

  for (const path of PAGES) {
    const html = await fetchPage(`${origin}${path}`);
    if (!html) continue;
    for (const email of extractEmails(html)) {
      const score = scoreEmail(email, storeRoot, path);
      if (!best || score > best.score) best = { email, source: `${origin}${path}`, score };
    }
    // A same-domain, generic inbox is as good as it gets — stop early.
    if (best && best.score >= 6) break;
  }

  return best && best.score > -2 ? best : null;
}

/** Finds and stores a brand's contact email. Never overwrites an address set by hand in admin. */
export async function refreshBrandContact(input: { id?: string; slug?: string; storeUrl: string }): Promise<FoundContact | null> {
  let id = input.id;
  if (!id && input.slug) {
    const rows = await supabaseRest<Array<{ id: string }>>(`brands?slug=eq.${encodeURIComponent(input.slug)}&select=id`, { noStore: true });
    id = rows[0]?.id;
  }
  if (!id) return null;
  const brand = { id, storeUrl: input.storeUrl };
  const existing = await supabaseRest<Array<{ contact_email_source: string | null }>>(
    `brand_contacts?brand_id=eq.${brand.id}&select=contact_email_source`,
    { noStore: true },
  );
  if (existing[0]?.contact_email_source === "manual") return null;

  const found = await findBrandContactEmail(brand.storeUrl);
  await supabaseRest("brand_contacts?on_conflict=brand_id", {
    method: "POST",
    body: {
      brand_id: brand.id,
      contact_email: found?.email ?? null,
      contact_email_source: found?.source ?? null,
      contact_email_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  return found;
}
