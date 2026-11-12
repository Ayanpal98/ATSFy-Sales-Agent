const test = require("node:test");
const assert = require("node:assert/strict");
const catalogue = require("../catalogue.json");
const { catalogueOffers, calculateMinimumSellPrice, validatePricingRule, validateQuote } = require("../lib/pricing-guard");

const offer = catalogueOffers(catalogue).find(x => x.kind === "service" && x.item_key === "website-development" && x.offer_tier === "Landing page");

test("fixed-price offers default to their catalogue price as the protected floor", () => {
  assert.equal(offer.list_price, 25000);
  assert.throws(() => validateQuote({ offer, rule: null, priceMin: 24000, priceMax: 25000 }), /protected minimum sell price/);
  assert.doesNotThrow(() => validateQuote({ offer, rule: null, priceMin: 25000, priceMax: 25000 }));
});

test("cost plus minimum margin and verified market floor determine the minimum price", () => {
  assert.equal(calculateMinimumSellPrice({
    list_price: 25000, delivery_cost: 10000, market_floor_price: 14000,
    market_evidence_url: "https://example.com/pricing", minimum_margin_percent: 30
  }), 14285.72);
});

test("pricing rule requires evidence and cannot exceed catalogue price", () => {
  assert.throws(() => validatePricingRule({
    delivery_cost: 10000, market_floor_price: 14000, market_evidence_url: "",
    minimum_margin_percent: 30, max_discount_percent: 40
  }, 25000), /HTTPS source URL/);
  assert.throws(() => validatePricingRule({
    delivery_cost: 20000, market_floor_price: 22000, market_evidence_url: "https://example.com/pricing",
    minimum_margin_percent: 30, max_discount_percent: 0
  }, 25000), /exceeds the catalogue price/);
});

test("custom quote offers cannot be assigned automatic prices", () => {
  const custom = catalogueOffers(catalogue).find(x => x.kind === "product" && x.item_key === "green-to-gold");
  assert.throws(() => validateQuote({ offer: custom, rule: null, priceMin: 1000, priceMax: 2000 }), /fixed-price catalogue tier/);
});
