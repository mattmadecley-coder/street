import { can, type Permission } from "@/lib/admin-permissions";
import type { TokenPrincipal } from "@/lib/mcp-tokens";
import { recordAudit, type Actor } from "@/lib/audit";
import { BLOCK_TYPES, FONTS, MAX_BLOCKS, TEMPLATE_PRESETS, cleanTemplate, findTemplateProblems, renderEmail, type EmailTemplateData } from "@/lib/email-blocks";
import { cleanCriteria } from "@/lib/product-criteria";
import {
  CONTACT_STATUSES, ENGAGEMENT_METRICS, SEGMENT_FIELDS, SEGMENT_PRESETS, cleanDefinition, describeDefinition, summarizeSegment,
  type SegmentDefinition,
} from "@/lib/email-segments-core";
import { getSegment, listSegments, loadContactsForSegments, saveSegment } from "@/lib/email-segments";
import { createTemplate, duplicateTemplate, getTemplate, listTemplates, updateTemplate } from "@/lib/email-templates";
import { createCampaign, computeStats, getCampaign, listCampaigns, loadCampaignSends, saveDraft } from "@/lib/email-campaigns";
import { audienceFor, cancelCampaign, prepareCampaign, sendTestEmail, runEmailQueue } from "@/lib/email-send";
import { findProductCards, siteUrl } from "@/lib/email-products";
import { getAllBrands } from "@/lib/catalog-store";

/**
 * The tools the admin MCP server offers. Each tool names the admin permission it needs; a token can
 * never do more than its owner's role allows, and the send tools additionally need a token that was
 * created with sending switched on. Everything here is validated strictly and written to the audit log.
 */
export type ToolContext = { principal: TokenPrincipal; nowMs: number; actor: Actor; runInBackground: (job: () => Promise<unknown>) => void };

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission: Permission;
  /** True for tools that email real customers. They need token.canSend as well as the role permission. */
  sends?: boolean;
  readOnly: boolean;
  run: (args: Record<string, any>, ctx: ToolContext) => Promise<unknown>;
};

export class ToolError extends Error {}

/** For calls whose errors are validation messages we wrote ("A segment with that name already exists"): show them to the assistant as-is. */
async function friendly<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw error instanceof ToolError ? error : new ToolError(error instanceof Error ? error.message : "That was not accepted.");
  }
}

const adminLink = (path: string) => `${siteUrl()}${path}`;
const uuidLike = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new ToolError(`${label} must be an id from the matching list_* tool.`);
  return value;
};
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
};

const ID_PROP = { type: "string", description: "Id returned by the list tool." } as const;

const DEFINITION_SCHEMA = {
  type: "object",
  description: "Segment rules. match=all means every rule must hold, any means at least one. See email_guide for the rule types.",
  properties: {
    match: { type: "string", enum: ["all", "any"] },
    conditions: { type: "array", maxItems: 20, items: { type: "object", properties: { type: { type: "string", enum: ["status", "field", "tag", "phone", "signed_up", "engagement", "last_opened", "last_clicked"] } }, required: ["type"], additionalProperties: true } },
  },
  required: ["conditions"],
} as const;

const TEMPLATE_PROPS = {
  name: { type: "string", description: "Internal name (only the team sees it)." },
  subject: { type: "string" },
  preheader: { type: "string", description: "Inbox preview text." },
  design: { type: "object", description: "Optional look: background, contentBackground, textColor, accent (#rrggbb), font (sans|serif|mono), footerText." },
  blocks: { type: "array", maxItems: MAX_BLOCKS, items: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPES.map((entry) => entry.type) } }, required: ["type"], additionalProperties: true }, description: "Ordered content blocks. See email_guide for each type's fields." },
} as const;

function guide() {
  return {
    overview: "Street sends email to its own customers from mail.streetdotcom.com. You build segments (who), templates (what), and campaign drafts (the two together). You cannot email customers unless this token was created with sending enabled, and even then a human-readable confirmation of the audience size is required.",
    workflow: [
      "1. email_overview and list_segments to see the audience.",
      "2. create_segment (or reuse one). Use preview_segment to check the size before saving.",
      "3. create_template. Use search_products to find real products, and a 'products' block (rules, not hard-coded items) to show them.",
      "4. preview_template to proofread the plain text and check warnings.",
      "5. create_campaign_draft with the template and segment, then send_test_email so the owner can see it in their inbox.",
      "6. A person reviews at the returned admin links. Only schedule_campaign / send_campaign if this token allows sending and the person asked for it.",
    ],
    blockTypes: {
      logo: "{type:'logo', text, imageUrl?, linkUrl?, align}",
      heading: "{type:'heading', text, level:1|2|3, align}",
      text: "{type:'text', text, align}. Blank line = new paragraph. **bold** and [label](https://…) are supported. No HTML.",
      image: "{type:'image', url (https), alt, linkUrl?}",
      button: "{type:'button', label, url, align, style:'solid'|'outline'}",
      feature: "{type:'feature', imageUrl, alt, heading, text, buttonLabel?, buttonUrl?, imageSide:'left'|'right'}",
      products: "{type:'products', title?, criteria:{brands?:[slug], group?, category?, type?, tags?:[...], minPrice?, maxPrice?, stock?:'in_stock', addedWithinDays?, onSale?}, count:1-12, columns:2|3, order:'newest'|'price_asc'|'price_desc', showPrice:boolean}",
      divider: "{type:'divider'}",
      spacer: "{type:'spacer', height:4-120}",
    },
    design: { fonts: Object.keys(FONTS), colors: "#rrggbb" },
    mergeTags: "{{site_url}} (links only), {{unsubscribe_url}} (links only; the unsubscribe footer is always added automatically), and {{first_name|there}}-style tags with a fallback. We do not store first names yet, so the fallback is always used.",
    segmentRules: {
      status: { op: "is|is_not", value: CONTACT_STATUSES },
      field: { field: SEGMENT_FIELDS.map((f) => f.value), op: "is|is_not|contains|is_empty|is_not_empty", value: "text (not needed for is_empty / is_not_empty)" },
      tag: { op: "has|has_not", value: "tag name" },
      phone: { op: "has|has_not" },
      signed_up: { op: "within_days|older_than_days", days: "1-3650" },
      engagement: { metric: ENGAGEMENT_METRICS.map((m) => m.value), op: "gte|lte|eq", value: "whole number" },
      last_opened: { op: "within_days|not_within_days|never", days: "needed unless never" },
      last_clicked: { op: "within_days|not_within_days|never", days: "needed unless never" },
    },
    segmentPresets: SEGMENT_PRESETS.map((preset) => ({ key: preset.key, name: preset.name, definition: preset.definition })),
    templatePresets: TEMPLATE_PRESETS.map((preset) => ({ key: preset.key, name: preset.name, description: preset.description })),
    rules: [
      "Only subscribed people are ever emailed; segment counts show 'sendable' separately.",
      "New sending domain: there is a daily send limit (see list_campaigns / email settings in the admin). Do not try to work around it.",
      "Never invent customer data. Use search_products for real products and links.",
      "Prefer product blocks with rules over pasting product details, so the email stays accurate when it sends.",
      "Write plain, honest copy. Do not make claims about stock, discounts or shipping that you have not verified.",
    ],
  };
}

function blocksSummary(template: EmailTemplateData) {
  return template.blocks.map((block) => ({ id: block.id, type: block.type, preview: "text" in block ? String((block as any).text).slice(0, 80) : "label" in block ? String((block as any).label) : "title" in block ? String((block as any).title) : "heading" in block ? String((block as any).heading) : "" }));
}

async function loadTemplateOrThrow(id: unknown) {
  const template = await getTemplate(uuidLike(id, "template_id"));
  if (!template) throw new ToolError("No template with that id.");
  return template;
}

function strictTemplateInput(args: Record<string, any>) {
  const problems = findTemplateProblems(args);
  if (problems.length) throw new ToolError(`The template has problems:\n- ${problems.join("\n- ")}`);
  return cleanTemplate(args).template;
}

function strictDefinition(input: unknown): SegmentDefinition {
  const { definition, dropped } = cleanDefinition(input);
  if (dropped > 0) throw new ToolError(`${dropped} rule${dropped === 1 ? " is" : "s are"} invalid or unknown. Call email_guide for the supported rule types and fields.`);
  return definition;
}

async function audienceCount(campaignId: string, nowMs: number) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new ToolError("No campaign with that id.");
  const segment = campaign.segment_id ? await getSegment(campaign.segment_id) : null;
  const audience = segment ? (await audienceFor(segment.definition, nowMs)).length : 0;
  return { campaign, segment, audience };
}

export const TOOLS: ToolDef[] = [
  {
    name: "email_guide", title: "How the email system works", readOnly: true, permission: "view",
    description: "START HERE. Returns the exact shapes for segment rules, template blocks, merge tags and the safety rules. Call once before building anything.",
    inputSchema: { type: "object", properties: {} },
    run: async () => guide(),
  },
  {
    name: "email_overview", title: "Audience overview", readOnly: true, permission: "view",
    description: "Counts of customers by status and recent signups. No personal details.",
    inputSchema: { type: "object", properties: {} },
    run: async (_args, ctx) => {
      const { contacts } = await loadContactsForSegments();
      const day = 86_400_000;
      const by = (status: string) => contacts.filter((c) => c.status === status).length;
      return { total: contacts.length, subscribed: by("subscribed"), unsubscribed: by("unsubscribed"), bounced: by("bounced"), complained: by("complained"), withPhone: contacts.filter((c) => c.phone).length, signedUpLast7Days: contacts.filter((c) => ctx.nowMs - Date.parse(c.created_at) <= 7 * day).length, signedUpLast30Days: contacts.filter((c) => ctx.nowMs - Date.parse(c.created_at) <= 30 * day).length };
    },
  },
  {
    name: "list_segments", title: "List segments", readOnly: true, permission: "view",
    description: "All saved segments with their rules and how many people can be emailed.",
    inputSchema: { type: "object", properties: {} },
    run: async (_args, ctx) => {
      const [{ segments }, { contacts }] = await Promise.all([listSegments(), loadContactsForSegments()]);
      return segments.map((segment) => ({ id: segment.id, name: segment.name, description: segment.description, rules: describeDefinition(segment.definition), definition: segment.definition, ...(() => { const s = summarizeSegment(segment.definition, contacts, ctx.nowMs, 0); return { sendable: s.sendable, matching: s.total }; })(), link: adminLink(`/admin/email/segments/${segment.id}`) }));
    },
  },
  {
    name: "get_segment", title: "Get a segment", readOnly: true, permission: "view",
    description: "One segment with its rules and size.",
    inputSchema: { type: "object", properties: { id: ID_PROP }, required: ["id"] },
    run: async (args, ctx) => {
      const segment = await getSegment(uuidLike(args.id, "id"));
      if (!segment) throw new ToolError("No segment with that id.");
      const { contacts } = await loadContactsForSegments();
      const s = summarizeSegment(segment.definition, contacts, ctx.nowMs, 0);
      return { id: segment.id, name: segment.name, description: segment.description, rules: describeDefinition(segment.definition), definition: segment.definition, sendable: s.sendable, matching: s.total, link: adminLink(`/admin/email/segments/${segment.id}`) };
    },
  },
  {
    name: "preview_segment", title: "Preview a segment's size", readOnly: true, permission: "view",
    description: "Counts who a rule set would reach, without saving anything. Sample addresses are masked.",
    inputSchema: { type: "object", properties: { definition: DEFINITION_SCHEMA }, required: ["definition"] },
    run: async (args, ctx) => {
      const definition = strictDefinition(args.definition);
      const { contacts } = await loadContactsForSegments();
      const s = summarizeSegment(definition, contacts, ctx.nowMs, 5);
      return { rules: describeDefinition(definition), sendable: s.sendable, matching: s.total, sample: s.sample.map((person) => ({ email: maskEmail(person.email), status: person.status })) };
    },
  },
  {
    name: "create_segment", title: "Create a segment", readOnly: false, permission: "email.write",
    description: "Saves a new segment. Check it first with preview_segment.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, definition: DEFINITION_SCHEMA }, required: ["name", "definition"] },
    run: async (args, ctx) => {
      const definition = strictDefinition(args.definition);
      const id = await friendly(() => saveSegment({ name: String(args.name ?? ""), description: text(args.description, 300), definition, actor: ctx.principal.email }));
      await recordAudit(ctx.actor, { action: "email.segment_create", summary: `Created the segment "${text(args.name, 80)}" (via MCP)`, targetType: "email_segment", targetId: id, details: { rules: describeDefinition(definition) } });
      return { id, link: adminLink(`/admin/email/segments/${id}`), rules: describeDefinition(definition) };
    },
  },
  {
    name: "update_segment", title: "Update a segment", readOnly: false, permission: "email.write",
    description: "Changes a segment's name, description or rules. Campaigns already scheduled or sent keep the rules they were created with.",
    inputSchema: { type: "object", properties: { id: ID_PROP, name: { type: "string" }, description: { type: "string" }, definition: DEFINITION_SCHEMA }, required: ["id"] },
    run: async (args, ctx) => {
      const existing = await getSegment(uuidLike(args.id, "id"));
      if (!existing) throw new ToolError("No segment with that id.");
      const definition = args.definition !== undefined ? strictDefinition(args.definition) : existing.definition;
      await friendly(() => saveSegment({ id: existing.id, name: args.name !== undefined ? String(args.name) : existing.name, description: args.description !== undefined ? text(args.description, 300) : existing.description, definition, actor: ctx.principal.email }));
      await recordAudit(ctx.actor, { action: "email.segment_update", summary: `Updated the segment "${existing.name}" (via MCP)`, targetType: "email_segment", targetId: existing.id, details: { rules: describeDefinition(definition) } });
      return { id: existing.id, link: adminLink(`/admin/email/segments/${existing.id}`), rules: describeDefinition(definition) };
    },
  },
  {
    name: "list_templates", title: "List email templates", readOnly: true, permission: "view",
    description: "All templates (not archived) with subject and block count.",
    inputSchema: { type: "object", properties: {} },
    run: async () => (await listTemplates()).templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, blocks: t.blocks.length, updatedAt: t.updated_at, link: adminLink(`/admin/email/templates/${t.id}`) })),
  },
  {
    name: "get_template", title: "Get a template", readOnly: true, permission: "view",
    description: "A template's full content (subject, design and every block).",
    inputSchema: { type: "object", properties: { id: ID_PROP }, required: ["id"] },
    run: async (args) => {
      const t = await loadTemplateOrThrow(args.id);
      return { id: t.id, name: t.name, subject: t.subject, preheader: t.preheader, design: t.design, blocks: t.blocks, link: adminLink(`/admin/email/templates/${t.id}`) };
    },
  },
  {
    name: "preview_template", title: "Preview a template", readOnly: true, permission: "view",
    description: "Renders a saved template (by id) or an unsaved one (pass the same fields as create_template) and returns the subject, the plain-text version, and warnings. Use it to proofread before creating a campaign.",
    inputSchema: { type: "object", properties: { id: ID_PROP, ...TEMPLATE_PROPS } },
    run: async (args) => {
      const data = args.id ? await loadTemplateOrThrow(args.id) : strictTemplateInput(args);
      const products: Record<string, any[]> = {};
      for (const block of data.blocks) if (block.type === "products") products[block.id] = await findProductCards(block.criteria, block.count, block.order).catch(() => []);
      const out = renderEmail(data, { siteUrl: siteUrl(), unsubscribeUrl: `${siteUrl()}/api/email/unsubscribe?t=preview`, products, mailingAddress: "(mailing address is added when sent)" });
      const warnings: string[] = [];
      if (!data.subject.trim()) warnings.push("No subject line yet.");
      if (!data.blocks.length) warnings.push("The template has no blocks.");
      if (!data.blocks.some((block) => block.type === "button")) warnings.push("No button or call to action.");
      for (const block of data.blocks) if (block.type === "products" && !(products[block.id]?.length)) warnings.push(`Products block "${block.title || block.id}" matches no products right now and would be left out.`);
      for (const block of data.blocks) if (block.type === "image" && !block.url) warnings.push("An image block has no URL.");
      return { subject: out.subject, preheader: data.preheader, text: out.text, htmlLength: out.html.length, blocks: blocksSummary(data), warnings, link: args.id ? adminLink(`/admin/email/templates/${args.id}`) : null };
    },
  },
  {
    name: "create_template", title: "Create an email template", readOnly: false, permission: "email.write",
    description: "Creates a template from blocks, or from a starter with `preset` (new-arrivals, announcement, brand-spotlight, blank). Returns an admin link so a person can review and tweak it in the drag-and-drop editor.",
    inputSchema: { type: "object", properties: { preset: { type: "string", enum: TEMPLATE_PRESETS.map((p) => p.key) }, ...TEMPLATE_PROPS } },
    run: async (args, ctx) => {
      let data: EmailTemplateData;
      if (args.preset && !args.blocks) {
        const preset = TEMPLATE_PRESETS.find((entry) => entry.key === args.preset);
        if (!preset) throw new ToolError(`Unknown preset. Use one of: ${TEMPLATE_PRESETS.map((p) => p.key).join(", ")}.`);
        const built = preset.build();
        data = { ...built, name: text(args.name, 80) || built.name, subject: args.subject !== undefined ? text(args.subject, 200) : built.subject, preheader: args.preheader !== undefined ? text(args.preheader, 200) : built.preheader };
      } else {
        if (!text(args.name, 80)) throw new ToolError("name is required.");
        data = strictTemplateInput(args);
      }
      const id = await createTemplate(data, ctx.principal.email);
      await recordAudit(ctx.actor, { action: "email.template_create", summary: `Created the email template "${data.name}" (via MCP)`, targetType: "email_template", targetId: id, details: { blocks: data.blocks.length } });
      return { id, link: adminLink(`/admin/email/templates/${id}`), blocks: blocksSummary(data) };
    },
  },
  {
    name: "update_template", title: "Update an email template", readOnly: false, permission: "email.write",
    description: "Replaces a template's fields. Send the complete blocks array you want (get_template first, then change it). Fields you omit are kept.",
    inputSchema: { type: "object", properties: { id: ID_PROP, ...TEMPLATE_PROPS }, required: ["id"] },
    run: async (args, ctx) => {
      const existing = await loadTemplateOrThrow(args.id);
      const merged = { name: args.name ?? existing.name, subject: args.subject ?? existing.subject, preheader: args.preheader ?? existing.preheader, design: args.design ?? existing.design, blocks: args.blocks ?? existing.blocks };
      const data = strictTemplateInput(merged);
      await updateTemplate(existing.id, data);
      await recordAudit(ctx.actor, { action: "email.template_update", summary: `Updated the email template "${data.name}" (via MCP)`, targetType: "email_template", targetId: existing.id, details: { blocks: data.blocks.length } });
      return { id: existing.id, link: adminLink(`/admin/email/templates/${existing.id}`), blocks: blocksSummary(data) };
    },
  },
  {
    name: "duplicate_template", title: "Duplicate a template", readOnly: false, permission: "email.write",
    description: "Copies a template so you can change the copy without touching the original.",
    inputSchema: { type: "object", properties: { id: ID_PROP }, required: ["id"] },
    run: async (args, ctx) => {
      const id = await duplicateTemplate(uuidLike(args.id, "id"), ctx.principal.email);
      if (!id) throw new ToolError("No template with that id.");
      await recordAudit(ctx.actor, { action: "email.template_duplicate", summary: "Duplicated an email template (via MCP)", targetType: "email_template", targetId: id });
      return { id, link: adminLink(`/admin/email/templates/${id}`) };
    },
  },
  {
    name: "search_products", title: "Search the product catalog", readOnly: true, permission: "view",
    description: "Finds live products using the same rules a products block uses. Use it to check what an email would show, or to pick real products to talk about.",
    inputSchema: { type: "object", properties: { criteria: { type: "object", description: "Same fields as a products block's criteria." }, limit: { type: "integer", minimum: 1, maximum: 24 }, order: { type: "string", enum: ["newest", "price_asc", "price_desc"] } } },
    run: async (args) => {
      const criteria = cleanCriteria(args.criteria ?? {});
      const limit = Math.min(24, Math.max(1, Math.floor(Number(args.limit)) || 8));
      const order = args.order === "price_asc" || args.order === "price_desc" ? args.order : "newest";
      return { criteria, products: await findProductCards(criteria, limit, order) };
    },
  },
  {
    name: "list_brands", title: "List brands", readOnly: true, permission: "view",
    description: "Brand slugs and names, for use in segment-free product criteria (criteria.brands).",
    inputSchema: { type: "object", properties: {} },
    run: async () => (await getAllBrands()).map((brand) => ({ slug: brand.slug, name: brand.name })),
  },
  {
    name: "list_campaigns", title: "List campaigns", readOnly: true, permission: "view",
    description: "Recent campaigns with status and recipient counts.",
    inputSchema: { type: "object", properties: {} },
    run: async () => (await listCampaigns()).campaigns.slice(0, 50).map((c) => ({ id: c.id, name: c.name, status: c.status, subject: c.subject, recipients: c.recipients_total, scheduledAt: c.scheduled_at, link: adminLink(`/admin/email/campaigns/${c.id}`) })),
  },
  {
    name: "get_campaign", title: "Get a campaign and its results", readOnly: true, permission: "view",
    description: "A campaign's setup and, once it has sent, delivery and engagement counts (people, not events).",
    inputSchema: { type: "object", properties: { id: ID_PROP }, required: ["id"] },
    run: async (args, ctx) => {
      const { campaign, segment, audience } = await audienceCount(uuidLike(args.id, "id"), ctx.nowMs);
      const stats = campaign.status === "draft" || campaign.status === "scheduled" ? null : computeStats(await loadCampaignSends(campaign.id));
      return { id: campaign.id, name: campaign.name, status: campaign.status, subject: campaign.subject, preheader: campaign.preheader, templateId: campaign.template_id, segmentId: campaign.segment_id, segment: segment?.name ?? null, audienceNow: audience, scheduledAt: campaign.scheduled_at, startedAt: campaign.started_at, completedAt: campaign.completed_at, results: stats, link: adminLink(`/admin/email/campaigns/${campaign.id}`) };
    },
  },
  {
    name: "create_campaign_draft", title: "Create a campaign draft", readOnly: false, permission: "email.write",
    description: "Creates a DRAFT campaign from a template and a segment. A draft sends nothing.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, template_id: ID_PROP, segment_id: ID_PROP, subject: { type: "string", description: "Optional. Defaults to the template's subject." }, preheader: { type: "string" } }, required: ["name", "template_id", "segment_id"] },
    run: async (args, ctx) => {
      await loadTemplateOrThrow(args.template_id);
      if (!(await getSegment(uuidLike(args.segment_id, "segment_id")))) throw new ToolError("No segment with that id.");
      const id = await createCampaign(ctx.principal.email, text(args.name, 80) || "Untitled campaign");
      await saveDraft(id, { templateId: args.template_id, segmentId: args.segment_id, subject: args.subject, preheader: args.preheader }, ctx.nowMs);
      await recordAudit(ctx.actor, { action: "email.campaign_create", summary: `Created the campaign draft "${text(args.name, 80)}" (via MCP)`, targetType: "email_campaign", targetId: id });
      const { audience } = await audienceCount(id, ctx.nowMs);
      return { id, status: "draft", audienceNow: audience, link: adminLink(`/admin/email/campaigns/${id}`), next: "Send yourself a test with send_test_email, then have a person review the link." };
    },
  },
  {
    name: "update_campaign_draft", title: "Edit a campaign draft", readOnly: false, permission: "email.write",
    description: "Changes a draft or scheduled campaign's name, template, segment, subject or preview text.",
    inputSchema: { type: "object", properties: { id: ID_PROP, name: { type: "string" }, template_id: ID_PROP, segment_id: ID_PROP, subject: { type: "string" }, preheader: { type: "string" } }, required: ["id"] },
    run: async (args, ctx) => {
      const campaign = await getCampaign(uuidLike(args.id, "id"));
      if (!campaign) throw new ToolError("No campaign with that id.");
      if (campaign.status !== "draft" && campaign.status !== "scheduled") throw new ToolError(`This campaign is ${campaign.status} and can no longer be edited.`);
      if (args.template_id !== undefined) await loadTemplateOrThrow(args.template_id);
      if (args.segment_id !== undefined && !(await getSegment(uuidLike(args.segment_id, "segment_id")))) throw new ToolError("No segment with that id.");
      await saveDraft(campaign.id, { name: args.name, templateId: args.template_id, segmentId: args.segment_id, subject: args.subject, preheader: args.preheader }, ctx.nowMs);
      await recordAudit(ctx.actor, { action: "email.campaign_save", summary: `Edited the campaign "${campaign.name}" (via MCP)`, targetType: "email_campaign", targetId: campaign.id });
      return { id: campaign.id, link: adminLink(`/admin/email/campaigns/${campaign.id}`) };
    },
  },
  {
    name: "send_test_email", title: "Send a test email to the token owner", readOnly: false, permission: "email.write",
    description: `Sends the campaign's email to the person who owns this token (never to customers), marked [TEST].`,
    inputSchema: { type: "object", properties: { campaign_id: ID_PROP }, required: ["campaign_id"] },
    run: async (args, ctx) => {
      const campaign = await getCampaign(uuidLike(args.campaign_id, "campaign_id"));
      if (!campaign) throw new ToolError("No campaign with that id.");
      if (!campaign.template_id) throw new ToolError("The campaign has no template yet.");
      const template = await loadTemplateOrThrow(campaign.template_id);
      const result = await sendTestEmail({ content: template, subject: campaign.subject || template.subject, preheader: campaign.preheader || template.preheader, to: ctx.principal.email, campaignId: campaign.id });
      if (!result.ok) throw new ToolError(`The test could not be sent: ${result.error}`);
      await recordAudit(ctx.actor, { action: "email.campaign_test", summary: "Sent a test email (via MCP)", targetType: "email_campaign", targetId: campaign.id, details: { to: ctx.principal.email } });
      return { sentTo: ctx.principal.email };
    },
  },
  {
    name: "schedule_campaign", title: "Schedule a campaign (sends to customers)", readOnly: false, permission: "email.send", sends: true,
    description: "SENDS EMAIL TO REAL CUSTOMERS at the given time. Only use when a person has explicitly asked you to. You must pass confirm_recipients equal to the audience size you were told (see get_campaign.audienceNow).",
    inputSchema: { type: "object", properties: { campaign_id: ID_PROP, send_at: { type: "string", description: "ISO 8601 time with timezone, in the future." }, confirm_recipients: { type: "integer", description: "The number of people who will be emailed, exactly as reported by get_campaign.audienceNow." } }, required: ["campaign_id", "send_at", "confirm_recipients"] },
    run: async (args, ctx) => {
      const { campaign, audience } = await audienceCount(uuidLike(args.campaign_id, "campaign_id"), ctx.nowMs);
      if (Number(args.confirm_recipients) !== audience) throw new ToolError(`The audience is ${audience} people right now, not ${args.confirm_recipients}. Re-check with get_campaign and confirm that number.`);
      await friendly(() => saveDraft(campaign.id, { scheduledAt: args.send_at }, ctx.nowMs));
      const prepared = await prepareCampaign((await getCampaign(campaign.id))!, "schedule", ctx.nowMs);
      if (!prepared.ok) throw new ToolError(prepared.error);
      await recordAudit(ctx.actor, { action: "email.campaign_schedule", summary: `Scheduled the campaign "${campaign.name}" (via MCP)`, targetType: "email_campaign", targetId: campaign.id, details: { at: args.send_at, recipients: prepared.recipients } });
      return { status: "scheduled", recipients: prepared.recipients, sendAt: args.send_at, link: adminLink(`/admin/email/campaigns/${campaign.id}`) };
    },
  },
  {
    name: "send_campaign", title: "Send a campaign now (sends to customers)", readOnly: false, permission: "email.send", sends: true,
    description: "SENDS EMAIL TO REAL CUSTOMERS IMMEDIATELY and cannot be undone. Only use when a person has explicitly asked you to send now. Pass confirm_recipients equal to get_campaign.audienceNow.",
    inputSchema: { type: "object", properties: { campaign_id: ID_PROP, confirm_recipients: { type: "integer" } }, required: ["campaign_id", "confirm_recipients"] },
    run: async (args, ctx) => {
      const { campaign, audience } = await audienceCount(uuidLike(args.campaign_id, "campaign_id"), ctx.nowMs);
      if (Number(args.confirm_recipients) !== audience) throw new ToolError(`The audience is ${audience} people right now, not ${args.confirm_recipients}. Re-check with get_campaign and confirm that number.`);
      const prepared = await prepareCampaign(campaign, "send_now", ctx.nowMs);
      if (!prepared.ok) throw new ToolError(prepared.error);
      await recordAudit(ctx.actor, { action: "email.campaign_send", summary: `Started sending the campaign "${campaign.name}" (via MCP)`, targetType: "email_campaign", targetId: campaign.id, details: { recipients: prepared.recipients } });
      ctx.runInBackground(() => runEmailQueue(Date.now(), 45_000));
      return { status: "sending", recipients: prepared.recipients, note: "Sending runs in the background and respects the daily limit. Check progress with get_campaign.", link: adminLink(`/admin/email/campaigns/${campaign.id}`) };
    },
  },
  {
    name: "cancel_campaign", title: "Cancel a scheduled or sending campaign", readOnly: false, permission: "email.send", sends: true,
    description: "Stops a scheduled or in-progress campaign. People already emailed cannot be un-emailed.",
    inputSchema: { type: "object", properties: { campaign_id: ID_PROP }, required: ["campaign_id"] },
    run: async (args, ctx) => {
      const campaign = await getCampaign(uuidLike(args.campaign_id, "campaign_id"));
      if (!campaign) throw new ToolError("No campaign with that id.");
      await cancelCampaign(campaign.id, ctx.nowMs);
      await recordAudit(ctx.actor, { action: "email.campaign_cancel", summary: `Canceled the campaign "${campaign.name}" (via MCP)`, targetType: "email_campaign", targetId: campaign.id });
      return { status: "canceled" };
    },
  },
];

/** Tools this principal may see and call: role permission and, for sending tools, a send-enabled token. */
export function toolsFor(principal: TokenPrincipal): ToolDef[] {
  return TOOLS.filter((tool) => can(principal.role, tool.permission) && (!tool.sends || principal.canSend));
}
