
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use a temporary SQLite database, not the shared project database.
const testDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-controller-")
);

process.env.SQLITE_PATH = path.join(testDir, "test.sqlite");

const sequelize = require("../src/database");

const {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

const InventoryController = require("../src/controllers/InventoryController");
const { today } = require("../src/utils/dates");

function afterDays(days) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function run() {
  try {
    await sequelize.sync();

    await Supplier.create({
      supplierId: "CTRL-SUP-1",
      supplierName: "Test Supplier",
      leadTimeDays: 7,
    });

    const controller = new InventoryController();

    // Test 1: Record a product and its inventory.
    const created = await controller.submitNewProduct(JSON.stringify({
      productId: "CTRL-P1",
      productName: "Foul Medames",
      category: "Canned Foods",
      supplierId: "CTRL-SUP-1",
      inventoryId: "CTRL-I1",
      quantityOnHand: 20,
      reorderLevel: 10,
      expiryDate: afterDays(30),
    }));

    assert.equal(created, true, controller.lastError);
    assert.equal((await controller.retrieveInventory()).length, 1);
    assert.equal(await RestockAlert.count(), 0);

    console.log("PASS: New product and inventory created");

    // Test 2: Retrieve the selected product.
    controller.selectedProductId = "CTRL-P1";
    const selected = await controller.retrieveSelectedProduct();

    assert.equal(selected.productName, "Foul Medames");
    assert.equal(selected.inventoryRecord.quantityOnHand, 20);

    console.log("PASS: Selected product retrieved");

    // Test 3: Reduce stock to trigger an alert.
    const updated = await controller.submitUpdates(
      JSON.stringify({ quantityOnHand: 3 })
    );

    assert.equal(updated, true, controller.lastError);
    assert.equal(controller.lastAlert.recommendedQuantity, 8);
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Stock updated and restock alert generated");

    // Test 4: Invalid quantity should not be saved.
    const invalid = await controller.submitUpdates(
      JSON.stringify({ quantityOnHand: -1 })
    );

    assert.equal(invalid, false);

    const unchanged = await InventoryRecord.findByPk("CTRL-I1");
    assert.equal(unchanged.quantityOnHand, 3);

    console.log("PASS: Invalid quantity rejected without saving");

    // Test 5: Correct the input and execute the selected subflow.
    controller.selectedTask = "UPDATE";
    controller.pendingData = JSON.stringify({ quantityOnHand: 20 });

    assert.equal(controller.revalidateCorrectedData(), true);

    const result = await controller.executeSelectedSubflow();
    assert.equal(result, undefined);

    const reloaded = await InventoryRecord.findByPk("CTRL-I1");
    assert.equal(reloaded.quantityOnHand, 20);

    const resolved = await RestockAlert.findOne({
      where: { inventoryId: "CTRL-I1" },
    });

    assert.equal(resolved.alertStatus, "RESOLVED");

    console.log("PASS: Corrected update executed and alert resolved");

    // Test 6: Generate an alert for near-expiry stock.
    const second = await controller.submitNewProduct(JSON.stringify({
      productId: "CTRL-P2",
      productName: "Egyptian Lentils",
      supplierId: "CTRL-SUP-1",
      inventoryId: "CTRL-I2",
      quantityOnHand: 20,
      reorderLevel: 10,
      expiryDate: afterDays(3),
    }));

    assert.equal(second, true, controller.lastError);
    assert.equal(controller.lastAlert.recommendedQuantity, 11);

    console.log("PASS: Expiry-risk alert generated");

    console.log("\nAll InventoryController tests passed.");
  } catch (error) {
    console.error("InventoryController test failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

run();
