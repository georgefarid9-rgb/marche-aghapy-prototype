
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use a temporary database, never the original project database.
const testDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-rollback-")
);

process.env.SQLITE_PATH = path.join(testDir, "rollback.sqlite");

const sequelize = require("../src/database");

const {
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

const InventoryController = require(
  "../src/controllers/InventoryController"
);

// Temporarily simulate a database operation failing after a write.
async function withFailureHook(Model, event, name, callback) {
  Model.addHook(event, name, () => {
    throw new Error(name);
  });

  try {
    await callback();
  } finally {
    Model.removeHook(event, name);
  }
}

async function runTests() {
  try {
    await sequelize.sync();

    // TEST 1: Normal creation should succeed.
    const controller = new InventoryController();

    const created = await controller.submitNewProduct(
      JSON.stringify({
        productId: "ROLL-P1",
        productName: "Original Product",
        category: "Canned Foods",
        inventoryId: "ROLL-I1",
        quantityOnHand: 20,
        reorderLevel: 10,
      })
    );

    assert.equal(created, true, controller.lastError);
    assert.ok(await Product.findByPk("ROLL-P1"));
    assert.ok(await InventoryRecord.findByPk("ROLL-I1"));

    console.log("PASS: Normal creation committed successfully");

    // TEST 2: Inventory creation fails after its database insert.
    await withFailureHook(
      InventoryRecord,
      "afterCreate",
      "SIMULATED_INVENTORY_CREATE_FAILURE",
      async () => {
        const testController = new InventoryController();

        const result = await testController.submitNewProduct(
          JSON.stringify({
            productId: "ROLL-P2",
            productName: "Failed Inventory Product",
            category: "Canned Foods",
            inventoryId: "ROLL-I2",
            quantityOnHand: 15,
            reorderLevel: 5,
          })
        );

        assert.equal(result, false);
        assert.match(
          testController.lastError,
          /SIMULATED_INVENTORY_CREATE_FAILURE/
        );
        assert.equal(testController.lastResult, null);
      }
    );

    assert.equal(await Product.findByPk("ROLL-P2"), null);
    assert.equal(await InventoryRecord.findByPk("ROLL-I2"), null);

    console.log("PASS: Inventory creation failure rolled back product and inventory");

    // TEST 3: Inventory update fails after its database update.
    await withFailureHook(
      InventoryRecord,
      "afterUpdate",
      "SIMULATED_INVENTORY_UPDATE_FAILURE",
      async () => {
        controller.selectedProductId = "ROLL-P1";

        const result = await controller.submitUpdates(
          JSON.stringify({
            productName: "Changed Product",
            quantityOnHand: 3,
          })
        );

        assert.equal(result, false);
        assert.match(
          controller.lastError,
          /SIMULATED_INVENTORY_UPDATE_FAILURE/
        );
        assert.equal(controller.lastResult, null);
      }
    );

    const originalProduct = await Product.findByPk("ROLL-P1");
    const originalInventory = await InventoryRecord.findByPk("ROLL-I1");

    assert.equal(originalProduct.productName, "Original Product");
    assert.equal(originalInventory.quantityOnHand, 20);
    assert.equal(originalInventory.inventoryStatus, "IN_STOCK");

    console.log("PASS: Failed update rolled back product and inventory changes");

    // TEST 4: Restock alert creation fails during new-product creation.
    await withFailureHook(
      RestockAlert,
      "afterCreate",
      "SIMULATED_ALERT_CREATE_FAILURE",
      async () => {
        const testController = new InventoryController();

        const result = await testController.submitNewProduct(
          JSON.stringify({
            productId: "ROLL-P3",
            productName: "Low Stock Product",
            category: "Canned Foods",
            inventoryId: "ROLL-I3",
            quantityOnHand: 2,
            reorderLevel: 10,
          })
        );

        assert.equal(result, false);
        assert.match(
          testController.lastError,
          /SIMULATED_ALERT_CREATE_FAILURE/
        );
        assert.equal(testController.lastResult, null);
        assert.equal(testController.lastAlert, null);
      }
    );

    assert.equal(await Product.findByPk("ROLL-P3"), null);
    assert.equal(await InventoryRecord.findByPk("ROLL-I3"), null);
    assert.equal(await RestockAlert.count(), 0);

    console.log("PASS: Failed alert generation rolled back new product and inventory");

    // TEST 5: Alert failure during an existing-product update.
    await withFailureHook(
      RestockAlert,
      "afterCreate",
      "SIMULATED_ALERT_UPDATE_FAILURE",
      async () => {
        controller.selectedProductId = "ROLL-P1";

        const result = await controller.submitUpdates(
          JSON.stringify({
            productName: "Updated Product",
            quantityOnHand: 3,
          })
        );

        assert.equal(result, false);
        assert.match(
          controller.lastError,
          /SIMULATED_ALERT_UPDATE_FAILURE/
        );
        assert.equal(controller.lastResult, null);
      }
    );

    const productAfterFailure = await Product.findByPk("ROLL-P1");
    const inventoryAfterFailure = await InventoryRecord.findByPk("ROLL-I1");

    assert.equal(productAfterFailure.productName, "Original Product");
    assert.equal(inventoryAfterFailure.quantityOnHand, 20);
    assert.equal(await RestockAlert.count(), 0);

    console.log("PASS: Alert failure rolled back existing product and inventory updates");

    // TEST 6: Normal update should work after simulated failures.
    controller.selectedProductId = "ROLL-P1";

    const updated = await controller.submitUpdates(
      JSON.stringify({
        quantityOnHand: 2,
      })
    );

    assert.equal(updated, true, controller.lastError);

    const savedInventory = await InventoryRecord.findByPk("ROLL-I1");

    assert.equal(savedInventory.quantityOnHand, 2);
    assert.equal(savedInventory.inventoryStatus, "LOW_STOCK");

    assert.ok(controller.lastAlert);
    assert.equal(controller.lastAlert.alertStatus, "PENDING");
    assert.equal(controller.lastAlert.recommendedQuantity, 9);
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Successful update committed inventory and alert");

    console.log("\nAll controller rollback tests passed.");
  } catch (error) {
    console.error("\nController rollback verification failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();

    fs.rmSync(testDir, {
      recursive: true,
      force: true,
    });
  }
}

runTests();
