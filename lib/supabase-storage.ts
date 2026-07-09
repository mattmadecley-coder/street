// Uploads admin-provided images (brand logos, homepage hero image) to the
// public "site-assets" Supabase Storage bucket (see
// supabase/migrations/0008_site_assets_storage_bucket.sql) and returns the
// public URL. Used from admin server actions, which receive a File via
// FormData.

function getConfig() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !serviceKey) return null;
  const url = rawUrl.trim().replace(/\/$/, "").replace(/\/rest\/v1$/i, "");
  return { url, serviceKey };
}

function safeFileName(name: string) {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "upload";
}

export async function uploadSiteAsset(file: File, pathPrefix: string): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  if (!file.size) throw new Error("No file was uploaded.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be 8MB or smaller.");

  const path = `${pathPrefix}/${Date.now()}-${safeFileName(file.name)}`;
  const bytes = await file.arrayBuffer();

  const response = await fetch(`${config.url}/storage/v1/object/site-assets/${path}`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
      "Cache-Control": "31536000",
    },
    body: bytes,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Image upload failed (${response.status}): ${text || "unknown error"}`);
  }

  return `${config.url}/storage/v1/object/public/site-assets/${path}`;
}
