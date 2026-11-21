const assert = require("node:assert/strict");
const sequelize = require("../src/database");
const InventoryPage = require("../src/pages/InventoryPage");
const {
  Product, InventoryRecord, RestockAlert,
  Supplier, Employee, Customer, Sale,
} = require("../src/models");
const { today } = require("../src/utils/dates");

if (process.env.BTM495_TEST_DB !== "1") {
  console.error("Run this integration test through verifyPrototype2Integration.js only.");
  process.exit(1);
}

function daysFromNow(days) {
  const value = new Date(`${today()}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function readUnrelatedData() {
  const supplier = await Supplier.findByPk("SUP-001");
  const employee = await Employee.findByPk("EMP-001");
  const customer = await Customer.findByPk("CUST-001");
  const sale = await Sale.findByPk("SALE-001");
  assert.ok(supplier && employee && customer && sale, "Seed data is missing.");
  return [supplier, employee, customer, sale].map(r => r.toJSON());
}

async function run() {
  try {
    await sequelize.authenticate();
    const unrelatedBefore = await readUnrelatedData();
    const page = new InventoryPage();
    const productId = "F1-E2E-PRODUCT";
    const inventoryId = "F1-E2E-INVENTORY";

    await page.beginInventoryReview();
    assert.equal(page.view, "INVENTORY_LIST");
    page.selectedTask = "NEW";
    await page.selectMaintenanceTask();

    // Invalid information must not create either record.
    page.formData = { productId, inventoryId, quantityOnHand: 12 };
    page.provideProductQuantityExpiry();
    await page.submitProductInformation();
    assert.equal(page.view, "CORRECTION_REQUIRED");
    assert.equal(await Product.findByPk(productId), null);
    assert.equal(await InventoryRecord.findByPk(inventoryId), null);
    console.log("PASS: Invalid form rejected without partial creation");

    // Correct information and save a healthy new product.
    page.formData = {
      productId,
      productName: "E2E Foul Medames",
      category: "Canned Foods",
      supplierId: "SUP-001",
      inventoryId,
      quantityOnHand: 12,
      reorderLevel: 10,
      expiryDate: daysFromNow(30),
    };
    page.provideCorrectedInformation();
    assert.equal(page.view, "READY_TO_SUBMIT");
    await page.submitProductInformation();
    assert.equal(page.view, "UPDATED_INVENTORY", page.errorMessage);
    assert.equal(await RestockAlert.count({ where: { inventoryId } }), 0);
    assert.ok(await Product.findByPk(productId));
    console.log("PASS: Corrected new-product details saved without an unnecessary alert");

    // Update inventory: low-stock should create a pending alert.
    await page.beginInventoryReview();
    page.selectedTask = "UPDATE";
    page.selectedProductId = productId;
    await page.selectMaintenanceTask();
    page.formData = { quantityOnHand: 6 };
    page.provideProductAndInventoryChanges();
    await page.submitProductInformation();
    assert.equal(page.errorMessage, null);
    let alerts = await RestockAlert.findAll({ where: { inventoryId } });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].alertStatus, "PENDING");
    assert.equal(alerts[0].recommendedQuantity, 5);
    console.log("PASS: Low-stock update generated one pending restock alert");

    // Repeating a low-stock update must not create duplicate pending alerts.
    page.formData = { quantityOnHand: 5 };
    page.provideProductAndInventoryChanges();
    await page.submitProductInformation();
    assert.equal(await RestockAlert.count({ where: { inventoryId } }), 1);
    console.log("PASS: Duplicate pending alert prevented");

    // Restore inventory; existing pending alert should be resolved.
    page.formData = { quantityOnHand: 20 };
    page.provideProductAndInventoryChanges();
    await page.submitProductInformation();
    alerts = await RestockAlert.findAll({ where: { inventoryId } });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].alertStatus, "RESOLVED");
    console.log("PASS: Replenishment resolved the pending alert");

    // Near-expiry inventory should create a new alert.
    page.formData = { expiryDate: daysFromNow(3) };
    page.provideProductAndInventoryChanges();
    await page.submitProductInformation();
    alerts = await RestockAlert.findAll({ where: { inventoryId } });
    assert.equal(alerts.length, 2);
    assert.equal(alerts.filter(a => a.alertStatus === "PENDING").length, 1);
    assert.equal(alerts.find(a => a.alertStatus === "PENDING").recommendedQuantity, 11);
    console.log("PASS: Near-expiry update created the expected second alert");

    // Persistence and cross-feature invariants.
    const stored = await InventoryRecord.findByPk(inventoryId);
    assert.equal(stored.quantityOnHand, 20);
    assert.equal(stored.inventoryStatus, "IN_STOCK");
    assert.equal(stored.expiryDate, daysFromNow(3));
    assert.deepEqual(await readUnrelatedData(), unrelatedBefore);
    console.log("PASS: Inventory changes persisted; unrelated feature records unchanged");

    page.continueSelectedSubflow();
    page.reviewUpdatedInformation();
    page.inventoryReviewComplete();
    assert.equal(page.reviewComplete, true);
    console.log("PASS: Inventory review completed");

    console.log("\nFeature 1 end-to-end checks passed.");
  } catch (error) {
    console.error("Feature 1 end-to-end test failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
