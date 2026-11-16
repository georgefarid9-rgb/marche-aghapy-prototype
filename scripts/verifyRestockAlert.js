
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Create an isolated database for testing.
const testDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-restock-")
);

process.env.SQLITE_PATH = path.join(
  testDirectory,
  "restock-test.sqlite"
);

const sequelize = require("../src/database");

const {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

const { today } = require("../src/utils/dates");

function dateAfter(days) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function runTests() {
  try {
    await sequelize.sync();

    // Create test supplier and product.
    await Supplier.create({
      supplierId: "TEST-SUP-001",
      supplierName: "Sample Supplier",
      leadTimeDays: 7,
    });

    await Product.create({
      productId: "TEST-PROD-001",
      productName: "Foul Medames",
      category: "Canned Foods",
      supplierId: "TEST-SUP-001",
    });

    const inventory = await InventoryRecord.create({
      inventoryId: "TEST-INV-001",
      productId: "TEST-PROD-001",
      quantityOnHand: 5,
      reorderLevel: 10,
      expiryDate: dateAfter(30),
    });

    // Test 1: Generate a low-stock alert.
    const alert = RestockAlert.build({
      alertId: "TEST-ALERT-001",
      inventoryId: inventory.inventoryId,
    });

    const result = await alert.generateRestockAlert();

    assert.equal(result, undefined);
    assert.equal(alert.alertStatus, "PENDING");
    assert.equal(alert.recommendedQuantity, 6);

    console.log("PASS: Low-stock alert generated");

    // Test 2: Check the reorder information.
    assert.ok(alert.reorderInformation.includes("Foul Medames"));
    assert.ok(alert.reorderInformation.includes("Sample Supplier"));
    assert.ok(alert.reorderInformation.includes("7 days"));

    console.log("PASS: Reorder information contains product and supplier");

    // Test 3: Check database persistence.
    const savedAlert = await RestockAlert.findByPk("TEST-ALERT-001");

    assert.ok(savedAlert);
    assert.equal(savedAlert.recommendedQuantity, 6);
    assert.equal(savedAlert.alertStatus, "PENDING");

    console.log("PASS: Restock alert saved in SQLite");

    // Test 4: Verify the inventory relationship.
    const relatedAlert = await RestockAlert.findByPk(
      "TEST-ALERT-001",
      {
        include: [{
          model: InventoryRecord,
          as: "inventoryRecord",
        }],
      }
    );

    assert.equal(
      relatedAlert.inventoryRecord.inventoryId,
      "TEST-INV-001"
    );

    console.log("PASS: Inventory relationship works");

    // Test 5: Healthy inventory should not generate an alert.
    await inventory.updateQuantity(20);

    const healthyAlert = RestockAlert.build({
      alertId: "TEST-ALERT-002",
      inventoryId: inventory.inventoryId,
    });

    await assert.rejects(
      () => healthyAlert.generateRestockAlert(),
      /does not currently need restocking/
    );

    console.log("PASS: Healthy inventory does not trigger an alert");

    // Test 6: Generate an alert for expiry risk.
    inventory.expiryDate = dateAfter(3);
    await inventory.updateExpiryInformation();

    const expiryAlert = RestockAlert.build({
      alertId: "TEST-ALERT-003",
      inventoryId: inventory.inventoryId,
    });

    await expiryAlert.generateRestockAlert();

    assert.equal(expiryAlert.alertStatus, "PENDING");
    assert.equal(expiryAlert.recommendedQuantity, 11);

    console.log("PASS: Expiry-risk alert generated");

    // Test 7: Reject an alert with invalid quantity.
    await assert.rejects(() =>
      RestockAlert.create({
        alertId: "TEST-ALERT-BAD",
        inventoryId: inventory.inventoryId,
        reorderInformation: "Invalid test alert",
        recommendedQuantity: -5,
        alertStatus: "PENDING",
      })
    );

    console.log("PASS: Negative recommended quantity rejected");

    // Test 8: Reject a missing inventory record.
    const missingInventoryAlert = RestockAlert.build({
      alertId: "TEST-ALERT-MISSING",
      inventoryId: "DOES-NOT-EXIST",
    });

    await assert.rejects(
      () => missingInventoryAlert.generateRestockAlert(),
      /not found/
    );

    console.log("PASS: Missing inventory record rejected");

    // Make sure failed operations did not save extra alerts.
    assert.equal(await RestockAlert.count(), 2);

    console.log("\nAll RestockAlert tests passed.");
  } catch (error) {
    console.error("\nRestockAlert test failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();

    fs.rmSync(testDirectory, {
      recursive: true,
      force: true,
    });
  }
}

runTests();
