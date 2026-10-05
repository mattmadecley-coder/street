// Daily brand report emails: "here's the traffic Street sent you yesterday".
// Generated each morning for every brand that got at least one outbound
// click the previous day (Eastern time). Rows land in brand_report_emails as
// drafts for review in /admin/reports, or send straight away when
// BRAND_REPORTS_AUTO_SEND=1.

import { supabaseRest, supabaseRestPage } from "@/lib/supabase-rest";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetdotcom.com").replace(/\/$/, "");
const TZ = "America/New_York";

export type ReportProduct = { slug: string; title: string; price: number | null; imageUrl: string | null; clicks: number };
export type ReportStats = {
  date: string; // YYYY-MM-DD (Eastern)
  clicks: number;
  shoppers: number;
  productViews: number;
  impressions: number;
  allTimeClicks: number;
  products: ReportProduct[];
};

type BrandRow = { id: string; slug: string; name: string };
type ContactRow = { brand_id: string; contact_email: string | null; reports_opted_out_at: string | null; report_token: string };

// ---------------------------------------------------------------- dates

/** UTC instant for 00:00 Eastern on the given calendar date. */
function easternMidnightUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 5)); // 05:00 UTC ~= midnight ET
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).formatToParts(guess);
  const hourInEt = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  return new Date(guess.getTime() - hourInEt * 3600_000);
}

export function easternDayRange(date: string) {
  const start = easternMidnightUtc(date);
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: start.toISOString(), end: easternMidnightUtc(next).toISOString() };
}

export function easternYesterday(now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now); // YYYY-MM-DD
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function prettyDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------- stats

async function countEvents(eventType: string, brandSlug: string, start: string, end: string) {
  const { total } = await supabaseRestPage<{ id: string }>(
    `site_events?select=id&event_type=eq.${eventType}&brand_slug=eq.${encodeURIComponent(brandSlug)}&created_at=gte.${start}&created_at=lt.${end}`,
    { from: 0, to: 0 },
    { noStore: true },
  );
  return total;
}

export async function computeBrandReportStats(brandSlug: string, date: string): Promise<ReportStats> {
  const { start, end } = easternDayRange(date);
  const slug = encodeURIComponent(brandSlug);

  const clicks = await supabaseRest<Array<{ product_id: string | null; product_slug: string | null; product_title: string | null; product_price: number | null; anonymous_user_id: string | null }>>(
    `outbound_clicks?select=product_id,product_slug,product_title,product_price,anonymous_user_id&brand_slug=eq.${slug}&created_at=gte.${start}&created_at=lt.${end}`,
    { noStore: true },
  );

  const byProduct = new Map<string, ReportProduct & { productId: string | null }>();
  for (const click of clicks) {
    const key = click.product_slug ?? "store";
    const entry = byProduct.get(key) ?? { slug: key, productId: click.product_id, title: click.product_title ?? "Store homepage", price: click.product_price, imageUrl: null, clicks: 0 };
    entry.clicks += 1;
    byProduct.set(key, entry);
  }

  const productIds = [...new Set([...byProduct.values()].map((entry) => entry.productId).filter((id): id is string => Boolean(id)))];
  if (productIds.length) {
    const rows = await supabaseRest<Array<{ id: string; title: string; price: number | null; primary_image_url: string | null }>>(
      `products?select=id,title,price,primary_image_url&id=in.(${productIds.join(",")})`,
      { noStore: true },
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const entry of byProduct.values()) {
      const row = entry.productId ? byId.get(entry.productId) : undefined;
      if (!row) continue;
      entry.imageUrl = row.primary_image_url;
      if (!entry.title || entry.title === "Store homepage") entry.title = row.title;
      if (entry.price == null) entry.price = row.price;
    }
  }

  const [productViews, impressions, allTime] = await Promise.all([
    countEvents("product_view", brandSlug, start, end),
    countEvents("product_impression", brandSlug, start, end),
    supabaseRestPage<{ id: string }>(`outbound_clicks?select=id&brand_slug=eq.${slug}`, { from: 0, to: 0 }, { noStore: true }),
  ]);

  return {
    date,
    clicks: clicks.length,
    shoppers: new Set(clicks.map((click) => click.anonymous_user_id).filter(Boolean)).size || clicks.length,
    productViews,
    impressions,
    allTimeClicks: allTime.total,
    products: [...byProduct.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 6).map(({ productId: _productId, ...product }) => product),
  };
}

// ---------------------------------------------------------------- render

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function thumb(url: string | null) {
  if (!url) return null;
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) return `${url}${url.includes("?") ? "&" : "?"}width=160`;
  return url;
}

export type ReportVariant = "full" | "short";
export type RenderInput = { brand: BrandRow; stats: ReportStats; isFirst: boolean; unsubscribeUrl: string; mailingAddress: string | null; variant?: ReportVariant };

/** "yesterday" when it really was yesterday (Eastern), otherwise "on Tuesday, September 29". */
function whenLabel(date: string) {
  return date === easternYesterday() ? "yesterday" : `on ${prettyDate(date)}`;
}

export function reportSubject({ brand, stats }: Pick<RenderInput, "brand" | "stats">) {
  return `${brand.name} got ${plural(stats.shoppers, "shopper")} from Street ${whenLabel(stats.date)}`;
}

export function renderBrandReport(input: RenderInput): { subject: string; html: string; text: string } {
  return (input.variant ?? reportsConfig().template) === "short" ? renderShortReport(input) : renderFullReport(input);
}

function renderFullReport(input: RenderInput): { subject: string; html: string; text: string } {
  const { brand, stats, isFirst, unsubscribeUrl } = input;
  const address = input.mailingAddress?.trim() || "[MAILING ADDRESS NOT SET]";
  const brandUrl = `${SITE}/brands/${brand.slug}`;
  const name = esc(brand.name);
  const subject = reportSubject(input);

  const when = whenLabel(stats.date);
  const headline = `We sent ${plural(stats.shoppers, "shopper")} to ${name} ${when}.`;
  const intro = isFirst
    ? `Hi ${name} team — we're Street (streetdotcom.com), a place where people discover independent streetwear brands and then buy straight from the brand. ${name} is listed on Street, and ${when} shoppers found you there and clicked through to your store. Here's what caught their eye.`
    : `Here's what shoppers on Street were checking out from ${name} ${when}.`;

  const stat = (value: number, label: string) => `
    <td width="33%" valign="top" style="padding:14px 12px;border:1px solid #dddbd3;background:#ffffff;">
      <div style="font-size:26px;line-height:30px;font-weight:700;letter-spacing:-0.5px;color:#101010;">${value.toLocaleString("en-US")}</div>
      <div style="font-size:10px;line-height:14px;letter-spacing:1.2px;text-transform:uppercase;color:#6b6a65;padding-top:4px;">${label}</div>
    </td>`;

  const productRows = stats.products.map((product) => {
    const image = thumb(product.imageUrl);
    const link = product.slug === "store" ? brandUrl : `${SITE}/products/${product.slug}`;
    return `
      <tr>
        <td width="64" valign="middle" style="padding:10px 12px 10px 0;border-top:1px solid #e4e2da;">
          ${image ? `<img src="${esc(image)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;background:#ebe9e2;border:0;">` : `<div style="width:56px;height:56px;background:#ebe9e2;"></div>`}
        </td>
        <td valign="middle" style="padding:10px 0;border-top:1px solid #e4e2da;">
          <a href="${esc(link)}" style="color:#101010;text-decoration:none;font-size:14px;line-height:19px;font-weight:700;">${esc(product.title)}</a>
          ${product.price != null ? `<div style="font-size:13px;line-height:18px;color:#6b6a65;">$${Number(product.price).toFixed(2)}</div>` : ""}
        </td>
        <td align="right" valign="middle" style="padding:10px 0 10px 12px;border-top:1px solid #e4e2da;font-size:13px;line-height:18px;color:#101010;white-space:nowrap;">
          ${plural(product.clicks, "click")}
        </td>
      </tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f3ee;">
<div style="display:none;max-height:0;overflow:hidden;color:#f4f3ee;">${plural(stats.clicks, "click")} from Street shoppers to your store on ${esc(prettyDate(stats.date))}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3ee;">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif;color:#101010;">
  <tr><td style="padding:0 0 18px;border-bottom:1px solid #dddbd3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:22px;line-height:24px;font-weight:700;letter-spacing:-1.5px;"><a href="${SITE}" style="color:#101010;text-decoration:none;">STREET</a></td>
      <td align="right" style="font-size:10px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;color:#6b6a65;">Daily report &middot; ${esc(prettyDate(stats.date))}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 0 8px;font-size:28px;line-height:32px;font-weight:700;letter-spacing:-1px;">${headline}</td></tr>
  <tr><td style="padding:0 0 22px;font-size:15px;line-height:23px;color:#2b2a27;">${intro}</td></tr>
  <tr><td style="padding:0 0 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
      ${stat(stats.clicks, "Clicks to your store")}${stat(stats.productViews, "Product views")}${stat(stats.impressions, "Times shown")}
    </tr></table>
  </td></tr>
  ${stats.products.length ? `
  <tr><td style="padding:0 0 6px;font-size:10px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;color:#6b6a65;">What they clicked</td></tr>
  <tr><td style="padding:0 0 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${productRows}</table></td></tr>` : ""}
  <tr><td style="padding:0 0 16px;font-size:15px;line-height:23px;color:#2b2a27;">
    We know these numbers are small right now. Street is new and growing every week, so give us a little time and they'll get bigger. We built Street to connect real customers with brands the world deserves to know about, and ${name} is one of them.
  </td></tr>
  <tr><td style="padding:0 0 22px;font-size:13px;line-height:20px;color:#6b6a65;">
    These visits show up in your Shopify analytics under the source <strong style="color:#101010;">streetdotcom</strong>.${stats.allTimeClicks > stats.clicks ? ` That's ${plural(stats.allTimeClicks, "click")} to your store from Street so far.` : ""}
  </td></tr>
  <tr><td style="padding:0 0 28px;"><a href="${esc(brandUrl)}" style="display:inline-block;background:#101010;color:#ffffff;text-decoration:none;font-size:11px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;padding:13px 18px;">See ${name} on Street &rarr;</a></td></tr>
  <tr><td style="padding:0 0 28px;font-size:15px;line-height:23px;color:#2b2a27;">
    Questions, or something about your listing you'd like changed? Just reply to this email — we read every one.<br><br>— Matthew from Street
  </td></tr>
  <tr><td style="padding:18px 0 0;border-top:1px solid #dddbd3;font-size:11px;line-height:17px;color:#8a8983;">
    You're getting this because ${name} is listed on Street (<a href="${SITE}" style="color:#8a8983;">streetdotcom.com</a>). We only email on days Street sends you traffic.
    <a href="${esc(unsubscribeUrl)}" style="color:#8a8983;">Unsubscribe</a>.<br>Street &middot; ${esc(address)}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `STREET — Daily report, ${prettyDate(stats.date)}`,
    "",
    `We sent ${plural(stats.shoppers, "shopper")} to ${brand.name} ${when}.`,
    "",
    intro.replace(/&amp;/g, "&"),
    "",
    `Clicks to your store: ${stats.clicks}`,
    `Product views: ${stats.productViews}`,
    `Times shown: ${stats.impressions}`,
    "",
    ...(stats.products.length ? ["What they clicked:", ...stats.products.map((p) => `- ${p.title}${p.price != null ? ` ($${Number(p.price).toFixed(2)})` : ""}: ${plural(p.clicks, "click")}`), ""] : []),
    `We know these numbers are small right now. Street is new and growing every week, so give us a little time and they'll get bigger. We built Street to connect real customers with brands the world deserves to know about, and ${brand.name} is one of them.`,
    "",
    "These visits show up in your Shopify analytics under the source \"streetdotcom\".",
    "",
    `See ${brand.name} on Street: ${brandUrl}`,
    "",
    "Questions, or something about your listing you'd like changed? Just reply to this email.",
    "— Matthew from Street",
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
    `Street · ${address}`,
  ].join("\n");

  return { subject, html, text };
}

/** Shorter version for cold inboxes: one headline, what they clicked, one line about Street, sign-off. */
function renderShortReport(input: RenderInput): { subject: string; html: string; text: string } {
  const { brand, stats, isFirst, unsubscribeUrl } = input;
  const address = input.mailingAddress?.trim() || "[MAILING ADDRESS NOT SET]";
  const brandUrl = `${SITE}/brands/${brand.slug}`;
  const name = esc(brand.name);
  const subject = reportSubject(input);
  const when = whenLabel(stats.date);
  const headline = `${plural(stats.shoppers, "shopper")} clicked through to ${name} ${when}.`;
  const intro = isFirst ? "We're Street, a discovery site for independent streetwear. Shoppers find you here, then buy from your store." : "";
  const summary = `${plural(stats.clicks, "click")} to your store &middot; ${plural(stats.productViews, "product view")} &middot; shown ${plural(stats.impressions, "time")}`;
  const products = stats.products.slice(0, 3);

  const productRows = products.map((product) => {
    const image = thumb(product.imageUrl);
    const link = product.slug === "store" ? brandUrl : `${SITE}/products/${product.slug}`;
    return `
      <tr>
        <td width="56" valign="middle" style="padding:8px 12px 8px 0;">${image ? `<img src="${esc(image)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;object-fit:cover;background:#ebe9e2;border:0;">` : ""}</td>
        <td valign="middle" style="padding:8px 0;font-size:14px;line-height:19px;"><a href="${esc(link)}" style="color:#101010;text-decoration:none;font-weight:700;">${esc(product.title)}</a></td>
        <td align="right" valign="middle" style="padding:8px 0 8px 12px;font-size:13px;color:#6b6a65;white-space:nowrap;">${plural(product.clicks, "click")}</td>
      </tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f3ee;">
<div style="display:none;max-height:0;overflow:hidden;color:#f4f3ee;">${summary.replace(/&middot;/g, "·")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3ee;">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;font-family:Arial,Helvetica,sans-serif;color:#101010;">
  <tr><td style="padding:0 0 22px;font-size:20px;line-height:22px;font-weight:700;letter-spacing:-1.4px;"><a href="${SITE}" style="color:#101010;text-decoration:none;">STREET</a></td></tr>
  <tr><td style="padding:0 0 10px;font-size:24px;line-height:29px;font-weight:700;letter-spacing:-0.8px;">${headline}</td></tr>
  ${intro ? `<tr><td style="padding:0 0 18px;font-size:15px;line-height:22px;color:#2b2a27;">${intro}</td></tr>` : ""}
  ${productRows ? `<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #dddbd3;border-bottom:1px solid #dddbd3;">${productRows}</table></td></tr>` : ""}
  <tr><td style="padding:0 0 22px;font-size:12px;line-height:18px;color:#6b6a65;">${summary} &middot; <a href="${esc(brandUrl)}" style="color:#6b6a65;">your Street page</a></td></tr>
  <tr><td style="padding:0 0 26px;font-size:15px;line-height:22px;color:#2b2a27;">We know these numbers are small right now. Street is new and growing every week, so give us a little time and they'll get bigger. We built Street to connect real customers with brands the world deserves to know about, and ${name} is one of them.<br><br>Reply anytime.<br><br>— Matthew from Street</td></tr>
  <tr><td style="padding:16px 0 0;border-top:1px solid #dddbd3;font-size:11px;line-height:17px;color:#8a8983;">
    You're getting this because ${name} is listed on <a href="${SITE}" style="color:#8a8983;">Street</a>. We only email on days we send you traffic. <a href="${esc(unsubscribeUrl)}" style="color:#8a8983;">Unsubscribe</a>.<br>Street &middot; ${esc(address)}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `${plural(stats.shoppers, "shopper")} clicked through to ${brand.name} ${when}.`,
    ...(isFirst ? ["", "We're Street, a discovery site for independent streetwear. Shoppers find you here, then buy from your store."] : []),
    "",
    ...products.map((p) => `- ${p.title}: ${plural(p.clicks, "click")}`),
    "",
    summary.replace(/&middot;/g, "·"),
    `Your Street page: ${brandUrl}`,
    "",
    `We know these numbers are small right now. Street is new and growing every week, so give us a little time and they'll get bigger. We built Street to connect real customers with brands the world deserves to know about, and ${brand.name} is one of them.`,
    "",
    "Reply anytime.",
    "— Matthew from Street",
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
    `Street · ${address}`,
  ].join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------- generate & send

export type ReportRow = {
  id: string; brand_id: string; report_date: string; status: "draft" | "sent" | "skipped" | "failed";
  to_email: string | null; subject: string; html: string; text_body: string; stats: ReportStats; is_first: boolean;
  resend_id: string | null; error: string | null; created_at: string; sent_at: string | null;
};

export function reportsConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.BRAND_REPORTS_FROM ?? "Street <reports@reports.streetdotcom.com>",
    replyTo: process.env.BRAND_REPORTS_REPLY_TO ?? "hello@streetdotcom.com",
    mailingAddress: process.env.BRAND_REPORTS_MAILING_ADDRESS ?? "",
    autoSend: process.env.BRAND_REPORTS_AUTO_SEND === "1",
    template: (process.env.BRAND_REPORTS_TEMPLATE === "short" ? "short" : "full") as ReportVariant,
  };
}

const unsubscribeUrlFor = (token: string) => `${SITE}/api/reports/unsubscribe?token=${token}`;

async function getContact(brandId: string): Promise<ContactRow> {
  const rows = await supabaseRest<ContactRow[]>(`brand_contacts?brand_id=eq.${brandId}&select=brand_id,contact_email,reports_opted_out_at,report_token`, { noStore: true });
  if (rows[0]) return rows[0];
  const created = await supabaseRest<ContactRow[]>("brand_contacts?on_conflict=brand_id", {
    method: "POST",
    body: { brand_id: brandId },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return created[0];
}

async function hasBeenSentBefore(brandId: string) {
  const rows = await supabaseRest<Array<{ id: string }>>(`brand_report_emails?brand_id=eq.${brandId}&status=eq.sent&select=id&limit=1`, { noStore: true });
  return rows.length > 0;
}

/** Builds (or rebuilds) the report row for one brand + day. Never touches a row that was already sent. */
export async function buildBrandReport(brand: BrandRow, date: string): Promise<ReportRow | null> {
  const existing = await supabaseRest<ReportRow[]>(`brand_report_emails?brand_id=eq.${brand.id}&report_date=eq.${date}&select=*`, { noStore: true });
  if (existing[0]?.status === "sent") return existing[0];

  const [stats, contact, sentBefore] = await Promise.all([computeBrandReportStats(brand.slug, date), getContact(brand.id), hasBeenSentBefore(brand.id)]);
  if (stats.clicks === 0) return null;

  const { mailingAddress } = reportsConfig();
  const rendered = renderBrandReport({ brand, stats, isFirst: !sentBefore, unsubscribeUrl: unsubscribeUrlFor(contact.report_token), mailingAddress });

  let status: ReportRow["status"] = "draft";
  let error: string | null = null;
  if (contact.reports_opted_out_at) { status = "skipped"; error = "Brand unsubscribed"; }
  else if (!contact.contact_email) { status = "skipped"; error = "No contact email on file"; }

  const saved = await supabaseRest<ReportRow[]>("brand_report_emails?on_conflict=brand_id,report_date", {
    method: "POST",
    body: {
      brand_id: brand.id, report_date: date, status, error, to_email: contact.contact_email,
      subject: rendered.subject, html: rendered.html, text_body: rendered.text, stats, is_first: !sentBefore,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return saved[0];
}

/** Sends one draft through Resend. Re-renders first so the latest address/contact/opt-out are used. */
export async function sendBrandReport(reportId: string, variant?: ReportVariant): Promise<{ ok: boolean; error?: string }> {
  const config = reportsConfig();
  const rows = await supabaseRest<Array<ReportRow & { brands: BrandRow }>>(`brand_report_emails?id=eq.${reportId}&select=*,brands(id,slug,name)`, { noStore: true });
  const row = rows[0];
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
  const rendered = renderBrandReport({ brand: row.brands, stats: row.stats, isFirst: !sentBefore, unsubscribeUrl, mailingAddress: config.mailingAddress, variant: variant ?? config.template });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `brand-report-${row.id}` },
    body: JSON.stringify({
      from: config.from,
      to: [contact.contact_email],
      reply_to: config.replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${config.replyTo}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!response.ok) return fail(`Resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const { id } = (await response.json()) as { id?: string };

  await supabaseRest(`brand_report_emails?id=eq.${reportId}`, {
    method: "PATCH",
    body: {
      status: "sent", sent_at: new Date().toISOString(), resend_id: id ?? null, error: null, to_email: contact.contact_email,
      subject: rendered.subject, html: rendered.html, text_body: rendered.text, is_first: !sentBefore,
    },
    prefer: "return=minimal",
  });
  return { ok: true };
}

/** Daily job: build a report for every brand that got outbound clicks on `date`, and send them if auto-send is on. */
export async function runDailyBrandReports(date = easternYesterday()) {
  const { start, end } = easternDayRange(date);
  const clicked = await supabaseRest<Array<{ brand_slug: string | null }>>(
    `outbound_clicks?select=brand_slug&created_at=gte.${start}&created_at=lt.${end}`,
    { noStore: true },
  );
  const slugs = [...new Set(clicked.map((row) => row.brand_slug).filter((slug): slug is string => Boolean(slug)))];
  if (!slugs.length) return { date, brands: 0, drafts: 0, skipped: 0, sent: 0, errors: [] as string[] };

  const brands = await supabaseRest<BrandRow[]>(`brands?select=id,slug,name&slug=in.(${slugs.map((s) => `"${s}"`).join(",")})`, { noStore: true });
  const config = reportsConfig();
  const result = { date, brands: brands.length, drafts: 0, skipped: 0, sent: 0, errors: [] as string[] };

  for (const brand of brands) {
    try {
      const row = await buildBrandReport(brand, date);
      if (!row) continue;
      if (row.status === "skipped") { result.skipped += 1; continue; }
      if (row.status === "sent") { result.sent += 1; continue; }
      if (config.autoSend) {
        const sent = await sendBrandReport(row.id);
        if (sent.ok) result.sent += 1; else result.errors.push(`${brand.slug}: ${sent.error}`);
      } else {
        result.drafts += 1;
      }
    } catch (error) {
      result.errors.push(`${brand.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
