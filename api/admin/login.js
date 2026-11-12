const { allow: rateLimitAllow } = require("../_rate-limit");
function json(res, status, body) {
  return res.status(status).setHeader("Cache-Control", "no-store").json(body);
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "Method not allowed." }); }
  try {
    if (!(await rateLimitAllow(req, "admin-login", 5, 900))) { res.setHeader("Retry-After", "900"); return json(res, 429, { error: "Too many sign-in attempts. Please wait 15 minutes and try again." }); }
  } catch { return json(res, 503, { error: "Sign-in is temporarily unavailable." }); }
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return json(res, 503, { error: "Admin authentication is not configured yet." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || password.length > 256) return json(res, 400, { error: "Email and password are required." });
    const base = url.replace(/\/$/, "");
    const upstream = await fetch(base + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { "Content-Type": "application/json", "apikey": key },
      body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(12000)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json(res, upstream.status === 400 || upstream.status === 401 ? 401 : 502, { error: "Unable to sign in. Check your credentials or contact the administrator." });
    const check = await fetch(base + "/auth/v1/user", {
      headers: { "apikey": key, "Authorization": "Bearer " + payload.access_token }, signal: AbortSignal.timeout(12000)
    });
    const user = await check.json().catch(() => ({}));
    if (!check.ok || !["admin","founder"].includes(user?.app_metadata?.role)) return json(res, 403, { error: "This account is not authorized for the ATSFy admin dashboard." });
    return json(res, 200, { access_token: payload.access_token, expires_in: payload.expires_in, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Admin login error:", error?.name || "Error");
    return json(res, 500, { error: "Sign-in is temporarily unavailable." });
  }
};
