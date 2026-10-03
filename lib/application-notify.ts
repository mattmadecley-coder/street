// Emails the site owner when a brand submits the apply form. Uses Resend's
// HTTP API directly (no SDK dependency). Entirely best-effort: if the key
// isn't configured or Resend is down, the application is still saved in the
// database and the caller just logs the failure.

type Application = {
  brand_name: string;
  applicant_name: string;
  role: string;
  website: string;
  instagram: string;
  fulfillment: string;
  direct_checkout_interest: string;
  phone: string;
  email: string;
  notes: string;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function notifyNewBrandApplication(application: Application): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set; skipping brand application email");
    return;
  }

  const to = (process.env.APPLICATION_NOTIFY_TO ?? "mattmadecley@gmail.com").split(",").map((address) => address.trim()).filter(Boolean);
  const from = process.env.APPLICATION_FROM ?? "Street Applications <apply@streetdotcom.com>";

  const rows: Array<[string, string]> = [
    ["Brand", application.brand_name],
    ["Applicant", `${application.applicant_name} (${application.role || "role not given"})`],
    ["Email", application.email],
    ["Phone", application.phone],
    ["Website", application.website],
    ["Instagram", application.instagram],
    ["Fulfillment", application.fulfillment],
    ["Direct checkout interest", application.direct_checkout_interest],
    ["Notes", application.notes || "(none)"],
  ];

  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `<h2>New brand application: ${escapeHtml(application.brand_name)}</h2><table cellpadding="6" style="border-collapse:collapse">${rows
    .map(([label, value]) => `<tr><td style="font-weight:700;vertical-align:top">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("")}</table><p>Reply directly to this email to respond to the applicant.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      reply_to: application.email,
      subject: `New Street brand application: ${application.brand_name}`,
      text,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}
