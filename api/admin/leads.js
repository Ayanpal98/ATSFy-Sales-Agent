const STATUSES = new Set(["new","contacted","qualified","proposal","negotiation","won","lost","not_interested"]);
function json(res, status, body) {
  return res.status(status).setHeader("Cache-Control", "no-store").json(body);
}
async function authenticate(req) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!url || !key || !token) return null;
  const response = await fetch(url.replace(/\/$/, "") + "/auth/v1/user", {
    headers: { "apikey": key, "Authorization": "Bearer " + token }, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.app_metadata?.role === "admin" ? { url, key, token } : null;
}
module.exports = async function handler(req, res) {
  if (!["GET","PATCH"].includes(req.method)) { res.setHeader("Allow", "GET, PATCH"); return json(res, 405, { error: "Method not allowed." }); }
  try {
    const session = await authenticate(req);
    if (!session) return json(res, 401, { error: "Admin authentication required." });
    const base = session.url.replace(/\/$/, "") + "/rest/v1/leads";
    const headers = { "apikey": session.key, "Authorization": "Bearer " + session.token, "Content-Type": "application/json" };
    if (req.method === "GET") {
      const response = await fetch(base + "?select=id,created_at,name,email,phone,company,industry,city,need,budget_range,timeline,source,status,lead_score,next_follow_up_at&order=created_at.desc&limit=200", { headers, signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => []);
      if (!response.ok) return json(res, 502, { error: "Unable to load leads." });
      return json(res, 200, { leads: data });
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const id = typeof body.id === "string" ? body.id : "", status = typeof body.status === "string" ? body.status : "";
    if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.has(status)) return json(res, 400, { error: "A valid lead ID and status are required." });
    const response = await fetch(base + "?id=eq." + encodeURIComponent(id), {
      method: "PATCH", headers: { ...headers, "Prefer": "return=minimal" }, body: JSON.stringify({ status }), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return json(res, 502, { error: "Unable to update lead status." });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("Admin leads error:", error?.name || "Error");
    return json(res, 500, { error: "The CRM is temporarily unavailable." });
  }
};
