const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("admin dashboard inline JavaScript parses before browser execution", () => {
  const html = fs.readFileSync(require.resolve("../admin.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());
  assert.ok(scripts.length > 0, "admin.html should contain an inline application script");
  for (const [index, source] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(source, { filename: "admin-inline-" + index + ".js" }));
  }
});
