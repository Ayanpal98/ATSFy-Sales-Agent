const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function compileInlineScripts(relativePath) {
  const html = fs.readFileSync(require.resolve(relativePath), "utf8");
  const scripts = [...html.matchAll(/<script([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
    .filter(match => !/type=["']application\\/ld\\+json["']/i.test(match[1]))
    .map(match => match[2])
    .filter(source => source.trim());
  assert.ok(scripts.length > 0, relativePath + " should contain an inline application script");
  for (const [index, source] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(source, { filename: relativePath + "-inline-" + index + ".js" }));
  }
}

test("admin dashboard inline JavaScript parses before browser execution", () => {
  compileInlineScripts("../admin.html");
});

test("public chat inline JavaScript parses before browser execution", () => {
  compileInlineScripts("../index.html");
});
