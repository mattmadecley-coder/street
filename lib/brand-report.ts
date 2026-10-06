// Brand report emails: "here's the traffic Street sent you".
//
// - Daily: every morning, for each brand Street sent shoppers to the day
//   before (Eastern time).
// - Recap: one-off, for a date range (e.g. everything since tracking began),
//   sent as a brand's first email.
// Rows land in brand_report_emails as drafts for review in /admin/reports, or
// send straight away when BRAND_REPORTS_AUTO_SEND=1 (daily only).
//
// Everything is counted in SHOPPERS (distinct people), not raw clicks: one
// person often clicks through twice (product page, then StreetBag).

import { supabaseRest, supabaseRestPage } from "@/lib/supabase-rest";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetdotcom.com").replace(/\/$/, "");
const TZ = "America/New_York";

export type ReportKind = "daily" | "recap";
export type ReportProduct = {
  slug: string; title: string; price: number | null; imageUrl: string | null;
  clicks: number; shoppers?: number; // clicked through to the brand's store
  bagShoppers?: number; // added it to their StreetBag
};
export type ReportStats = {
  date: string; // last day covered (YYYY-MM-DD, Eastern)
  periodStart?: string; // first day covered, recaps only
  clicks: number;
  shoppers: number; // distinct shoppers sent to the store
  productViews: number;
  impressions: number;
  bagShoppers?: number; // distinct shoppers who added this brand to their StreetBag
  checkoutShoppers?: number; // distinct shoppers who clicked checkout for this brand
  allTimeClicks: number;
  allTimeShoppers?: number;
  products: ReportProduct[];
};

type BrandRow = { id: string; slug: string; name: string };
type ContactRow = { brand_id: string; contact_email: string | null; reports_opted_out_at: string | null; report_token: string };

// ---------------------------------------------------------------- dates

function easternMidnightUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 5));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).formatToParts(guess);
  const hourInEt = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  return new Date(guess.getTime() - hourInEt * 3600_000);
}

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** UTC range covering Eastern calendar days `from` through `to` inclusive. */
export function easternRange(from: string, to = from) {
  return { start: easternMidnightUtc(from).toISOString(), end: easternMidnightUtc(addDays(to, 1)).toISOString() };
}
export const easternDayRange = (date: string) => easternRange(date);

export function easternYesterday(now = new Date()): string {
  return addDays(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now), -1);
}

function prettyDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

// ---------------------------------------------------------------- stats

async function fetchAll<T>(path: string) {
  return supabaseRest<T[]>(path, { noStore: true });
}

async function countRows(path: string) {
  const { total } = await supabaseRestPage<{ id: string }>(path, { from: 0, to: 0 }, { noStore: true });
  return total;
}

export async function computeBrandReportStats(brandSlug: string, date: string, periodStart?: string): Promise<ReportStats> {
  const { start, end } = easternRange(periodStart ?? date, date);
  const slug = encodeURIComponent(brandSlug);
  const inRange = `created_at=gte.${start}&created_at=lt.${end}`;

  const [clicks, bagEvents, checkoutEvents, productViews, impressions, allTime] = await Promise.all([
    fetchAll<{ product_id: string | null; product_slug: string | null; product_title: string | null; product_price: number | null; anonymous_user_id: string | null }>(
      `outbound_clicks?select=product_id,product_slug,product_title,product_price,anonymous_user_id&brand_slug=eq.${slug}&${inRange}`),
    fetchAll<{ product_id: string | null; price: number | null; anonymous_user_id: string | null }>(
      `site_events?select=product_id,price,anonymous_user_id&event_type=eq.add_to_cart&brand_slug=eq.${slug}&${inRange}`),
    fetchAll<{ anonymous_user_id: string | null }>(`site_events?select=anonymous_user_id&event_type=eq.cart_checkout_click&brand_slug=eq.${slug}&${inRange}`),
    countRows(`site_events?select=id&event_type=eq.product_view&brand_slug=eq.${slug}&${inRange}`),
    countRows(`site_events?select=id&event_type=eq.product_impression&brand_slug=eq.${slug}&${inRange}`),
    fetchAll<{ anonymous_user_id: string | null }>(`outbound_clicks?select=anonymous_user_id&brand_slug=eq.${slug}&created_at=lt.${end}`),
  ]);

  type Entry = ReportProduct & { productId: string | null; people: Set<string>; baggers: Set<string> };
  const byKey = new Map<string, Entry>();
  const entryFor = (key: string, productId: string | null, seed: Partial<ReportProduct>) => {
    let entry = byKey.get(key);
    if (!entry) {
      entry = { slug: key, productId, title: seed.title ?? "Your store", price: seed.price ?? null, imageUrl: null, clicks: 0, people: new Set(), baggers: new Set() };
      byKey.set(key, entry);
    }
    return entry;
  };

  clicks.forEach((click, index) => {
    const entry = entryFor(click.product_id ?? click.product_slug ?? "store", click.product_id, { title: click.product_title ?? undefined, price: click.product_price });
    if (click.product_slug) entry.slug = click.product_slug;
    entry.clicks += 1;
    entry.people.add(click.anonymous_user_id ?? `unknown-${index}`);
  });
  bagEvents.forEach((event, index) => {
    if (!event.product_id) return;
    const entry = entryFor(event.product_id, event.product_id, { price: event.price });
    entry.baggers.add(event.anonymous_user_id ?? `unknown-bag-${index}`);
  });

  const productIds = [...new Set([...byKey.values()].map((entry) => entry.productId).filter((id): id is string => Boolean(id)))];
  if (productIds.length) {
    const rows = await fetchAll<{ id: string; title: string; handle: string; price: number | null; primary_image_url: string | null }>(
      `products?select=id,title,handle,price,primary_image_url&id=in.(${productIds.join(",")})`);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const entry of byKey.values()) {
      const row = entry.productId ? byId.get(entry.productId) : undefined;
      if (!row) continue;
      entry.imageUrl = row.primary_image_url;
      if (!entry.title || entry.title === "Your store") entry.title = row.title;
      if (entry.price == null) entry.price = row.price;
      if (!entry.slug.includes("--")) entry.slug = `${brandSlug}--${row.handle}`;
    }
  }

  const distinct = (rows: Array<{ anonymous_user_id: string | null }>, prefix: string) =>
    new Set(rows.map((row, index) => row.anonymous_user_id ?? `${prefix}-${index}`)).size;

  return {
    date,
    ...(periodStart ? { periodStart } : {}),
    clicks: clicks.length,
    // A checkout click also sends the shopper to the brand's site, so they count as "sent".
    shoppers: distinct([...clicks, ...checkoutEvents], "c"),
    productViews,
    impressions,
    bagShoppers: distinct(bagEvents, "b"),
    checkoutShoppers: distinct(checkoutEvents, "k"),
    allTimeClicks: allTime.length,
    allTimeShoppers: distinct(allTime, "a"),
    products: [...byKey.values()]
      .map(({ productId: _id, people, baggers, ...product }) => ({ ...product, shoppers: people.size, bagShoppers: baggers.size }))
      .sort((a, b) => (b.shoppers + b.bagShoppers) - (a.shoppers + a.bagShoppers) || (b.price ?? 0) - (a.price ?? 0))
      .slice(0, 6),
  };
}

// ---------------------------------------------------------------- render

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const money = (n: number) => `$${Number(n).toFixed(2)}`;

function thumb(url: string | null) {
  if (!url) return null;
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) return `${url}${url.includes("?") ? "&" : "?"}width=160`;
  return url;
}

export type RenderInput = { brand: BrandRow; stats: ReportStats; isFirst: boolean; unsubscribeUrl: string; mailingAddress: string | null };

/** "yesterday" / "on Sunday, October 4" / "since September 26". */
function whenLabel(stats: ReportStats) {
  if (stats.periodStart) return `since ${prettyDate(stats.periodStart, { month: "long", day: "numeric" })}`;
  return stats.date === easternYesterday() ? "yesterday" : `on ${prettyDate(stats.date)}`;
}

function headerLabel(stats: ReportStats) {
  if (stats.periodStart) {
    const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `Recap &middot; ${esc(prettyDate(stats.periodStart, short))} &ndash; ${esc(prettyDate(stats.date, short))}`;
  }
  return `Daily report &middot; ${esc(prettyDate(stats.date))}`;
}

export function reportSubject({ brand, stats }: Pick<RenderInput, "brand" | "stats">) {
  return stats.periodStart
    ? `Street sent ${brand.name} ${plural(stats.shoppers, "shopper")} ${whenLabel(stats)}`
    : `${brand.name} got ${plural(stats.shoppers, "shopper")} from Street ${whenLabel(stats)}`;
}

export function renderBrandReport(input: RenderInput): { subject: string; html: string; text: string } {
  const { brand, stats, isFirst, unsubscribeUrl } = input;
  const address = input.mailingAddress?.trim() || "[MAILING ADDRESS NOT SET]";
  const brandUrl = `${SITE}/brands/${brand.slug}`;
  const name = esc(brand.name);
  const subject = reportSubject(input);
  const when = whenLabel(stats);
  const recap = Boolean(stats.periodStart);
  const bag = stats.bagShoppers ?? 0;
  const checkout = stats.checkoutShoppers ?? 0;
  const allTimeShoppers = stats.allTimeShoppers ?? 0;

  const headline = recap
    ? `${when[0].toUpperCase()}${when.slice(1)}, we've sent ${plural(stats.shoppers, "shopper")} to ${name}.`
    : `We sent ${plural(stats.shoppers, "shopper")} to ${name} ${when}.`;
  const intro = isFirst
    ? `Hi ${name} team — we're Street (streetdotcom.com), a place where people discover independent streetwear brands and then buy straight from the brand. ${name} is listed on Street, and ${when} shoppers ${recap ? "have found" : "found"} you there and clicked through to your store. Here's what caught their eye.`
    : `Here's what shoppers on Street were checking out from ${name} ${when}.`;

  // Only show numbers that aren't zero, so nothing reads like a mistake.
  const boxes: Array<[number, string]> = [[stats.shoppers, "Shoppers sent to your store"], [stats.productViews, "Product views"]];
  if (bag > 0) boxes.push([bag, "Added to StreetBag"]);
  if (checkout > 0) boxes.push([checkout, "Checkout clicks"]);
  const boxWidth = `${Math.floor(100 / boxes.length)}%`;
  const statBoxes = boxes.map(([value, label]) => `
    <td width="${boxWidth}" valign="top" style="padding:14px 12px;border:1px solid #dddbd3;background:#ffffff;">
      <div style="font-size:26px;line-height:30px;font-weight:700;letter-spacing:-0.5px;color:#101010;">${value.toLocaleString("en-US")}</div>
      <div style="font-size:10px;line-height:14px;letter-spacing:1.2px;text-transform:uppercase;color:#6b6a65;padding-top:4px;">${label}</div>
    </td>`).join("");

  const explainer = bag > 0 || checkout > 0
    ? `<strong style="color:#101010;">StreetBag</strong> is Street's cart: shoppers save pieces from different brands, then check out on each brand's own store.${checkout > 0 ? ` A <strong style="color:#101010;">checkout click</strong> means a shopper left their bag to pay on your site.` : ""}`
    : "";

  const productLines = (product: ReportProduct) => [
    (product.shoppers ?? 0) > 0 ? `${plural(product.shoppers ?? 0, "shopper")} clicked through` : "",
    (product.bagShoppers ?? 0) > 0 ? `added to ${plural(product.bagShoppers ?? 0, "bag")}` : "",
  ].filter(Boolean);

  const productRows = stats.products.map((product) => {
    const image = thumb(product.imageUrl);
    const link = product.slug === "store" ? brandUrl : `${SITE}/products/${product.slug}`;
    const title = product.slug === "store" ? "Your store (homepage)" : product.title;
    return `
      <tr>
        <td width="64" valign="middle" style="padding:10px 12px 10px 0;border-top:1px solid #e4e2da;">
          ${image ? `<img src="${esc(image)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;background:#ebe9e2;border:0;">` : `<div style="width:56px;height:56px;background:#ebe9e2;"></div>`}
        </td>
        <td valign="middle" style="padding:10px 0;border-top:1px solid #e4e2da;">
          <a href="${esc(link)}" style="color:#101010;text-decoration:none;font-size:14px;line-height:19px;font-weight:700;">${esc(title)}</a>
          ${product.price != null ? `<div style="font-size:13px;line-height:18px;color:#6b6a65;">${money(product.price)}</div>` : ""}
        </td>
        <td align="right" valign="middle" style="padding:10px 0 10px 12px;border-top:1px solid #e4e2da;font-size:13px;line-height:18px;color:#101010;">
          ${productLines(product).join("<br>")}
        </td>
      </tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f3ee;">
<div style="display:none;max-height:0;overflow:hidden;color:#f4f3ee;">${esc(subject)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3ee;">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif;color:#101010;">
  <tr><td style="padding:0 0 18px;border-bottom:1px solid #dddbd3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:22px;line-height:24px;font-weight:700;letter-spacing:-1.5px;"><a href="${SITE}" style="color:#101010;text-decoration:none;">STREET</a></td>
      <td align="right" style="font-size:10px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;color:#6b6a65;">${headerLabel(stats)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 0 8px;font-size:28px;line-height:32px;font-weight:700;letter-spacing:-1px;">${headline}</td></tr>
  <tr><td style="padding:0 0 22px;font-size:15px;line-height:23px;color:#2b2a27;">${intro}</td></tr>
  <tr><td style="padding:0 0 ${explainer ? 12 : 26}px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${statBoxes}</tr></table>
  </td></tr>
  ${explainer ? `<tr><td style="padding:0 0 26px;font-size:13px;line-height:20px;color:#6b6a65;">${explainer}</td></tr>` : ""}
  ${stats.products.length ? `
  <tr><td style="padding:0 0 6px;font-size:10px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;color:#6b6a65;">What caught their eye</td></tr>
  <tr><td style="padding:0 0 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${productRows}</table></td></tr>` : ""}
  <tr><td style="padding:0 0 16px;font-size:15px;line-height:23px;color:#2b2a27;">
    We know these numbers are small right now. Street is new and growing every week, so give us a little time and they'll get bigger. We built Street to connect real customers with brands the world deserves to know about, and ${name} is one of them.
  </td></tr>
  <tr><td style="padding:0 0 22px;font-size:13px;line-height:20px;color:#6b6a65;">
    These visits show up in your Shopify analytics under the source <strong style="color:#101010;">streetdotcom</strong>.${!recap && allTimeShoppers > stats.shoppers ? ` That's ${plural(allTimeShoppers, "shopper")} sent to your store from Street so far.` : ""}
  </td></tr>
  <tr><td style="padding:0 0 28px;"><a href="${esc(brandUrl)}" style="display:inline-block;background:#101010;color:#ffffff;text-decoration:none;font-size:11px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;padding:13px 18px;">See ${name} on Street &rarr;</a></td></tr>
  <tr><td style="padding:0 0 28px;font-size:15px;line-height:23px;color:#2b2a27;">
    Questions, or something about your listing you'd like changed? Feel free to reach out to us anytime.<br><br>— Matthew from Street
  </td></tr>
  <tr><td style="padding:18px 0 0;border-top:1px solid #dddbd3;font-size:11px;line-height:17px;color:#8a8983;">
    You're getting this because ${name} is listed on Street (<a href="${SITE}" style="color:#8a8983;">streetdotcom.com</a>). We only email when Street sends you traffic.
    <a href="${esc(unsubscribeUrl)}" style="color:#8a8983;">Unsubscribe</a>.<br>Street &middot; ${esc(address)}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const strip = (value: string) => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&middot;/g, "·").replace(/&ndash;/g, "–");
  const text = [
    `STREET — ${strip(headerLabel(stats))}`,
    "",
    strip(headline),
    "",
    strip(intro),
    "",
    ...boxes.map(([value, label]) => `${label}: ${value}`),
    ...(explainer ? ["", strip(explainer)] : []),
    "",
    ...(stats.products.length ? ["What caught their eye:", ...stats.products.map((p) => `- ${p.slug === "store" ? "Your store (homepage)" : p.title}${p.price != null ? ` (${money(p.price)})` : ""}: ${productLines(p).join(", ")}`), ""] : []),
    `We know these numbers are small right now. Street is new and growing every week, so give us a little time and they'll get bigger. We built Street to connect real customers with brands the world deserves to know about, and ${brand.name} is one of them.`,
    "",
    "These visits show up in your Shopify analytics under the source \"streetdotcom\".",
    "",
    `See ${brand.name} on Street: ${brandUrl}`,
    "",
    "Questions, or something about your listing you'd like changed? Feel free to reach out to us anytime.",
    "— Matthew from Street",
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
    `Street · ${address}`,
  ].join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------- generate & send

export type ReportRow = {
  id: string; brand_id: string; report_date: string; kind: ReportKind; period_start: string | null;
  status: "draft" | "sent" | "skipped" | "failed";
  to_email: string | null; subject: string; html: string; text_body: string; stats: ReportStats; is_first: boolean;
  resend_id: string | null; error: string | null; created_at: string; sent_at: string | null;
};

export function reportsConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.BRAND_REPORTS_FROM ?? "Street <reports@streetdotcom.com>",
    replyTo: process.env.BRAND_REPORTS_REPLY_TO ?? "hello@streetdotcom.com",
    mailingAddress: process.env.BRAND_REPORTS_MAILING_ADDRESS ?? "",
    autoSend: process.env.BRAND_REPORTS_AUTO_SEND === "1",
    testTo: process.env.BRAND_REPORTS_TEST_TO ?? "mattmadecley@gmail.com",
  };
}

const unsubscribeUrlFor = (token: string) => `${SITE}/api/reports/unsubscribe?token=${token}`;
const PREVIEW_UNSUBSCRIBE = `${SITE}/api/reports/unsubscribe?token=00000000-0000-0000-0000-000000000000`;

async function getContact(brandId: string): Promise<ContactRow> {
  const rows = await supabaseRest<ContactRow[]>(`brand_contacts?brand_id=eq.${brandId}&select=brand_id,contact_email,reports_opted_out_at,report_token`, { noStore: true });
  if (rows[0]) return rows[0];
  const created = await supabaseRest<ContactRow[]>("brand_contacts?on_conflict=brand_id", {
    method: "POST", body: { brand_id: brandId }, prefer: "resolution=merge-duplicates,return=representation",
  });
  return created[0];
}

async function hasBeenSentBefore(brandId: string) {
  const rows = await supabaseRest<Array<{ id: string }>>(`brand_report_emails?brand_id=eq.${brandId}&status=eq.sent&select=id&limit=1`, { noStore: true });
  return rows.length > 0;
}

/** Builds (or rebuilds) one brand's report. Never touches a report that was already sent. */
export async function buildBrandReport(brand: BrandRow, date: string, kind: ReportKind = "daily", periodStart?: string): Promise<ReportRow | null> {
  const existing = await supabaseRest<ReportRow[]>(`brand_report_emails?brand_id=eq.${brand.id}&report_date=eq.${date}&kind=eq.${kind}&select=*`, { noStore: true });
  if (existing[0]?.status === "sent") return existing[0];

  const [stats, contact, sentBefore] = await Promise.all([
    computeBrandReportStats(brand.slug, date, kind === "recap" ? periodStart : undefined),
    getContact(brand.id),
    hasBeenSentBefore(brand.id),
  ]);
  // Only brands Street actually sent shoppers to (a click through, or a checkout click).
  if (stats.shoppers === 0 && (stats.checkoutShoppers ?? 0) === 0) return null;

  const { mailingAddress } = reportsConfig();
  const rendered = renderBrandReport({ brand, stats, isFirst: !sentBefore, unsubscribeUrl: unsubscribeUrlFor(contact.report_token), mailingAddress });

  let status: ReportRow["status"] = "draft";
  let error: string | null = null;
  if (contact.reports_opted_out_at) { status = "skipped"; error = "Brand unsubscribed"; }
  else if (!contact.contact_email) { status = "skipped"; error = "No contact email on file"; }

  const saved = await supabaseRest<ReportRow[]>("brand_report_emails?on_conflict=brand_id,report_date,kind", {
    method: "POST",
    body: {
      brand_id: brand.id, report_date: date, kind, period_start: kind === "recap" ? periodStart : null,
      status, error, to_email: contact.contact_email,
      subject: rendered.subject, html: rendered.html, text_body: rendered.text, stats, is_first: !sentBefore,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return saved[0];
}

async function sendViaResend(payload: Record<string, unknown>, idempotencyKey?: string) {
  const { apiKey } = reportsConfig();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()) as { id?: string };
}

async function loadRow(reportId: string) {
  const rows = await supabaseRest<Array<ReportRow & { brands: BrandRow }>>(`brand_report_emails?id=eq.${reportId}&select=*,brands(id,slug,name)`, { noStore: true });
  return rows[0];
}

/** Sends one draft to the brand. Re-renders first so the latest address/contact/opt-out are used. */
export async function sendBrandReport(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const config = reportsConfig();
  const row = await loadRow(reportId);
  if (!row) return { ok: false, error: "Report not found" };
  if (row.status === "sent") return { ok: true };

  const fail = async (message: string, status: ReportRow["status"] = "failed") => {
    await supabaseRest(`brand_report_emails?id=eq.${reportId}`, { method: "PATCH", body: { status, error: message }, prefer: "return=minimal" });
    return { ok: false, error: message };
  };
  if (!config.apiKey) return { ok: false, error: "RESEND_API_KEY is not set" };
  if (!config.mailingAddress.trim()) return { ok: false, error: "BRAND_REPORTS_MAILING_ADDRESS is not set (required by CAN-SPAM)" };

  const contact = await getContact(row.brand_id);
  if (contact.reports_opted_out_at) return fail("Brand unsubscribed", "skipped");
  if (!contact.contact_email) return fail("No contact email on file", "skipped");

  const sentBefore = await hasBeenSentBefore(row.brand_id);
  const unsubscribeUrl = unsubscribeUrlFor(contact.report_token);
  const rendered = renderBrandReport({ brand: row.brands, stats: row.stats, isFirst: !sentBefore, unsubscribeUrl, mailingAddress: config.mailingAddress });

  try {
    const { id } = await sendViaResend({
      from: config.from, to: [contact.contact_email], reply_to: config.replyTo,
      subject: rendered.subject, html: rendered.html, text: rendered.text,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${config.replyTo}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }, `brand-report-${row.id}`);
    await supabaseRest(`brand_report_emails?id=eq.${reportId}`, {
      method: "PATCH",
      body: { status: "sent", sent_at: new Date().toISOString(), resend_id: id ?? null, error: null, to_email: contact.contact_email, subject: rendered.subject, html: rendered.html, text_body: rendered.text, is_first: !sentBefore },
      prefer: "return=minimal",
    });
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Send failed");
  }
}

/** Sends a copy of a draft to the owner (BRAND_REPORTS_TEST_TO) with a dummy unsubscribe link. Doesn't change the draft. */
export async function sendTestBrandReport(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const config = reportsConfig();
  if (!config.apiKey) return { ok: false, error: "RESEND_API_KEY is not set" };
  const row = await loadRow(reportId);
  if (!row) return { ok: false, error: "Report not found" };
  const rendered = renderBrandReport({ brand: row.brands, stats: row.stats, isFirst: row.is_first, unsubscribeUrl: PREVIEW_UNSUBSCRIBE, mailingAddress: config.mailingAddress });
  try {
    await sendViaResend({ from: config.from, to: [config.testTo], reply_to: config.replyTo, subject: `[TEST] ${rendered.subject}`, html: rendered.html, text: rendered.text });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Test send failed" };
  }
}

async function brandsWithTraffic(start: string, end: string) {
  const [clicked, checkouts] = await Promise.all([
    supabaseRest<Array<{ brand_slug: string | null }>>(`outbound_clicks?select=brand_slug&created_at=gte.${start}&created_at=lt.${end}`, { noStore: true }),
    supabaseRest<Array<{ brand_slug: string | null }>>(`site_events?select=brand_slug&event_type=eq.cart_checkout_click&created_at=gte.${start}&created_at=lt.${end}`, { noStore: true }),
  ]);
  const slugs = [...new Set([...clicked, ...checkouts].map((row) => row.brand_slug).filter((slug): slug is string => Boolean(slug)))];
  if (!slugs.length) return [];
  return supabaseRest<BrandRow[]>(`brands?select=id,slug,name&slug=in.(${slugs.map((s) => `"${s}"`).join(",")})`, { noStore: true });
}

type RunResult = { date: string; periodStart?: string; brands: number; drafts: number; skipped: number; sent: number; errors: string[] };

/** Daily job: build a report for every brand Street sent shoppers to on `date`, and send if auto-send is on. */
export async function runDailyBrandReports(date = easternYesterday()): Promise<RunResult> {
  const { start, end } = easternDayRange(date);
  const brands = await brandsWithTraffic(start, end);
  const config = reportsConfig();
  const result: RunResult = { date, brands: brands.length, drafts: 0, skipped: 0, sent: 0, errors: [] };
  for (const brand of brands) {
    try {
      const row = await buildBrandReport(brand, date, "daily");
      if (!row) continue;
      if (row.status === "skipped") { result.skipped += 1; continue; }
      if (row.status === "sent") { result.sent += 1; continue; }
      if (config.autoSend) {
        const sent = await sendBrandReport(row.id);
        if (sent.ok) result.sent += 1; else result.errors.push(`${brand.slug}: ${sent.error}`);
      } else result.drafts += 1;
    } catch (error) {
      result.errors.push(`${brand.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

/** One-off recap covering periodStart..date. Always drafts (never auto-sends). */
export async function runBrandRecaps(periodStart: string, date = easternYesterday()): Promise<RunResult> {
  const { start, end } = easternRange(periodStart, date);
  const brands = await brandsWithTraffic(start, end);
  const result: RunResult = { date, periodStart, brands: brands.length, drafts: 0, skipped: 0, sent: 0, errors: [] };
  for (const brand of brands) {
    try {
      const row = await buildBrandReport(brand, date, "recap", periodStart);
      if (!row) continue;
      if (row.status === "skipped") result.skipped += 1;
      else if (row.status === "sent") result.sent += 1;
      else result.drafts += 1;
    } catch (error) {
      result.errors.push(`${brand.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
