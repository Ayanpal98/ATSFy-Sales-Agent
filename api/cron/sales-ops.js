const ACTIVE = new Set(["new", "contacted", "qualified", "proposal", "negotiation"]);
const DAY = 24 * 60 * 60 * 1000;

function json(res, status, body) {
  return res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

async function rest(url, key, path, options = {}) {
  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const error = new Error("Sales operations database request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return json(res, 503, { error: "Scheduled operations are not configured." });
  const auth = String(req.headers.authorization || "");
  if (auth !== "Bearer " + secret) return json(res, 401, { error: "Unauthorized." });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 503, { error: "Sales operations storage is not configured." });

  const startedAt = new Date();
  let queued = 0;
  let skipped = 0;
  try {
    const dueAt = startedAt.toISOString();
    const leads = await rest(url, key,
      "leads?select=id,name,status,next_follow_up_at&status=in.(new,contacted,qualified,proposal,negotiation)&next_follow_up_at=not.is.null&next_follow_up_at=lte." +
      encodeURIComponent(dueAt) + "&order=next_follow_up_at.asc&limit=100"
    );
    const ids = (Array.isArray(leads) ? leads : []).filter(lead => ACTIVE.has(lead.status)).map(lead => lead.id);
    let pendingByLead = new Set();
    if (ids.length) {
      const tasks = await rest(url, key,
        "followup_tasks?select=lead_id&status=eq.pending&lead_id=in.(" + ids.map(encodeURIComponent).join(",") + ")"
      );
      pendingByLead = new Set((Array.isArray(tasks) ? tasks : []).map(task => task.lead_id));
    }

    for (const lead of leads || []) {
      if (!ACTIVE.has(lead.status) || pendingByLead.has(lead.id)) {
        skipped++;
        continue;
      }
      await rest(url, key, "followup_tasks", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          lead_id: lead.id,
          due_at: dueAt,
          channel: "internal",
          message_draft: "Scheduled follow-up is due. Review the latest conversation, confirm the requirement and prepare the next step. Do not send any message without explicit approval.",
          status: "pending"
        })
      });
      await rest(url, key, "leads?id=eq." + encodeURIComponent(lead.id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ next_follow_up_at: new Date(startedAt.getTime() + DAY).toISOString() })
      });
      queued++;
    }

    const finishedAt = new Date().toISOString();
    await rest(url, key, "agent_runs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        run_type: "sales_ops_daily",
        status: "succeeded",
        input_summary: "Checked due follow-up dates for up to 100 active leads.",
        output_summary: "Queued " + queued + " internal review tasks; skipped " + skipped + " leads already covered by a pending task.",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt
      })
    });
    return json(res, 200, { ok: true, checked: Array.isArray(leads) ? leads.length : 0, queued, skipped });
  } catch (error) {
    try {
      await rest(url, key, "agent_runs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          run_type: "sales_ops_daily",
          status: "failed",
          input_summary: "Checked due follow-up dates for active leads.",
          output_summary: "Scheduled review task processing failed.",
          error_code: String(error.status || error.name || "unknown").slice(0, 80),
          started_at: startedAt.toISOString(),
          finished_at: new Date().toISOString()
        })
      });
    } catch {}
    console.error("Scheduled sales operations failed:", error?.name || "Error");
    return json(res, 500, { error: "Scheduled sales operations could not be completed." });
  }
};
