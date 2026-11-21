
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Create a separate database only for this test.
const testDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-inventory-")
);

process.env.SQLITE_PATH = path.join(
  testDirectory,
  "inventory-test.sqlite"
);

const sequelize = require("../src/database");
const { Product, InventoryRecord } = require("../src/models");
const { today } = require("../src/utils/dates");

function dateAfter(days) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function runTests() {
  try {
    // The temporary database starts empty.
    await sequelize.sync();

    await Product.create({
      productId: "TEST-INV-PRODUCT",
      productName: "Foul Medames",
      category: "Canned Foods",
    });

    const record = await InventoryRecord.create({
      inventoryId: "TEST-INV-001",
      productId: "TEST-INV-PRODUCT",
      quantityOnHand: 20,
      reorderLevel: 10,
      expiryDate: dateAfter(30),
    });

    // Test 1: Evaluate inventory status.
    assert.equal(record.evaluateInventoryStatus(), "IN_STOCK");
    assert.equal(record.inventoryStatus, "IN_STOCK");
    console.log("PASS: Inventory status evaluated");

    // Test 2: Update quantity.
    await record.updateQuantity(5);
    assert.equal(record.quantityOnHand, 5);
    assert.equal(record.inventoryStatus, "LOW_STOCK");
    console.log("PASS: Quantity updated");

    // Test 3: Reject invalid quantities.
    await assert.rejects(() => record.updateQuantity(-5));
    await assert.rejects(() => record.updateQuantity(2.5));
    console.log("PASS: Invalid quantities rejected");

    // Test 4: Evaluate expiry.
    record.expiryDate = dateAfter(3);
    await record.updateExpiryInformation();

    assert.equal(record.evaluateExpiryConditions(), "NEAR_EXPIRY");
    console.log("PASS: Expiry status evaluated");

    // Test 5: Evaluate both stock and expiry.
    assert.equal(
      record.evaluateStockAndExpiry(),
      "LOW_STOCK | NEAR_EXPIRY"
    );
    console.log("PASS: Combined evaluation");

    // Test 6: Return the inventory record.
    assert.equal(record.getCurrentProductAndStockData(), record);
    console.log("PASS: Inventory record retrieved");

    // Test 7: Update several inventory fields together.
    await record.updateInventoryInformation(
      JSON.stringify({
        quantityOnHand: 0,
        reorderLevel: 10,
        expiryDate: dateAfter(20),
      })
    );

    assert.equal(record.inventoryStatus, "OUT_OF_STOCK");
    assert.equal(record.reorderLevel, 10);
    console.log("PASS: Inventory information updated");

    // Test 8: Reject invalid inventory updates.
    await assert.rejects(() =>
      record.updateInventoryInformation(
        JSON.stringify({ quantityOnHand: -1 })
      )
    );
    console.log("PASS: Invalid inventory update rejected");

    // Test 9: Create another inventory record.
    await Product.create({
      productId: "TEST-INV-PRODUCT-2",
      productName: "Egyptian Lentils",
      category: "Canned Foods",
    });

    const newRecord = InventoryRecord.build();

    await newRecord.createInventoryRecord(
      JSON.stringify({
        inventoryId: "TEST-INV-002",
        productId: "TEST-INV-PRODUCT-2",
        quantityOnHand: 15,
        reorderLevel: 5,
        expiryDate: dateAfter(40),
      })
    );

    const savedRecord = await InventoryRecord.findByPk("TEST-INV-002");

    assert.ok(savedRecord);
    assert.equal(savedRecord.quantityOnHand, 15);
    assert.equal(savedRecord.inventoryStatus, "IN_STOCK");
    console.log("PASS: New inventory record created");

    // Test 10: Confirm database persistence.
    const reloaded = await InventoryRecord.findByPk("TEST-INV-001");

    assert.equal(reloaded.quantityOnHand, 0);
    assert.equal(reloaded.inventoryStatus, "OUT_OF_STOCK");
    console.log("PASS: Changes persisted in SQLite");

    console.log("\nAll InventoryRecord tests passed.");
  } catch (error) {
    console.error("\nInventoryRecord test failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();

    // Remove only the temporary database and directory.
    fs.rmSync(testDirectory, {
      recursive: true,
      force: true,
    });
  }
}

runTests();
