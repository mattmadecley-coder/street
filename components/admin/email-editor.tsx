"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import styles from "@/app/admin/admin.module.css";
import { BLOCK_TYPES, FONTS, MAX_BLOCKS, defaultBlock, newBlockId, renderEmail, type Align, type BlockType, type EmailBlock, type EmailDesign, type EmailTemplateData, type ProductCard } from "@/lib/email-blocks";
import { STREET_TAXONOMY } from "@/lib/street-taxonomy";
import { previewProductsAction, saveTemplateAction, uploadEmailImageAction } from "@/app/admin/email/templates/actions";

type Props = {
  id: string;
  initial: EmailTemplateData;
  brands: Array<{ slug: string; name: string }>;
  siteUrl: string;
  canWrite: boolean;
};

type Drag = { kind: "block"; index: number } | { kind: "new"; type: BlockType } | null;

const summary = (block: EmailBlock): string => {
  switch (block.type) {
    case "logo": return block.text || (block.imageUrl ? "Logo image" : "Header");
    case "heading": return block.text || "Heading";
    case "text": return block.text.replace(/\s+/g, " ").slice(0, 70) || "Text";
    case "image": return block.alt || (block.url ? "Image" : "Image (add a URL)");
    case "button": return block.label || "Button";
    case "feature": return block.heading || "Image + text";
    case "products": return block.title || "Products";
    case "divider": return "Divider";
    case "spacer": return `Spacer (${block.height}px)`;
  }
};
const labelOf = (type: BlockType) => BLOCK_TYPES.find((entry) => entry.type === type)?.label ?? type;

export function EmailEditor({ id, initial, brands, siteUrl, canWrite }: Props) {
  const [template, setTemplate] = useState<EmailTemplateData>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.blocks[0]?.id ?? null);
  const [tab, setTab] = useState<"block" | "email">("block");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [products, setProducts] = useState<Record<string, ProductCard[]>>({});
  const [drag, setDrag] = useState<Drag>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const change = useCallback((updater: (current: EmailTemplateData) => EmailTemplateData) => {
    setTemplate((current) => updater(current));
    setDirty(true);
    setStatus(null);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Live product cards: re-fetch shortly after a products block's rules change.
  const productSignature = JSON.stringify(template.blocks.filter((block) => block.type === "products"));
  useEffect(() => {
    const blocks = JSON.parse(productSignature) as EmailBlock[];
    if (!blocks.length) { setProducts({}); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await previewProductsAction(blocks);
        if (!cancelled) setProducts(found);
      } catch { /* the preview keeps showing placeholders */ }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [productSignature]);

  const rendered = useMemo(() => {
    return renderEmail(template, { siteUrl, unsubscribeUrl: "#", preview: true, products, mailingAddress: "Your mailing address appears here" }).html;
  }, [template, products, siteUrl]);

  const selected = template.blocks.find((block) => block.id === selectedId) ?? null;
  const selectedIndex = selected ? template.blocks.indexOf(selected) : -1;

  const insert = (type: BlockType, at: number) => {
    if (template.blocks.length >= MAX_BLOCKS) { setStatus({ tone: "error", text: `An email can have up to ${MAX_BLOCKS} blocks.` }); return; }
    const block = defaultBlock(type, newBlockId);
    change((current) => ({ ...current, blocks: [...current.blocks.slice(0, at), block, ...current.blocks.slice(at)] }));
    setSelectedId(block.id);
    setTab("block");
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= template.blocks.length || from === to) return;
    change((current) => {
      const blocks = [...current.blocks];
      const [item] = blocks.splice(from, 1);
      blocks.splice(to, 0, item);
      return { ...current, blocks };
    });
  };
  const remove = (index: number) => {
    const block = template.blocks[index];
    change((current) => ({ ...current, blocks: current.blocks.filter((_, i) => i !== index) }));
    if (block?.id === selectedId) setSelectedId(template.blocks[index + 1]?.id ?? template.blocks[index - 1]?.id ?? null);
  };
  const duplicate = (index: number) => {
    const copy = { ...template.blocks[index], id: newBlockId() } as EmailBlock;
    change((current) => ({ ...current, blocks: [...current.blocks.slice(0, index + 1), copy, ...current.blocks.slice(index + 1)] }));
    setSelectedId(copy.id);
  };
  const patchBlock = (blockId: string, patch: Record<string, unknown>) =>
    change((current) => ({ ...current, blocks: current.blocks.map((block) => (block.id === blockId ? ({ ...block, ...patch } as EmailBlock) : block)) }));

  const drop = (index: number) => {
    if (drag?.kind === "new") insert(drag.type, index);
    else if (drag?.kind === "block") move(drag.index, index > drag.index ? index - 1 : index);
    setDrag(null);
    setOverIndex(null);
  };
  const overItem = (event: DragEvent<HTMLElement>, index: number) => {
    if (!drag) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setOverIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
  };

  const save = () => {
    startSaving(async () => {
      const result = await saveTemplateAction(id, template);
      if (result.ok) {
        setDirty(false);
        setStatus({ tone: "ok", text: result.dropped ? `Saved. ${result.dropped} invalid block${result.dropped === 1 ? " was" : "s were"} removed.` : "Saved." });
      } else setStatus({ tone: "error", text: result.error });
    });
  };

  return (
    <div className="email-editor">
      {/* ---- Left: blocks ---- */}
      <section aria-label="Blocks" style={{ display: "grid", gap: 14 }}>
        {canWrite ? (
          <div className="adm-card">
            <div className="adm-card-head"><h2>Add a block</h2></div>
            <p className={styles.rowMeta} style={{ margin: "0 0 8px" }}>Click to add, or drag one into your email.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {BLOCK_TYPES.map((entry) => (
                <button key={entry.type} type="button" draggable className={styles.buttonSecondary} title={entry.description}
                  onDragStart={(event) => { event.dataTransfer.setData("text/plain", entry.type); event.dataTransfer.effectAllowed = "copy"; setDrag({ kind: "new", type: entry.type }); }}
                  onDragEnd={() => { setDrag(null); setOverIndex(null); }}
                  onClick={() => insert(entry.type, selectedIndex >= 0 ? selectedIndex + 1 : template.blocks.length)} style={{ textAlign: "left", cursor: "grab" }}>
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="adm-card" onDragOver={(event) => { if (drag) event.preventDefault(); }} onDrop={() => { if (overIndex !== null) drop(overIndex); }}>
          <div className="adm-card-head"><h2>Your email</h2><span className={styles.rowMeta}>{template.blocks.length} block{template.blocks.length === 1 ? "" : "s"}</span></div>
          {!template.blocks.length ? <p className={styles.rowMeta}>Empty. Add a block to start.</p> : null}
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {template.blocks.map((block, index) => (
              <li key={block.id} onDragOver={(event) => overItem(event, index)} style={{ position: "relative" }}>
                {overIndex === index && drag ? <div style={{ height: 3, background: "var(--adm-focus)", borderRadius: 2, marginBottom: 4 }} /> : null}
                <div draggable={canWrite} onDragStart={(event) => { event.dataTransfer.setData("text/plain", block.id); event.dataTransfer.effectAllowed = "move"; setDrag({ kind: "block", index }); }} onDragEnd={() => { setDrag(null); setOverIndex(null); }}
                  style={{ border: `1px solid ${block.id === selectedId ? "var(--adm-focus)" : "var(--adm-border)"}`, borderRadius: "var(--adm-radius-sm)", background: "var(--adm-surface)", padding: "8px 10px", display: "grid", gap: 6, opacity: drag?.kind === "block" && drag.index === index ? 0.5 : 1 }}>
                  <button type="button" onClick={() => { setSelectedId(block.id); setTab("block"); }} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 2 }} aria-pressed={block.id === selectedId}>
                    <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--adm-text-3)" }}>{labelOf(block.type)}</strong>
                    <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary(block)}</span>
                  </button>
                  {canWrite && block.id === selectedId ? (
                    <div className="u-row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <button type="button" className={styles.buttonSecondary} onClick={() => move(index, index - 1)} disabled={index === 0} aria-label="Move up">↑</button>
                      <button type="button" className={styles.buttonSecondary} onClick={() => move(index, index + 1)} disabled={index === template.blocks.length - 1} aria-label="Move down">↓</button>
                      <button type="button" className={styles.buttonSecondary} onClick={() => duplicate(index)}>Duplicate</button>
                      <button type="button" className={`${styles.buttonSecondary} ${styles.dangerText}`} onClick={() => remove(index)}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {drag ? <div onDragOver={(event) => { event.preventDefault(); setOverIndex(template.blocks.length); }} style={{ minHeight: 28, marginTop: 6, borderTop: overIndex === template.blocks.length ? "3px solid var(--adm-focus)" : "3px solid transparent" }} /> : null}
        </div>
      </section>

      {/* ---- Middle: preview ---- */}
      <section aria-label="Preview" className="adm-card" style={{ minWidth: 0 }}>
        <div className="adm-card-head">
          <h2>Preview</h2>
          <div className="u-row" style={{ gap: 6 }}>
            <button type="button" className={device === "desktop" ? styles.button : styles.buttonSecondary} onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"}>Desktop</button>
            <button type="button" className={device === "mobile" ? styles.button : styles.buttonSecondary} onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"}>Phone</button>
          </div>
        </div>
        <div style={{ background: "var(--adm-surface-3)", borderRadius: "var(--adm-radius)", padding: 12, display: "flex", justifyContent: "center", overflow: "auto" }}>
          <iframe title="Email preview" sandbox="" srcDoc={rendered} style={{ width: device === "mobile" ? 375 : 660, maxWidth: "100%", height: 760, border: 0, background: "#fff", borderRadius: 8 }} />
        </div>
        <p className={styles.rowMeta} style={{ margin: "8px 0 0" }}>Grey boxes are placeholders. Products come from your live catalog. The unsubscribe line is added to every email automatically.</p>
      </section>

      {/* ---- Right: settings ---- */}
      <section aria-label="Settings" style={{ display: "grid", gap: 14 }}>
        <div className="adm-card">
          <div className="u-row" style={{ gap: 6, marginBottom: 12 }}>
            <button type="button" className={tab === "block" ? styles.button : styles.buttonSecondary} onClick={() => setTab("block")} aria-pressed={tab === "block"}>Block</button>
            <button type="button" className={tab === "email" ? styles.button : styles.buttonSecondary} onClick={() => setTab("email")} aria-pressed={tab === "email"}>Email settings</button>
          </div>
          {tab === "email" ? (
            <EmailSettings template={template} change={change} disabled={!canWrite} />
          ) : selected ? (
            <BlockSettings block={selected} patch={(patch) => patchBlock(selected.id, patch)} brands={brands} disabled={!canWrite} />
          ) : <p className={styles.rowMeta}>Select a block in your email to edit it.</p>}
        </div>

        <div className="adm-card" style={{ position: "sticky", top: 70 }}>
          {canWrite ? (
            <>
              <button type="button" className={styles.button} onClick={save} disabled={saving || !dirty} style={{ width: "100%" }}>{saving ? "Saving…" : dirty ? "Save" : "Saved"}</button>
              <p role="status" aria-live="polite" className={status?.tone === "error" ? styles.noticeError : styles.rowMeta} style={{ margin: "8px 0 0" }}>{status ? status.text : dirty ? "You have unsaved changes." : "All changes saved."}</p>
            </>
          ) : <p className={styles.rowMeta}>You have view-only access.</p>}
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className={styles.field} style={{ display: "grid", gap: 4 }}>
      <span>{label}</span>
      {children}
      {hint ? <small className={styles.rowMeta}>{hint}</small> : null}
    </label>
  );
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <Field label={label}>
      <span className="u-row" style={{ gap: 8 }}>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={label} style={{ width: 44, height: 34, padding: 2 }} />
        <code>{value}</code>
      </span>
    </Field>
  );
}

function EmailSettings({ template, change, disabled }: { template: EmailTemplateData; change: (updater: (current: EmailTemplateData) => EmailTemplateData) => void; disabled: boolean }) {
  const design = (patch: Partial<EmailDesign>) => change((current) => ({ ...current, design: { ...current.design, ...patch } }));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Template name (only you see this)"><input type="text" value={template.name} maxLength={80} onChange={(event) => change((current) => ({ ...current, name: event.target.value }))} disabled={disabled} /></Field>
      <Field label="Subject line" hint="What people see in their inbox. Merge tags like {{first_name|there}} work."><input type="text" value={template.subject} maxLength={200} onChange={(event) => change((current) => ({ ...current, subject: event.target.value }))} disabled={disabled} /></Field>
      <Field label="Preview text" hint="The grey text after the subject in most inboxes."><input type="text" value={template.preheader} maxLength={200} onChange={(event) => change((current) => ({ ...current, preheader: event.target.value }))} disabled={disabled} /></Field>
      <Field label="Font">
        <select value={template.design.font} onChange={(event) => design({ font: event.target.value as EmailDesign["font"] })} disabled={disabled}>
          {Object.entries(FONTS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}
        </select>
      </Field>
      <ColorField label="Page background" value={template.design.background} onChange={(value) => design({ background: value })} disabled={disabled} />
      <ColorField label="Email background" value={template.design.contentBackground} onChange={(value) => design({ contentBackground: value })} disabled={disabled} />
      <ColorField label="Text colour" value={template.design.textColor} onChange={(value) => design({ textColor: value })} disabled={disabled} />
      <ColorField label="Button colour" value={template.design.accent} onChange={(value) => design({ accent: value })} disabled={disabled} />
      <Field label="Footer note (optional)" hint="Shown above the unsubscribe line."><textarea rows={3} value={template.design.footerText} maxLength={400} onChange={(event) => design({ footerText: event.target.value })} disabled={disabled} /></Field>
    </div>
  );
}

function AlignField({ value, onChange, disabled }: { value: Align; onChange: (value: Align) => void; disabled: boolean }) {
  return (
    <Field label="Alignment">
      <select value={value} onChange={(event) => onChange(event.target.value as Align)} disabled={disabled}>
        <option value="left">Left</option>
        <option value="center">Centre</option>
        <option value="right">Right</option>
      </select>
    </Field>
  );
}

function ImageField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadEmailImageAction(form).catch(() => ({ ok: false as const, error: "Upload failed." }));
    setBusy(false);
    if (result.ok) onChange(result.url); else setError(result.error);
    if (input.current) input.current.value = "";
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <Field label={label}><input type="url" value={value} placeholder="https://…" onChange={(event) => onChange(event.target.value)} disabled={disabled} /></Field>
      {!disabled ? (
        <div className="u-row" style={{ gap: 8, alignItems: "center" }}>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} disabled={busy} aria-label={`Upload ${label}`} />
          {busy ? <span className={styles.rowMeta}>Uploading…</span> : null}
        </div>
      ) : null}
      {error ? <span className={styles.noticeError} role="alert">{error}</span> : null}
      {value ? <img src={value} alt="" style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain", borderRadius: 6 }} /> : null}
    </div>
  );
}

function BlockSettings({ block, patch, brands, disabled }: { block: EmailBlock; patch: (patch: Record<string, unknown>) => void; brands: Array<{ slug: string; name: string }>; disabled: boolean }) {
  const text = (key: string, label: string, value: string, extra: { max?: number; hint?: string; rows?: number; type?: string } = {}) => (
    <Field label={label} hint={extra.hint}>
      {extra.rows ? <textarea rows={extra.rows} value={value} maxLength={extra.max} onChange={(event) => patch({ [key]: event.target.value })} disabled={disabled} /> : <input type={extra.type ?? "text"} value={value} maxLength={extra.max} onChange={(event) => patch({ [key]: event.target.value })} disabled={disabled} />}
    </Field>
  );
  switch (block.type) {
    case "logo":
      return (<div style={{ display: "grid", gap: 12 }}>{text("text", "Name shown", block.text, { max: 80 })}<ImageField label="Or a logo image" value={block.imageUrl} onChange={(value) => patch({ imageUrl: value })} disabled={disabled} />{text("linkUrl", "Link when clicked", block.linkUrl, { type: "text", hint: "Use {{site_url}} for your website." })}<AlignField value={block.align} onChange={(value) => patch({ align: value })} disabled={disabled} /></div>);
    case "heading":
      return (<div style={{ display: "grid", gap: 12 }}>{text("text", "Heading", block.text, { max: 200 })}<Field label="Size"><select value={block.level} onChange={(event) => patch({ level: Number(event.target.value) })} disabled={disabled}><option value={1}>Large</option><option value={2}>Medium</option><option value={3}>Small</option></select></Field><AlignField value={block.align} onChange={(value) => patch({ align: value })} disabled={disabled} /></div>);
    case "text":
      return (<div style={{ display: "grid", gap: 12 }}>{text("text", "Text", block.text, { rows: 9, max: 5000, hint: "Leave a blank line between paragraphs. **bold** and [link text](https://…) are supported." })}<AlignField value={block.align} onChange={(value) => patch({ align: value })} disabled={disabled} /></div>);
    case "image":
      return (<div style={{ display: "grid", gap: 12 }}><ImageField label="Image" value={block.url} onChange={(value) => patch({ url: value })} disabled={disabled} />{text("alt", "Describe the image", block.alt, { max: 200, hint: "Shown if the image is blocked, and read aloud by screen readers." })}{text("linkUrl", "Link when clicked (optional)", block.linkUrl, { type: "text" })}</div>);
    case "button":
      return (<div style={{ display: "grid", gap: 12 }}>{text("label", "Button text", block.label, { max: 60 })}{text("url", "Link", block.url, { type: "text", hint: "Use {{site_url}} for your website." })}<Field label="Style"><select value={block.style} onChange={(event) => patch({ style: event.target.value })} disabled={disabled}><option value="solid">Filled</option><option value="outline">Outline</option></select></Field><AlignField value={block.align} onChange={(value) => patch({ align: value })} disabled={disabled} /></div>);
    case "feature":
      return (<div style={{ display: "grid", gap: 12 }}><ImageField label="Image" value={block.imageUrl} onChange={(value) => patch({ imageUrl: value })} disabled={disabled} />{text("alt", "Describe the image", block.alt, { max: 200 })}{text("heading", "Heading", block.heading, { max: 120 })}{text("text", "Text", block.text, { rows: 5, max: 1500 })}{text("buttonLabel", "Button text (optional)", block.buttonLabel, { max: 60 })}{text("buttonUrl", "Button link", block.buttonUrl, { type: "text" })}<Field label="Image on the"><select value={block.imageSide} onChange={(event) => patch({ imageSide: event.target.value })} disabled={disabled}><option value="left">Left</option><option value="right">Right</option></select></Field></div>);
    case "divider":
      return <p className={styles.rowMeta}>A thin line. Nothing to set.</p>;
    case "spacer":
      return (<Field label={`Height: ${block.height}px`}><input type="range" min={4} max={120} value={block.height} onChange={(event) => patch({ height: Number(event.target.value) })} disabled={disabled} /></Field>);
    case "products":
      return <ProductsSettings block={block} patch={patch} brands={brands} disabled={disabled} />;
  }
}

function ProductsSettings({ block, patch, brands, disabled }: { block: Extract<EmailBlock, { type: "products" }>; patch: (patch: Record<string, unknown>) => void; brands: Array<{ slug: string; name: string }>; disabled: boolean }) {
  const criteria = block.criteria;
  const setCriteria = (next: Record<string, unknown>) => patch({ criteria: { ...criteria, ...next } });
  const selectedBrands = new Set(criteria.brands ?? []);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Section title"><input type="text" value={block.title} maxLength={120} onChange={(event) => patch({ title: event.target.value })} disabled={disabled} /></Field>
      <p className={styles.rowMeta} style={{ margin: 0 }}>Which products to show. Leave everything empty to show the newest products.</p>
      <Field label="Brands (any of these)">
        <select multiple size={5} value={[...selectedBrands]} onChange={(event) => setCriteria({ brands: Array.from(event.target.selectedOptions, (option) => option.value) })} disabled={disabled}>
          {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
        </select>
      </Field>
      <Field label="Group">
        <select value={criteria.group ?? ""} onChange={(event) => setCriteria({ group: event.target.value || undefined, category: undefined, type: undefined })} disabled={disabled}>
          <option value="">Any</option>
          {Object.keys(STREET_TAXONOMY).map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
      </Field>
      <Field label="Category (needs a group)"><input type="text" value={criteria.category ?? ""} onChange={(event) => setCriteria({ category: event.target.value || undefined })} disabled={disabled || !criteria.group} placeholder="e.g. Sneakers" /></Field>
      <Field label="Tags (comma-separated)"><input type="text" value={(criteria.tags ?? []).join(", ")} onChange={(event) => setCriteria({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} disabled={disabled} /></Field>
      <div className="u-row" style={{ gap: 8 }}>
        <Field label="Lowest $"><input type="number" min={0} value={criteria.minPrice ?? ""} onChange={(event) => setCriteria({ minPrice: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={disabled} /></Field>
        <Field label="Highest $"><input type="number" min={0} value={criteria.maxPrice ?? ""} onChange={(event) => setCriteria({ maxPrice: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={disabled} /></Field>
      </div>
      <Field label="Only products added in the last N days"><input type="number" min={1} max={3650} value={criteria.addedWithinDays ?? ""} onChange={(event) => setCriteria({ addedWithinDays: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={disabled} /></Field>
      <label className={styles.checkboxField}><input type="checkbox" checked={criteria.stock === "in_stock"} onChange={(event) => setCriteria({ stock: event.target.checked ? "in_stock" : undefined })} disabled={disabled} /> In stock only</label>
      <label className={styles.checkboxField}><input type="checkbox" checked={criteria.onSale ?? false} onChange={(event) => setCriteria({ onSale: event.target.checked || undefined })} disabled={disabled} /> Marked down only</label>
      <hr style={{ border: 0, borderTop: "1px solid var(--adm-border)", width: "100%" }} />
      <div className="u-row" style={{ gap: 8 }}>
        <Field label="How many"><input type="number" min={1} max={12} value={block.count} onChange={(event) => patch({ count: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} disabled={disabled} /></Field>
        <Field label="Columns"><select value={block.columns} onChange={(event) => patch({ columns: Number(event.target.value) })} disabled={disabled}><option value={2}>2</option><option value={3}>3</option></select></Field>
      </div>
      <Field label="Order"><select value={block.order} onChange={(event) => patch({ order: event.target.value })} disabled={disabled}><option value="newest">Newest first</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></Field>
      <label className={styles.checkboxField}><input type="checkbox" checked={block.showPrice} onChange={(event) => patch({ showPrice: event.target.checked })} disabled={disabled} /> Show prices</label>
    </div>
  );
}
