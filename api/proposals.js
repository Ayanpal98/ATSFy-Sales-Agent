const crypto = require("crypto");

function json(res, status, body) {
  return res.status(status).setHeader("Cache-Control", "no-store").json(body);
}
function clean(value, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function verifyLeadToken(token, secret) {
  if (typeof token !== "string" || token.length > 1200) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!/^[0-9a-f-]{36}$/i.test(payload.lead_id || "") || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload.lead_id;
  } catch { return null; }
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "Method not allowed." }); }
  const origin = req.headers.origin;
  let allowedOrigin = false;
  try {
    const parsed = new URL(origin);
    allowedOrigin = parsed.protocol === "https:" &&
      (parsed.hostname === "atsfysalesagent.vercel.app" || /^atsfysalesagent-[a-z0-9-]+-ayanpal98s-projects\.vercel\.app$/.test(parsed.hostname));
  } catch {}
  if (!allowedOrigin) return json(res, 403, { error: "Request origin not allowed." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 503, { error: "Proposal storage is not configured yet. Please contact ATSFy directly." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const leadId = verifyLeadToken(body.lead_token, key);
    if (!leadId) return json(res, 401, { error: "Your enquiry link has expired. Please submit the follow-up form again." });
    const description = clean(body.description, 4000);
    if (!description) return json(res, 400, { error: "There is no estimate text to save yet." });
    const title = clean(body.title, 180) || "Website enquiry estimate";
    const base = url.replace(/\/$/, "");
    const headers = { "Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key };
    const response = await fetch(base + "/rest/v1/proposals", {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        lead_id: leadId,
        title,
        scope: {
          description,
          source: "website_chat_estimate",
          session_id: clean(body.session_id, 80) || null,
          terms: "Draft only. Pending ATSFy review and confirmation. Not an approved quote or customer commitment."
        },
        price_min: null,
        price_max: null,
        currency: "INR",
        status: "draft"
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      console.error("Proposal storage failed:", response.status);
      return json(res, 502, { error: "We could not save this draft. Please try again or contact ATSFy." });
    }
    const inserted = await response.json().catch(() => []);
    const proposal = Array.isArray(inserted) ? inserted[0] : null;
    if (!proposal?.id) return json(res, 502, { error: "The proposal was not confirmed as saved. Please try again." });
    try {
      await fetch(base + "/rest/v1/lead_activities", {
        method: "POST",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({
          lead_id: leadId,
          activity_type: "proposal",
          content: "A website chat estimate was saved as a draft proposal for ATSFy review. No quote was approved or sent."
        }),
        signal: AbortSignal.timeout(8000)
      });
    } catch (error) { console.warn("Proposal activity was not recorded:", error?.name || "Error"); }
    return json(res, 201, { ok: true, proposal_id: proposal.id, status: "draft", message: "Your estimate has been saved as a draft for ATSFy review." });
  } catch (error) {
    console.error("Proposal intake error:", error?.name || "Error");
    return json(res, 500, { error: "Something went wrong while saving the draft. Please try again." });
  }
};
