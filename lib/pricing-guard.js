function roundUp(value) { return Math.ceil(value * 100) / 100; }

function catalogueOffers(catalogue) {
  const rows = [];
  for (const [kind, groups, offerKey] of [
    ["service", catalogue.services || {}, "packages"],
    ["product", catalogue.products || {}, "offers"]
  ]) {
    for (const [itemKey, item] of Object.entries(groups)) {
      for (const offer of item[offerKey] || []) {
        rows.push({
          kind, item_key: itemKey, item_name: item.name, offer_tier: offer.tier,
          list_price: offer.price == null ? null : Number(offer.price),
          billing: offer.billing || "Custom quote"
        });
      }
    }
  }
  return rows;
}

function calculateMinimumSellPrice(rule) {
  const list = Number(rule.list_price);
  const cost = Number(rule.delivery_cost);
  const market = Number(rule.market_floor_price);
  const margin = Number(rule.minimum_margin_percent);
  if (![list, cost, market, margin].every(Number.isFinite) || list <= 0 || cost <= 0 || market <= 0 || margin < 0 || margin >= 80) {
    throw new Error("A valid list price, delivery cost, verified market floor and minimum margin are required.");
  }
  if (!/^https:\/\//i.test(String(rule.market_evidence_url || ""))) {
    throw new Error("Add an HTTPS source URL supporting the comparable market floor.");
  }
  if (cost >= list) throw new Error("Delivery cost must be below the catalogue list price.");
  const costAndMarginFloor = cost / (1 - margin / 100);
  const floor = roundUp(Math.max(market, costAndMarginFloor));
  if (floor > list) throw new Error("The verified cost and margin floor exceeds the catalogue price. Re-scope or reprice the offer.");
  return floor;
}

function validatePricingRule(input, listPrice) {
  const maxDiscount = Number(input.max_discount_percent);
  if (!Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 50) throw new Error("Maximum discount must be between 0% and 50%.");
  const floor = calculateMinimumSellPrice({ ...input, list_price: listPrice });
  const discountAtFloor = (1 - floor / listPrice) * 100;
  if (maxDiscount > discountAtFloor + 0.0001) throw new Error("The discount approval limit cannot exceed the verified minimum-price boundary.");
  return { minimum_sell_price: floor, max_discount_percent: maxDiscount };
}

function validateQuote({ offer, rule, priceMin, priceMax }) {
  if (!offer || offer.list_price == null) throw new Error("A priced proposal must use a fixed-price catalogue tier. Custom-quote offers require separate founder review.");
  const min = Number(priceMin), max = Number(priceMax);
  if (![min, max].every(Number.isFinite) || min <= 0 || max < min) throw new Error("Enter a valid positive INR proposal range.");
  const floor = Number(rule?.minimum_sell_price ?? offer.list_price);
  const discount = Math.max(0, (1 - min / offer.list_price) * 100);
  const allowedDiscount = Number(rule?.max_discount_percent ?? 0);
  if (min + 0.0001 < floor) throw new Error("This proposal is below the protected minimum sell price of ₹" + floor.toLocaleString("en-IN") + ". Reduce scope or request a reviewed pricing rule.");
  if (discount > allowedDiscount + 0.0001) throw new Error("This discount exceeds the approved limit of " + allowedDiscount + "%. Keep the catalogue price or request founder review.");
  return { minimum_sell_price: floor, discount_percent: Number(discount.toFixed(2)) };
}

module.exports = { catalogueOffers, calculateMinimumSellPrice, validatePricingRule, validateQuote };
