const catalogue = require("../../catalogue.json");
const { catalogueOffers, validatePricingRule } = require("../../lib/pricing-guard");

function json(res, status, body) { return res.status(status).setHeader("Cache-Control", "no-store").json(body); }
function bodyOf(req) { return typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
async function auth(req) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!url || !key || !token) return null;
  const response = await fetch(url.replace(/\/$/, "") + "/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  const role = user?.app_metadata?.role;
  return ["admin", "founder"].includes(role) ? { url: url.replace(/\/$/, ""), key, token, user, role } : null;
}
async function rest(session, path, options = {}) {
  const response = await fetch(session.url + "/rest/v1/" + path, {
    ...options,
    headers: { apikey: session.key, Authorization: "Bearer " + session.token, "Content-Type": "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000)
  });
  const raw = await response.text();
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) { const error = new Error("Pricing database request failed."); error.status = response.status; throw error; }
  return data;
}
module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) { res.setHeader("Allow", "GET, POST"); return json(res, 405, { error: "Method not allowed." }); }
  try {
    const session = await auth(req);
    if (!session) return json(res, 401, { error: "Administrator authentication required." });
    const offers = catalogueOffers(catalogue);
    const rows = await rest(session, "pricing_rules?select=*&order=item_kind,item_key,offer_tier");
    if (req.method === "GET") {
      const byKey = new Map((rows || []).map(row => [row.item_kind + ":" + row.item_key + ":" + row.offer_tier, row]));
      return json(res, 200, {
        founder: session.role === "founder" || (session.user.app_metadata?.permissions || []).includes("pricing_override"),
        rules: offers.map(offer => ({
          ...offer,
          rule: offer.list_price == null ? null : (byKey.get(offer.kind + ":" + offer.item_key + ":" + offer.offer_tier) || {
            list_price: offer.list_price, minimum_sell_price: offer.list_price, delivery_cost: null,
            market_floor_price: null, market_evidence_url: null, minimum_margin_percent: null, max_discount_percent: 0,
            default_rule: true
          })
        }))
      });
    }
    const b = bodyOf(req);
    const offer = offers.find(x => x.kind === b.item_kind && x.item_key === b.item_key && x.offer_tier === b.offer_tier);
    if (!offer || offer.list_price == null) return json(res, 400, { error: "Select a fixed-price catalogue offer. Custom quotes cannot receive an automatic floor." });
    const values = {
      delivery_cost: Number(b.delivery_cost),
      market_floor_price: Number(b.market_floor_price),
      market_evidence_url: typeof b.market_evidence_url === "string" ? b.market_evidence_url.trim().slice(0, 1000) : "",
      minimum_margin_percent: Number(b.minimum_margin_percent),
      max_discount_percent: Number(b.max_discount_percent)
    };
    let validated;
    try { validated = validatePricingRule(values, offer.list_price); }
    catch (error) { return json(res, 400, { error: error.message }); }
    const existing = await rest(session, "pricing_rules?item_kind=eq." + encodeURIComponent(offer.kind) + "&item_key=eq." + encodeURIComponent(offer.item_key) + "&offer_tier=eq." + encodeURIComponent(offer.offer_tier) + "&select=*");
    const previous = Array.isArray(existing) ? existing[0] : null;
    const payload = {
      item_kind: offer.kind, item_key: offer.item_key, offer_tier: offer.offer_tier, list_price: offer.list_price,
      minimum_sell_price: validated.minimum_sell_price, ...values, updated_by: session.user.id
    };
    const saved = await rest(session, "pricing_rules", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload)
    });
    const rule = Array.isArray(saved) ? saved[0] : saved;
    await rest(session, "pricing_rule_events", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        rule_id: rule?.id || null, item_kind: offer.kind, item_key: offer.item_key, offer_tier: offer.offer_tier,
        action: previous ? "updated" : "created", previous_values: previous || null, new_values: payload, actor_id: session.user.id
      })
    });
    return json(res, 200, { ok: true, rule });
  } catch (error) {
    console.error("Pricing rules API error:", error?.status || error?.name || "Error");
    return json(res, 500, { error: "Pricing controls are unavailable. Confirm that the pricing-protection migration has been applied." });
  }
};
