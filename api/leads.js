function json(res, status, body) {
  return res.status(status).setHeader("Cache-Control", "no-store").json(body);
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "Method not allowed." }); }
  const origin = req.headers.origin;
  if (origin !== "https://atsfysalesagent.vercel.app") return json(res, 403, { error: "Request origin not allowed." });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 503, { error: "Lead storage is being configured. Please contact ATSFy directly." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (body.website) return json(res, 200, { ok: true });
    const clean = v => typeof v === "string" ? v.trim().slice(0, 500) : "";
    const name = clean(body.name), email = clean(body.email).toLowerCase(), phone = clean(body.phone);
    if (!name || (!email && !phone) || body.consent !== true) return json(res, 400, { error: "Please provide your name, one contact method and consent to be contacted." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: "Please enter a valid email address." });
    if (phone && !/^[+0-9() .-]{7,20}$/.test(phone)) return json(res, 400, { error: "Please enter a valid phone number." });
    const record = {
      name, email: email || null, phone: phone || null, company: clean(body.company) || null,
      industry: clean(body.industry) || null, city: clean(body.city) || null, need: clean(body.need) || null,
      budget_range: clean(body.budget) || null, timeline: clean(body.timeline) || null,
      source: "website_chat", source_url: "https://atsfysalesagent.vercel.app/",
      consent_to_contact: true, consent_at: new Date().toISOString(), status: "new"
    };
    const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/leads", {
      method: "POST", headers: { "Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key, "Prefer": "return=minimal" },
      body: JSON.stringify(record), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) { console.error("Lead storage failed:", response.status); return json(res, 502, { error: "We could not save your enquiry. Please contact ATSFy on WhatsApp." }); }
    return json(res, 201, { ok: true, message: "Thank you. Your enquiry has been shared with ATSFy." });
  } catch (error) {
    console.error("Lead intake error:", error?.name || "Error");
    return json(res, 500, { error: "Something went wrong. Please try again." });
  }
};
