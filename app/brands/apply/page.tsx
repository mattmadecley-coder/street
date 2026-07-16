"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const initial = { brandName: "", applicantName: "", role: "", website: "", instagram: "", fulfillment: "", directCheckout: "", phone: "", email: "", notes: "" };

export default function BrandApplicationPage() {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    const response = await fetch("/api/brand-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setStatus(response.ok ? "sent" : "error");
  }

  if (status === "sent") return (
    <main className="application-shell">
      <div className="application-success"><p className="eyebrow">Application received</p><h1>Thanks for putting us on.</h1><p>We review every application carefully, and not every brand is accepted. If we believe your label is making a positive impact on the culture and is a strong fit for Street, someone from the Street team will contact you within 3–5 business days.</p><Link href="/" className="cta"><span>Back to Street</span><span>→</span></Link></div>
    </main>
  );

  const field = (name: keyof typeof form) => ({ value: form[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [name]: event.target.value }) });

  return (
    <main className="application-shell">
      <div className="application-intro"><Link href="/" className="wordmark">STREET</Link><p className="eyebrow">For independent labels</p><h1>Want your brand featured?</h1><p>Tell us what you’re building. Street reviews labels for originality, product quality, consistency, and their contribution to streetwear culture.</p></div>
      <form className="application-form" onSubmit={submit}>
        <label>Brand name<input required {...field("brandName")} /></label>
        <div className="form-grid"><label>Your name<input required {...field("applicantName")} /></label><label>Your role<input required placeholder="Founder, marketing, manager…" {...field("role")} /></label></div>
        <label>Brand website<input required type="url" placeholder="https://" {...field("website")} /></label>
        <label>Brand Instagram<input required placeholder="@yourbrand or profile URL" {...field("instagram")} /></label>
        <fieldset><legend>How are your products fulfilled?</legend><p><strong>Pre-made:</strong> inventory is produced before customers order. <strong>Pre-order:</strong> customers order first and production or shipping happens later.</p><label className="radio"><input required type="radio" name="fulfillment" value="premade" onChange={(e) => setForm({ ...form, fulfillment: e.target.value })} /> Mostly pre-made</label><label className="radio"><input type="radio" name="fulfillment" value="preorder" onChange={(e) => setForm({ ...form, fulfillment: e.target.value })} /> Mostly pre-order</label><label className="radio"><input type="radio" name="fulfillment" value="both" onChange={(e) => setForm({ ...form, fulfillment: e.target.value })} /> A mix of both</label></fieldset>
        <fieldset><legend>Would you be interested in letting customers buy directly through Street in the future?</legend><p>Direct checkout can reduce the extra step between discovery and purchase. Participation would be optional and discussed with approved brands.</p><label className="radio"><input required type="radio" name="directCheckout" value="yes" onChange={(e) => setForm({ ...form, directCheckout: e.target.value })} /> Yes, I’m interested</label><label className="radio"><input type="radio" name="directCheckout" value="maybe" onChange={(e) => setForm({ ...form, directCheckout: e.target.value })} /> Maybe — send me details</label><label className="radio"><input type="radio" name="directCheckout" value="no" onChange={(e) => setForm({ ...form, directCheckout: e.target.value })} /> Not right now</label></fieldset>
        <div className="form-grid"><label>Phone number<input required type="tel" {...field("phone")} /></label><label>Email<input required type="email" {...field("email")} /></label></div>
        <label>Anything else we should know?<textarea rows={5} placeholder="Tell us about the brand, community, releases, or why Street is a fit." {...field("notes")} /></label>
        {status === "error" ? <p className="form-error">We couldn’t submit the application. Please try again.</p> : null}
        <button className="cta" type="submit" disabled={status === "sending"}><span>{status === "sending" ? "Submitting…" : "Submit application"}</span><span>→</span></button>
      </form>
    </main>
  );
}
