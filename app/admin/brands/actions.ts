"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseRest } from "@/lib/supabase-rest";
import { uploadSiteAsset } from "@/lib/supabase-storage";

export async function updateBrand(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) throw new Error("Missing brand slug.");

  const storeUrl = String(formData.get("store_url") ?? "").trim();
  const logoUrlInput = String(formData.get("logo_url") ?? "").trim();
  const featured = formData.get("is_featured") === "on";
  const logoFile = formData.get("logo_file");

  let logoUrl = logoUrlInput || null;
  if (logoFile instanceof File && logoFile.size > 0) {
    logoUrl = await uploadSiteAsset(logoFile, `brand-logos/${slug}`);
  }

  const body: Record<string, unknown> = { is_featured: featured };
  if (storeUrl) body.store_url = storeUrl;
  // Only touch logo_url if the admin actually provided one (typed a URL or
  // uploaded a file) — an empty field means "leave the scraped logo alone".
  if (logoUrlInput || logoFile instanceof File) body.logo_url = logoUrl;

  await supabaseRest(`brands?slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body, prefer: "return=minimal" });

  revalidatePath("/brands");
  revalidatePath("/");
  redirect(`/admin/brands?saved=${encodeURIComponent(slug)}`);
}
