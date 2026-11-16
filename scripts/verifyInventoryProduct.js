
const assert = require("node:assert/strict");
const { Product } = require("../src/models");

// Create a product in memory.
const product = Product.build({
  productId: "TEST-001",
  productName: "Foul Medames",
  description: "Egyptian canned beans",
  category: "Canned Foods",
});

// Test existing product validation.
assert.equal(product.validateProductInformation(), true);

// Test proposed product changes.
const validUpdate = JSON.stringify({
  productName: "Foul Medames Large",
});

assert.equal(
  product.validateProductInformation(validUpdate),
  true
);

// A product cannot have a blank name.
const invalidUpdate = JSON.stringify({
  productName: "",
});

assert.equal(
  product.validateProductInformation(invalidUpdate),
  false
);

// Invalid JSON must fail validation.
assert.equal(
  product.validateProductInformation("{invalid"),
  false
);

// Check that the remaining methods exist.
assert.equal(typeof product.recordNewProduct, "function");
assert.equal(typeof product.updateProductInformation, "function");

// Check the returned product.
assert.equal(product.getProductInformation(), product);

console.log("Product class tests passed.");
