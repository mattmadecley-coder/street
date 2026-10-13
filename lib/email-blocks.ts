import { cleanCriteria, type ProductCriteria } from "@/lib/product-criteria";

/**
 * Email layouts are data: a few page-level design settings plus an ordered list of blocks. The admin
 * editor, the starter templates and (later) the API/MCP all produce and read this same shape, and
 * `renderEmail` turns it into email-safe HTML. Nothing here touches the network or the database, so
 * it runs in the browser (live preview) and on the server (sending) and is fully testable.
 */

export type Align = "left" | "center" | "right";
export const FONTS = {
  sans: { label: "Clean sans-serif", stack: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" },
  serif: { label: "Classic serif", stack: "Georgia, 'Times New Roman', serif" },
  mono: { label: "Typewriter", stack: "'Courier New', Courier, monospace" },
} as const;
export type FontKey = keyof typeof FONTS;

export type EmailDesign = {
  background: string;
  contentBackground: string;
  textColor: string;
  accent: string;
  font: FontKey;
  /** Shown above the mandatory unsubscribe line. */
  footerText: string;
};

export const DEFAULT_DESIGN: EmailDesign = { background: "#f1f0ec", contentBackground: "#ffffff", textColor: "#121212", accent: "#121212", font: "sans", footerText: "" };

export type ProductsOrder = "newest" | "price_asc" | "price_desc";

export type EmailBlock =
  | { id: string; type: "logo"; text: string; imageUrl: string; linkUrl: string; align: Align }
  | { id: string; type: "heading"; text: string; level: 1 | 2 | 3; align: Align }
  | { id: string; type: "text"; text: string; align: Align }
  | { id: string; type: "image"; url: string; alt: string; linkUrl: string }
  | { id: string; type: "button"; label: string; url: string; align: Align; style: "solid" | "outline" }
  | { id: string; type: "feature"; imageUrl: string; alt: string; heading: string; text: string; buttonLabel: string; buttonUrl: string; imageSide: "left" | "right" }
  | { id: string; type: "products"; title: string; criteria: ProductCriteria; count: number; columns: 2 | 3; order: ProductsOrder; showPrice: boolean; buttonLabel: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height: number };

export type BlockType = EmailBlock["type"];

export const BLOCK_TYPES: Array<{ type: BlockType; label: string; description: string }> = [
  { type: "logo", label: "Header", description: "Your name or logo at the top" },
  { type: "heading", label: "Heading", description: "A big line of text" },
  { type: "text", label: "Text", description: "Paragraphs, with **bold** and links" },
  { type: "image", label: "Image", description: "A full-width picture" },
  { type: "button", label: "Button", description: "A call-to-action link" },
  { type: "feature", label: "Image + text", description: "A picture beside a short story" },
  { type: "products", label: "Products", description: "A grid of products from the catalog" },
  { type: "divider", label: "Divider", description: "A thin line" },
  { type: "spacer", label: "Spacer", description: "Empty space" },
];

export type EmailTemplateData = { name: string; subject: string; preheader: string; design: EmailDesign; blocks: EmailBlock[] };

export const MAX_BLOCKS = 40;

// ---------------------------------------------------------------------------
// Validation (untrusted input from the editor, the database or an API)

const str = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").slice(0, max) : "");
const line = (value: unknown, max: number) => str(value, max).replace(/\s+/g, " ").trim();
const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (value: unknown, fallback: string) => (typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback);
const align = (value: unknown, fallback: Align = "left"): Align => (value === "center" || value === "right" || value === "left" ? value : fallback);
const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Merge tags are allowed in URLs; everything else must be http(s) or mailto. */
const URL_TAG = /^\{\{\s*(unsubscribe_url|site_url)\s*\}\}$/;
export function cleanUrl(value: unknown): string {
  const raw = line(value, 2000);
  if (!raw) return "";
  if (URL_TAG.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function imageUrl(value: unknown): string {
  const url = cleanUrl(value);
  return url.startsWith("https://") || url.startsWith("http://") ? url : "";
}

export function cleanDesign(input: unknown): EmailDesign {
  const raw = (typeof input === "object" && input ? input : {}) as Record<string, unknown>;
  return {
    background: color(raw.background, DEFAULT_DESIGN.background),
    contentBackground: color(raw.contentBackground, DEFAULT_DESIGN.contentBackground),
    textColor: color(raw.textColor, DEFAULT_DESIGN.textColor),
    accent: color(raw.accent, DEFAULT_DESIGN.accent),
    font: raw.font === "serif" || raw.font === "mono" || raw.font === "sans" ? raw.font : "sans",
    footerText: str(raw.footerText, 400).trim(),
  };
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;

export function newBlockId(): string {
  return `b${Math.random().toString(36).slice(2, 10)}`;
}

/** Validates one block. Returns null when the type is unknown. Ids are kept when valid, else made up. */
export function cleanBlock(input: unknown, makeId: () => string = newBlockId): EmailBlock | null {
  if (typeof input !== "object" || !input) return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : makeId();
  switch (raw.type) {
    case "logo": return { id, type: "logo", text: line(raw.text, 80), imageUrl: imageUrl(raw.imageUrl), linkUrl: cleanUrl(raw.linkUrl), align: align(raw.align, "center") };
    case "heading": return { id, type: "heading", text: line(raw.text, 200), level: raw.level === 1 || raw.level === 3 ? raw.level : 2, align: align(raw.align) };
    case "text": return { id, type: "text", text: str(raw.text, 5000), align: align(raw.align) };
    case "image": return { id, type: "image", url: imageUrl(raw.url), alt: line(raw.alt, 200), linkUrl: cleanUrl(raw.linkUrl) };
    case "button": return { id, type: "button", label: line(raw.label, 60), url: cleanUrl(raw.url), align: align(raw.align, "center"), style: raw.style === "outline" ? "outline" : "solid" };
    case "feature": return { id, type: "feature", imageUrl: imageUrl(raw.imageUrl), alt: line(raw.alt, 200), heading: line(raw.heading, 120), text: str(raw.text, 1500), buttonLabel: line(raw.buttonLabel, 60), buttonUrl: cleanUrl(raw.buttonUrl), imageSide: raw.imageSide === "right" ? "right" : "left" };
    case "products": return {
      id, type: "products", title: line(raw.title, 120), criteria: cleanCriteria(raw.criteria), count: int(raw.count, 1, 12, 4),
      columns: raw.columns === 3 ? 3 : 2, order: raw.order === "price_asc" || raw.order === "price_desc" ? raw.order : "newest",
      showPrice: raw.showPrice !== false, buttonLabel: line(raw.buttonLabel, 40),
    };
    case "divider": return { id, type: "divider" };
    case "spacer": return { id, type: "spacer", height: int(raw.height, 4, 120, 24) };
    default: return null;
  }
}

export type CleanTemplateResult = { template: EmailTemplateData; dropped: number };

export function cleanTemplate(input: unknown, makeId: () => string = newBlockId): CleanTemplateResult {
  const raw = (typeof input === "object" && input ? input : {}) as Record<string, unknown>;
  const list = Array.isArray(raw.blocks) ? raw.blocks : [];
  const seen = new Set<string>();
  const blocks: EmailBlock[] = [];
  let dropped = 0;
  for (const item of list.slice(0, MAX_BLOCKS)) {
    const block = cleanBlock(item, makeId);
    if (!block) { dropped += 1; continue; }
    if (seen.has(block.id)) block.id = makeId();
    seen.add(block.id);
    blocks.push(block);
  }
  dropped += Math.max(0, list.length - MAX_BLOCKS);
  return { template: { name: line(raw.name, 80), subject: line(raw.subject, 200), preheader: line(raw.preheader, 200), design: cleanDesign(raw.design), blocks }, dropped };
}

/** A fresh block of the given type with sensible starter content. */
export function defaultBlock(type: BlockType, makeId: () => string = newBlockId): EmailBlock {
  const id = makeId();
  switch (type) {
    case "logo": return { id, type, text: "STREET", imageUrl: "", linkUrl: "{{site_url}}", align: "center" };
    case "heading": return { id, type, text: "Your headline", level: 2, align: "left" };
    case "text": return { id, type, text: "Write something here. Use **bold** for emphasis and [a link](https://streetdotcom.com) when you need one.", align: "left" };
    case "image": return { id, type, url: "", alt: "", linkUrl: "" };
    case "button": return { id, type, label: "Shop now", url: "{{site_url}}", align: "center", style: "solid" };
    case "feature": return { id, type, imageUrl: "", alt: "", heading: "Meet the brand", text: "A couple of sentences about why you love it.", buttonLabel: "See more", buttonUrl: "{{site_url}}", imageSide: "left" };
    case "products": return { id, type, title: "New arrivals", criteria: { addedWithinDays: 14 }, count: 4, columns: 2, order: "newest", showPrice: true, buttonLabel: "Shop" };
    case "divider": return { id, type };
    case "spacer": return { id, type, height: 24 };
  }
}

// ---------------------------------------------------------------------------
// Starter templates

export const TEMPLATE_PRESETS: Array<{ key: string; name: string; description: string; build: (makeId?: () => string) => EmailTemplateData }> = [
  {
    key: "new-arrivals",
    name: "New arrivals",
    description: "Header, a headline, a product grid and a button.",
    build: (makeId = newBlockId) => ({
      name: "New arrivals", subject: "New this week on Street", preheader: "Fresh drops from independent brands",
      design: DEFAULT_DESIGN,
      blocks: [
        defaultBlock("logo", makeId),
        { ...(defaultBlock("heading", makeId) as Extract<EmailBlock, { type: "heading" }>), text: "New this week", level: 1, align: "center" },
        { ...(defaultBlock("text", makeId) as Extract<EmailBlock, { type: "text" }>), text: "A few of our favorite drops from independent brands.", align: "center" },
        defaultBlock("products", makeId),
        defaultBlock("button", makeId),
      ],
    }),
  },
  {
    key: "announcement",
    name: "Simple announcement",
    description: "A clean text email with one button.",
    build: (makeId = newBlockId) => ({
      name: "Announcement", subject: "A quick note from Street", preheader: "",
      design: DEFAULT_DESIGN,
      blocks: [defaultBlock("logo", makeId), defaultBlock("heading", makeId), defaultBlock("text", makeId), defaultBlock("button", makeId)],
    }),
  },
  {
    key: "brand-spotlight",
    name: "Brand spotlight",
    description: "Feature one brand with a story and its products.",
    build: (makeId = newBlockId) => ({
      name: "Brand spotlight", subject: "Brand spotlight", preheader: "Meet someone new",
      design: DEFAULT_DESIGN,
      blocks: [defaultBlock("logo", makeId), defaultBlock("feature", makeId), defaultBlock("divider", makeId), { ...(defaultBlock("products", makeId) as Extract<EmailBlock, { type: "products" }>), title: "Their latest", criteria: { brands: [] } }, defaultBlock("button", makeId)],
    }),
  },
  {
    key: "blank",
    name: "Blank",
    description: "Start from an empty layout.",
    build: (makeId = newBlockId) => ({ name: "Untitled email", subject: "", preheader: "", design: DEFAULT_DESIGN, blocks: [defaultBlock("logo", makeId)] }),
  },
];

// ---------------------------------------------------------------------------
// Rendering

export type ProductCard = { title: string; brandName: string; price: number; imageUrl: string; url: string };

export type RenderContext = {
  /** Resolved products per products-block id. A block with no entry shows placeholders (editor) or is skipped (send). */
  products?: Record<string, ProductCard[]>;
  siteUrl: string;
  unsubscribeUrl: string;
  /** Used for merge tags like {{first_name|there}}. */
  values?: Record<string, string>;
  mailingAddress?: string;
  /** Editor preview: show placeholder products and a visible note for empty blocks. */
  preview?: boolean;
};

export const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Replaces {{name}} and {{name|fallback}}. Unknown names with no fallback become empty. */
export function applyMergeTags(input: string, values: Record<string, string>): string {
  return input.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, name: string, fallback: string | undefined) => {
    const value = values[name.toLowerCase()];
    return value && value.trim() ? value : (fallback ?? "").trim();
  });
}

function mergeValues(ctx: RenderContext): Record<string, string> {
  return { site_url: ctx.siteUrl, unsubscribe_url: ctx.unsubscribeUrl, ...(ctx.values ?? {}) };
}

/** Plain text → paragraphs, with **bold** and [label](url). Everything else is escaped. */
export function formatText(input: string, values: Record<string, string>): string {
  const merged = applyMergeTags(input, values);
  return merged.split(/\n{2,}/).map((paragraph) => {
    let html = escapeHtml(paragraph.trim());
    html = html.replace(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]{1,500})\)/g, (_m, label: string, href: string) => `<a href="${href.replace(/&amp;/g, "&amp;")}" style="color:inherit;text-decoration:underline;">${label}</a>`);
    html = html.replace(/\*\*([^*]{1,200})\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    return html ? `<p style="margin:0 0 14px;">${html}</p>` : "";
  }).join("");
}

function plainFromFormatted(input: string, values: Record<string, string>): string {
  return applyMergeTags(input, values).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}

const money = (value: number) => `$${(Number.isInteger(value) ? value.toString() : value.toFixed(2))}`;

const PLACEHOLDER_PRODUCTS: ProductCard[] = Array.from({ length: 12 }, (_, i) => ({ title: `Product name ${i + 1}`, brandName: "Brand", price: 48 + i * 6, imageUrl: "", url: "#" }));

function buttonHtml(label: string, href: string, design: EmailDesign, alignment: Align, style: "solid" | "outline", values: Record<string, string>): string {
  const url = applyMergeTags(href, values) || "#";
  const solid = style === "solid";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${alignment}" style="margin:0 ${alignment === "center" ? "auto" : "0"};"><tr><td style="border-radius:6px;background:${solid ? design.accent : "transparent"};border:2px solid ${design.accent};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:${solid ? design.contentBackground : design.accent};text-decoration:none;border-radius:6px;">${escapeHtml(applyMergeTags(label, values))}</a></td></tr></table>`;
}

function imgHtml(url: string, alt: string, extraStyle = "") {
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="100%" style="display:block;width:100%;height:auto;border:0;${extraStyle}">`;
}

function imageFallback(label: string, height = 160) {
  return `<div style="background:#e6e4de;color:#6b6a64;height:${height}px;line-height:${height}px;text-align:center;font-size:13px;">${escapeHtml(label)}</div>`;
}

function wrapLink(inner: string, href: string, values: Record<string, string>) {
  const url = applyMergeTags(href, values);
  return url ? `<a href="${escapeHtml(url)}" style="text-decoration:none;color:inherit;">${inner}</a>` : inner;
}

function renderBlock(block: EmailBlock, design: EmailDesign, ctx: RenderContext, values: Record<string, string>): string {
  const pad = (inner: string, vertical = 8) => `<tr><td style="padding:${vertical}px 28px;">${inner}</td></tr>`;
  switch (block.type) {
    case "logo": {
      const inner = block.imageUrl
        ? `<img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.text || "Logo")}" style="display:inline-block;max-width:200px;height:auto;border:0;">`
        : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:900;letter-spacing:-0.04em;color:${design.textColor};">${escapeHtml(applyMergeTags(block.text, values))}</span>`;
      return pad(`<div style="text-align:${block.align};padding:10px 0;">${wrapLink(inner, block.linkUrl, values)}</div>`, 14);
    }
    case "heading": {
      const size = block.level === 1 ? 30 : block.level === 2 ? 24 : 19;
      return pad(`<h${block.level} style="margin:0;font-size:${size}px;line-height:1.2;text-align:${block.align};color:${design.textColor};">${escapeHtml(applyMergeTags(block.text, values))}</h${block.level}>`, 10);
    }
    case "text":
      return pad(`<div style="font-size:16px;line-height:1.6;text-align:${block.align};color:${design.textColor};">${formatText(block.text, values)}</div>`, 4);
    case "image": {
      if (!block.url) return ctx.preview ? pad(imageFallback("Add an image URL"), 6) : "";
      return `<tr><td style="padding:6px 0;">${wrapLink(imgHtml(block.url, block.alt), block.linkUrl, values)}</td></tr>`;
    }
    case "button":
      if (!block.label || !block.url) return ctx.preview ? pad(`<div style="text-align:center;color:#6b6a64;font-size:13px;">Button needs a label and a link</div>`) : "";
      return pad(buttonHtml(block.label, block.url, design, block.align, block.style, values), 12);
    case "feature": {
      const image = `<td class="stack" valign="top" width="48%" style="width:48%;">${block.imageUrl ? imgHtml(block.imageUrl, block.alt, "border-radius:6px;") : imageFallback("Image", 180)}</td>`;
      const copy = `<td class="stack" valign="middle" width="52%" style="width:52%;padding:${block.imageSide === "left" ? "0 0 0 20px" : "0 20px 0 0"};"><h3 style="margin:0 0 8px;font-size:20px;line-height:1.25;color:${design.textColor};">${escapeHtml(applyMergeTags(block.heading, values))}</h3><div style="font-size:15px;line-height:1.55;color:${design.textColor};">${formatText(block.text, values)}</div>${block.buttonLabel && block.buttonUrl ? `<div style="margin-top:6px;">${buttonHtml(block.buttonLabel, block.buttonUrl, design, "left", "outline", values)}</div>` : ""}</td>`;
      return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${block.imageSide === "left" ? image + copy : copy + image}</tr></table>`, 10);
    }
    case "products": {
      const resolved = ctx.products?.[block.id];
      const cards = (resolved ?? (ctx.preview ? PLACEHOLDER_PRODUCTS : [])).slice(0, block.count);
      if (!cards.length) return ctx.preview ? pad(`<div style="text-align:center;color:#6b6a64;font-size:13px;padding:14px;border:1px dashed #c7c4b8;">No products match this block yet</div>`) : "";
      const widthPct = Math.floor(100 / block.columns);
      const rows: string[] = [];
      for (let i = 0; i < cards.length; i += block.columns) {
        const cells = cards.slice(i, i + block.columns).map((card) => {
          const link = (inner: string) => `<a href="${escapeHtml(card.url)}" style="text-decoration:none;color:${design.textColor};">${inner}</a>`;
          const image = card.imageUrl ? imgHtml(card.imageUrl, card.title, "border-radius:6px;") : imageFallback("", 150);
          return `<td class="stack" valign="top" width="${widthPct}%" style="width:${widthPct}%;padding:0 6px 16px;">${link(image)}<div style="padding-top:8px;font-size:14px;line-height:1.35;">${link(`<span style="color:#6b6a64;font-size:12px;">${escapeHtml(card.brandName)}</span><br><strong>${escapeHtml(card.title)}</strong>${block.showPrice ? `<br>${money(card.price)}` : ""}`)}</div></td>`;
        });
        while (cells.length < block.columns) cells.push(`<td class="stack" width="${widthPct}%" style="width:${widthPct}%;"></td>`);
        rows.push(`<tr>${cells.join("")}</tr>`);
      }
      const title = block.title ? `<h3 style="margin:0 0 12px;font-size:20px;color:${design.textColor};">${escapeHtml(applyMergeTags(block.title, values))}</h3>` : "";
      return pad(`${title}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -6px;width:calc(100% + 12px);">${rows.join("")}</table>`, 10);
    }
    case "divider":
      return pad(`<hr style="border:0;border-top:1px solid ${design.textColor}22;margin:6px 0;">`, 8);
    case "spacer":
      return `<tr><td style="height:${block.height}px;line-height:${block.height}px;font-size:1px;">&nbsp;</td></tr>`;
  }
}

/** Renders a template to email-safe HTML plus a plain-text version. The unsubscribe footer is always added. */
export function renderEmail(template: EmailTemplateData, ctx: RenderContext): { html: string; text: string; subject: string } {
  const design = template.design;
  const values = mergeValues(ctx);
  const font = FONTS[design.font].stack;
  const body = template.blocks.map((block) => renderBlock(block, design, ctx, values)).join("");
  const unsubscribe = ctx.unsubscribeUrl || "#";
  const footerNote = template.design.footerText ? `<p style="margin:0 0 8px;">${escapeHtml(applyMergeTags(template.design.footerText, values)).replace(/\n/g, "<br>")}</p>` : "";
  const address = ctx.mailingAddress ? `<p style="margin:0 0 8px;">${escapeHtml(ctx.mailingAddress)}</p>` : "";
  const footer = `<tr><td style="padding:22px 28px 28px;font-size:12px;line-height:1.5;color:#77756e;text-align:center;">${footerNote}${address}<p style="margin:0;">You are receiving this because you signed up at Street. <a href="${escapeHtml(unsubscribe)}" style="color:#77756e;text-decoration:underline;">Unsubscribe</a></p></td></tr>`;
  const preheader = template.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(applyMergeTags(template.preheader, values))}&#8203;&zwnj;&#8203;&zwnj;</div>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(applyMergeTags(template.subject, values))}</title><style>@media only screen and (max-width:620px){.stack{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important;}.shell{width:100%!important;}}</style></head><body style="margin:0;padding:0;background:${design.background};font-family:${font};color:${design.textColor};">${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${design.background};"><tr><td align="center" style="padding:20px 10px;"><table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${design.contentBackground};border-radius:10px;">${body}${footer}</table></td></tr></table></body></html>`;

  const textParts: string[] = [];
  for (const block of template.blocks) {
    switch (block.type) {
      case "logo": if (block.text) textParts.push(applyMergeTags(block.text, values)); break;
      case "heading": textParts.push(applyMergeTags(block.text, values).toUpperCase()); break;
      case "text": textParts.push(plainFromFormatted(block.text, values)); break;
      case "button": if (block.label && block.url) textParts.push(`${applyMergeTags(block.label, values)}: ${applyMergeTags(block.url, values)}`); break;
      case "feature": textParts.push([applyMergeTags(block.heading, values), plainFromFormatted(block.text, values), block.buttonUrl ? applyMergeTags(block.buttonUrl, values) : ""].filter(Boolean).join("\n")); break;
      case "products": {
        const cards = (ctx.products?.[block.id] ?? []).slice(0, block.count);
        if (cards.length) textParts.push([block.title, ...cards.map((card) => `${card.brandName} - ${card.title}${block.showPrice ? ` (${money(card.price)})` : ""}: ${card.url}`)].filter(Boolean).join("\n"));
        break;
      }
      case "divider": textParts.push("----"); break;
      default: break;
    }
  }
  if (template.design.footerText) textParts.push(applyMergeTags(template.design.footerText, values));
  if (ctx.mailingAddress) textParts.push(ctx.mailingAddress);
  textParts.push(`Unsubscribe: ${unsubscribe}`);
  return { html, text: textParts.join("\n\n"), subject: applyMergeTags(template.subject, values) };
}
