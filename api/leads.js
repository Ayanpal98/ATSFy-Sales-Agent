function json(res, status, body) {
  return res.status(status).setHeader("Cache-Control", "no-store").json(body);
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "Method not allowed." }); }
  const origin = req.headers.origin;
  let allowedOrigin = false;
  try {
    const host = new URL(origin).hostname;
    allowedOrigin = new URL(origin).protocol === "https:" &&
      (host === "atsfysalesagent.vercel.app" || /^atsfysalesagent-[a-z0-9-]+-ayanpal98s-projects\.vercel\.app$/.test(host));
  } catch {}
  if (!allowedOrigin) return json(res, 403, { error: "Request origin not allowed." });
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
    const company = clean(body.company), industry = clean(body.industry), city = clean(body.city);
    const need = clean(body.need), budget = clean(body.budget), timeline = clean(body.timeline);
    // Transparent completeness score; this is a prioritisation aid, not an AI prediction.
    const leadScore = Math.min(100, 20 + (company ? 10 : 0) + (industry ? 10 : 0) +
      (city ? 5 : 0) + (need ? 25 : 0) + (budget ? 15 : 0) + (timeline ? 10 : 0) +
      (email ? 5 : 0) + (phone ? 5 : 0));
    const record = {
      name, email: email || null, phone: phone || null, company: company || null,
      industry: industry || null, city: city || null, need: need || null,
      budget_range: budget || null, timeline: timeline || null, lead_score: leadScore,
      source: "website_chat", source_url: "https://atsfysalesagent.vercel.app/",
      consent_to_contact: true, consent_at: new Date().toISOString(), status: "new"
    };
    const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/leads", {
      method: "POST", headers: { "Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key, "Prefer": "return=representation" },
      body: JSON.stringify(record), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) { console.error("Lead storage failed:", response.status); return json(res, 502, { error: "We could not save your enquiry. Please contact ATSFy on WhatsApp." }); }
    const inserted = await response.json().catch(() => []);
    const leadId = Array.isArray(inserted) ? inserted[0]?.id : null;
    if (leadId) {
      try {
        await fetch(url.replace(/\/$/, "") + "/rest/v1/lead_activities", {
          method: "POST", headers: { "Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key, "Prefer": "return=minimal" },
          body: JSON.stringify({ lead_id: leadId, activity_type: "system", content: "Lead created through the consented ATSFy website enquiry form." }),
          signal: AbortSignal.timeout(8000)
        });
      } catch (error) { console.warn("Lead creation activity was not recorded:", error?.name || "Error"); }
    }
    if (leadId && body.save_conversation === true && Array.isArray(body.transcript)) {
      const sessionId = typeof body.session_id === "string" && /^[0-9a-f-]{36}$/i.test(body.session_id) ? body.session_id : null;
      const transcript = body.transcript.slice(-24).filter(item => item && ["user","model"].includes(item.role) && typeof item.content === "string")
        .map(item => ({ role: item.role, content: item.content.trim().slice(0, 4000) })).filter(item => item.content);
      if (sessionId && transcript.length) {
        try {
          const saved = await fetch(url.replace(/\/$/, "") + "/rest/v1/conversations", {
            method: "POST", headers: { "Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key, "Prefer": "return=minimal" },
            body: JSON.stringify({ lead_id: leadId, session_id: sessionId, channel: "website_chat", transcript }),
            signal: AbortSignal.timeout(10000)
          });
          if (!saved.ok) console.warn("Conversation context was not saved:", saved.status);
        } catch (error) { console.warn("Conversation context save failed:", error?.name || "Error"); }
      }
    }
    return json(res, 201, { ok: true, message: "Thank you. Your enquiry has been shared with ATSFy." });
  } catch (error) {
    console.error("Lead intake error:", error?.name || "Error");
    return json(res, 500, { error: "Something went wrong. Please try again." });
  }
};
