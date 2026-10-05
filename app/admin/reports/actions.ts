"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseRest } from "@/lib/supabase-rest";
import { runDailyBrandReports, sendBrandReport, easternYesterday } from "@/lib/brand-report";
import { refreshBrandContact } from "@/lib/brand-contact-finder";

const back = (params: Record<string, string>) => redirect(`/admin/reports?${new URLSearchParams(params).toString()}`);

export async function sendReportAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const variant = formData.get("variant") === "short" ? "short" : formData.get("variant") === "full" ? "full" : undefined;
  const result = await sendBrandReport(id, variant);
  revalidatePath("/admin/reports");
  back(result.ok ? { sent: "1" } : { error: result.error ?? "Send failed" });
}

export async function sendAllDraftsAction(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  const drafts = await supabaseRest<Array<{ id: string }>>(`brand_report_emails?status=eq.draft&report_date=eq.${date}&select=id`, { noStore: true });
  const errors: string[] = [];
  let sent = 0;
  for (const draft of drafts) {
    const result = await sendBrandReport(draft.id);
    if (result.ok) sent += 1; else errors.push(result.error ?? "failed");
  }
  revalidatePath("/admin/reports");
  back(errors.length ? { error: `Sent ${sent}; ${errors.length} failed: ${errors[0]}` } : { sent: String(sent) });
}

export async function skipReportAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await supabaseRest(`brand_report_emails?id=eq.${id}&status=neq.sent`, { method: "PATCH", body: { status: "skipped", error: "Skipped by admin" }, prefer: "return=minimal" });
  revalidatePath("/admin/reports");
  back({ skipped: "1" });
}

export async function generateReportsAction(formData: FormData) {
  const date = String(formData.get("date") ?? "") || easternYesterday();
  const result = await runDailyBrandReports(date);
  revalidatePath("/admin/reports");
  back(result.errors.length
    ? { error: `${result.errors.length} problem(s): ${result.errors[0]}` }
    : { generated: `${date}: ${result.drafts} draft(s), ${result.sent} sent, ${result.skipped} skipped` });
}

/** Set a brand's contact email by hand (wins over the automatic finder from then on). Blank clears it. */
export async function saveContactAction(formData: FormData) {
  const brandId = String(formData.get("brand_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back({ error: `"${email}" doesn't look like an email address` });
  const now = new Date().toISOString();
  await supabaseRest("brand_contacts?on_conflict=brand_id", {
    method: "POST",
    body: { brand_id: brandId, contact_email: email || null, contact_email_source: email ? "manual" : null, contact_email_checked_at: now, updated_at: now },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  // Un-skip drafts that were only skipped for lack of an address.
  if (email) {
    await supabaseRest(`brand_report_emails?brand_id=eq.${brandId}&status=eq.skipped&error=eq.No%20contact%20email%20on%20file`, {
      method: "PATCH", body: { status: "draft", error: null, to_email: email }, prefer: "return=minimal",
    });
  }
  revalidatePath("/admin/reports");
  back({ contact: "1" });
}

/** Runs the contact finder for every brand that hasn't been checked yet (or all, with ?all). Runs in the background. */
export async function findContactsAction(formData: FormData) {
  const all = formData.get("all") === "1";
  const brands = await supabaseRest<Array<{ id: string; store_url: string; brand_contacts: { contact_email_checked_at: string | null; contact_email_source: string | null } | null }>>(
    "brands?select=id,store_url,brand_contacts(contact_email_checked_at,contact_email_source)&is_active=eq.true",
    { noStore: true },
  );
  const todo = brands.filter((brand) => brand.brand_contacts?.contact_email_source !== "manual" && (all || !brand.brand_contacts?.contact_email_checked_at));
  after(async () => {
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map((brand) => refreshBrandContact({ id: brand.id, storeUrl: brand.store_url }).catch((error) => console.error("contact finder", brand.store_url, error))));
    }
  });
  back({ finding: String(todo.length) });
}
