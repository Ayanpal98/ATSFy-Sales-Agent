const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/cron/sales-ops");

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}
function request(token = "cron-test") {
  return { method: "GET", headers: { authorization: "Bearer " + token } };
}

test("rejects unauthenticated scheduled operations", async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-test";
  try {
    const res = response();
    await handler(request("wrong"), res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});

test("does not run when the cron secret is missing", async () => {
  const old = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 503);
  } finally {
    if (old !== undefined) process.env.CRON_SECRET = old;
  }
});

test("queues due leads once and skips leads with an existing pending task", async () => {
  const old = {
    secret: process.env.CRON_SECRET, url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY, fetch: global.fetch
  };
  process.env.CRON_SECRET = "cron-test";
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/leads?select=")) return { ok: true, text: async () => JSON.stringify([
      { id: "11111111-1111-4111-8111-111111111111", status: "new" },
      { id: "22222222-2222-4222-8222-222222222222", status: "qualified" }
    ]) };
    if (url.includes("/followup_tasks?select=")) return { ok: true, text: async () => JSON.stringify([
      { lead_id: "22222222-2222-4222-8222-222222222222" }
    ]) };
    return { ok: true, text: async () => "" };
  };
  try {
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, checked: 2, queued: 1, skipped: 1 });
    assert.equal(calls.filter(call => call.url.endsWith("/followup_tasks")).length, 1);
    assert.equal(calls.filter(call => call.url.includes("/agent_runs")).length, 1);
  } finally {
    global.fetch = old.fetch;
    for (const [name, value] of [["CRON_SECRET", old.secret], ["SUPABASE_URL", old.url], ["SUPABASE_SERVICE_ROLE_KEY", old.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
