import { fetchBrandMetadata } from "@/lib/brand-metadata";
import type { StreetBrand } from "@/lib/brands";

export type LogoCandidate = { url: string; source: "heuristic" | "ai" };

const headers = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)",
};

/**
 * Finds a brand's logo image for the /admin/brands/new wizard's "find logo"
 * step. Tries the fast, free heuristic first (same header-image scoring used
 * by the daily brand-metadata sync, see lib/brand-metadata.ts) — most brand
 * sites put their logo in a <header>, so this alone succeeds most of the
 * time. If that finds nothing (logo lives outside <header>, or the markup is
 * unusual), falls back to asking a cheap text-only OpenRouter model to pick
 * the likely logo from every <img> tag's src/alt/class on the homepage — no
 * image bytes are sent, just tag attributes, so this stays cheap even as a
 * fallback for every miss.
 */
export async function findBrandLogo(storeUrl: string): Promise<LogoCandidate | null> {
  const draftBrand = { slug: "draft", name: "", storeUrl } as StreetBrand;
  const metadata = await fetchBrandMetadata(draftBrand);
  if (metadata.logoUrl) return { url: metadata.logoUrl, source: "heuristic" };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(storeUrl, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const html = await response.text();
    const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];

    const candidates = imgTags
      .slice(0, 80)
      .map((tag) => {
        const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1];
        const alt = tag.match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
        const className = tag.match(/\bclass\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
        if (!src || src.startsWith("data:")) return null;
        try {
          return { url: new URL(src.replace(/\\u0026/g, "&"), storeUrl).toString(), alt, className };
        } catch {
          return null;
        }
      })
      .filter((candidate): candidate is { url: string; alt: string; className: string } => Boolean(candidate));

    if (!candidates.length) return null;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: process.env.STREET_CLASSIFIER_MODEL ?? "deepseek/deepseek-chat",
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: "You are picking a brand's own logo/wordmark image out of a list of <img> tags found on their homepage. Each item has a url, alt text, and CSS class. Respond with ONLY the exact url of the single image most likely to be the site's logo (look for alt/class mentioning logo, brand, wordmark, or header; it's usually near the top of the page and not a product photo, banner, or icon). If nothing looks like a logo, respond with exactly: none",
          },
          { role: "user", content: JSON.stringify(candidates.slice(0, 40)) },
        ],
      }),
    });
    if (!aiResponse.ok) return null;
    const payload = await aiResponse.json();
    const text = (payload?.choices?.[0]?.message?.content ?? "").trim();
    if (!text || text.toLowerCase() === "none") return null;
    const matched = candidates.find((candidate) => candidate.url === text);
    if (matched) return { url: matched.url, source: "ai" };
    return text.startsWith("http") ? { url: text, source: "ai" } : null;
  } catch (error) {
    console.error("Street AI logo finder failed", error);
    return null;
  }
}
