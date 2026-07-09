export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Fallback slug/name source when the admin leaves the brand name blank — derived from the store URL's hostname. */
export function slugFromUrl(url: string): { slug: string; name: string } | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    const base = hostname.replace(/\.(com|net|org|co|store|shop|clothing|de|uk|us|io)$/i, "");
    const slug = slugify(base);
    const name = base
      .split(/[.-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return slug ? { slug, name: name || slug } : null;
  } catch {
    return null;
  }
}
