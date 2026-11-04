const crypto = require("crypto");

function clientAddress(req) {
  const value = req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "unknown";
  return String(value).split(",")[0].trim().slice(0, 128) || "unknown";
}

async function allow(req, endpoint, limit, windowSeconds) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Rate limiting is not configured.");
  const digest = crypto.createHmac("sha256", key)
    .update(endpoint + ":" + clientAddress(req))
    .digest("hex");
  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/rate_limit_hit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: "Bearer " + key
    },
    body: JSON.stringify({ p_key: digest, p_limit: limit, p_window_seconds: windowSeconds }),
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw new Error("Rate-limit service unavailable.");
  return response.json();
}

module.exports = { allow };
