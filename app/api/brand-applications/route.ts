import { NextResponse } from "next/server";
import { supabaseRest } from "@/lib/supabase-rest";

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const application = {
      brand_name: clean(body.brandName, 140),
      applicant_name: clean(body.applicantName, 140),
      role: clean(body.role, 140),
      website: clean(body.website, 500),
      instagram: clean(body.instagram, 300),
      fulfillment: clean(body.fulfillment, 40),
      direct_checkout_interest: clean(body.directCheckout, 40),
      phone: clean(body.phone, 80),
      email: clean(body.email, 240).toLowerCase(),
      notes: clean(body.notes, 3000),
      status: "new",
    };

    if (!application.brand_name || !application.applicant_name || !application.website || !application.instagram || !application.phone || !application.email || !application.fulfillment || !application.direct_checkout_interest) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!/^https?:\/\//i.test(application.website) || !application.email.includes("@")) {
      return NextResponse.json({ error: "Invalid website or email" }, { status: 400 });
    }

    await supabaseRest("brand_applications", { method: "POST", body: application, prefer: "return=minimal" });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Brand application submission failed", error);
    return NextResponse.json({ error: "Unable to submit application" }, { status: 500 });
  }
}
