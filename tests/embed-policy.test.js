const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../vercel.json");

function headersFor(source) {
  const rule = config.headers.find((entry) => entry.source === source);
  assert.ok(rule, `Missing header rule for ${source}`);
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

test("only the public root assistant can be embedded by the ATSFY Marketplace", () => {
  const root = headersFor("/");
  assert.match(root["content-security-policy"] || "", /frame-ancestors 'self' https:\/\/atsfymarketplace\.atsfy\.tech/);
  assert.match(root["content-security-policy"] || "", /https:\/\/atsfy-marketplace-git-feature-sales-72d708-ayanpal98s-projects\.vercel\.app/);
  assert.doesNotMatch(root["content-security-policy"] || "", /https:\/\/\*\.vercel\.app/);
  assert.equal(root["x-frame-options"], undefined);
});

test("all non-root routes remain protected from framing", () => {
  const other = headersFor("/:path+");
  assert.match(other["content-security-policy"] || "", /frame-ancestors 'none'/);
  assert.equal(other["x-frame-options"], "DENY");
});
