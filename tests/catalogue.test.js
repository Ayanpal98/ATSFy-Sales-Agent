const test = require("node:test");
const assert = require("node:assert/strict");
const catalogue = require("../catalogue.json");

test("public catalogue has named services and products with at least one offer", () => {
  assert.ok(catalogue.services && Object.keys(catalogue.services).length > 0);
  assert.ok(catalogue.products && Object.keys(catalogue.products).length > 0);

  for (const [group, items] of [["services", catalogue.services], ["products", catalogue.products]]) {
    for (const [key, item] of Object.entries(items)) {
      assert.ok(item.name && item.name.trim(), `${group}.${key} needs a display name`);
      const offers = item.packages || item.offers;
      assert.ok(Array.isArray(offers) && offers.length > 0, `${group}.${key} needs packages/offers`);
      const tiers = offers.map(offer => offer.tier);
      assert.equal(new Set(tiers).size, tiers.length, `${group}.${key} has duplicate tier names`);

      for (const offer of offers) {
        assert.ok(typeof offer.tier === "string" && offer.tier.trim(), `${group}.${key} has an unnamed tier`);
        assert.ok(typeof offer.billing === "string" && offer.billing.trim(), `${group}.${key}.${offer.tier} needs billing terms`);
        assert.ok(
          offer.price === null || (Number.isFinite(offer.price) && offer.price > 0),
          `${group}.${key}.${offer.tier} must have a positive INR price or an explicit custom-quote null`
        );
      }
    }
  }
});

test("catalogue clearly discloses indicative pricing and negotiation boundaries", () => {
  assert.equal(catalogue.currency, "INR");
  assert.match(catalogue.taxNote, /GST/i);
  assert.match(catalogue.disclaimer, /indicative/i);
  assert.match(catalogue.disclaimer, /written proposal/i);
  assert.match(catalogue.negotiationNote, /smaller starting package|phase delivery/i);
  assert.match(catalogue.negotiationNote, /do not reduce a fixed scope/i);
});
