const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/admin/workspace");

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test("proposal assistant saves a review-only outline without inventing price", async () => {
  const old = {
    url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY,
    fetch: global.fetch
  };
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  const writes = [];
  global.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/v1/user")) {
      return { ok: true, json: async () => ({ id: "admin-user", app_metadata: { role: "admin" } }) };
    }
    if (url.includes("/leads?id=eq.")) {
      return { ok: true, text: async () => JSON.stringify([{
        id: "11111111-1111-4111-8111-111111111111", name: "Test Client",
        company: "Example Co", need: "Business website", status: "new",
        lead_score: 60, industry: null, city: null, budget_range: null, timeline: null
      }]) };
    }
    if (url.endsWith("/proposals") && options.method === "POST") {
      const body = JSON.parse(options.body);
      writes.push({ table: "proposals", body });
      return { ok: true, text: async () => JSON.stringify([{
        id: "33333333-3333-4333-8333-333333333333", ...body
      }]) };
    }
    if (url.includes("/lead_activities") || url.includes("/agent_runs")) {
      writes.push({ table: url.includes("/lead_activities") ? "activities" : "runs", body: JSON.parse(options.body) });
      return { ok: true, text: async () => "" };
    }
    throw new Error("Unexpected mocked request: " + url);
  };
  try {
    const res = response();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer admin-token" },
      body: { kind: "proposal_generate", lead_id: "11111111-1111-4111-8111-111111111111" }
    }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.item.status, "draft");
    assert.equal(res.body.item.price_min, null);
    assert.equal(res.body.item.price_max, null);
    assert.match(res.body.item.scope.terms, /DRAFT ONLY/);
    assert.equal(res.body.item.scope.missing_information.length, 3);
    assert.equal(writes.filter(x => x.table === "proposals").length, 1);
    assert.equal(writes.filter(x => x.table === "activities").length, 1);
    assert.equal(writes.filter(x => x.table === "runs").length, 1);
  } finally {
    global.fetch = old.fetch;
    for (const [name, value] of [["SUPABASE_URL", old.url], ["SUPABASE_ANON_KEY", old.anon]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
