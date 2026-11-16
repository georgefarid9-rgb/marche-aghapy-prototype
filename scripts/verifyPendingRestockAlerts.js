
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use a temporary database to protect existing project data.
const testDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-alert-refresh-")
);

process.env.SQLITE_PATH = path.join(testDir, "test.sqlite");

const sequelize = require("../src/database");

const {
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

const InventoryController = require(
  "../src/controllers/InventoryController"
);

async function runTests() {
  try {
    await sequelize.sync();

    const controller = new InventoryController();

    // Test 1: Create a product that needs restocking.
    const created = await controller.submitNewProduct(
      JSON.stringify({
        productId: "REFRESH-P1",
        productName: "Foul Medames",
        inventoryId: "REFRESH-I1",
        quantityOnHand: 5,
        reorderLevel: 10,
        expiryDate: null,
      })
    );

    assert.equal(created, true, controller.lastError);
    assert.ok(controller.lastAlert);
    assert.equal(controller.lastAlert.recommendedQuantity, 6);

    const originalAlertId = controller.lastAlert.alertId;

    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Initial restock alert generated");

    // Test 2: Decreasing stock refreshes the same alert.
    controller.selectedProductId = "REFRESH-P1";

    const reduced = await controller.submitUpdates(
      JSON.stringify({ quantityOnHand: 3 })
    );

    assert.equal(reduced, true, controller.lastError);
    assert.equal(controller.lastAlert.alertId, originalAlertId);
    assert.equal(controller.lastAlert.recommendedQuantity, 8);
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Quantity change refreshed the pending alert");

    // Test 3: Changing the reorder level refreshes the alert.
    const changedLevel = await controller.submitUpdates(
      JSON.stringify({ reorderLevel: 12 })
    );

    assert.equal(changedLevel, true, controller.lastError);
    assert.equal(controller.lastAlert.alertId, originalAlertId);
    assert.equal(controller.lastAlert.recommendedQuantity, 10);
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Reorder level change updated the recommendation");

    // Test 4: A product name change refreshes the alert message.
    const renamed = await controller.submitUpdates(
      JSON.stringify({ productName: "Premium Foul Medames" })
    );

    assert.equal(renamed, true, controller.lastError);
    assert.equal(controller.lastAlert.alertId, originalAlertId);

    const renamedAlert = await RestockAlert.findByPk(originalAlertId);

    assert.ok(
      renamedAlert.reorderInformation.includes(
        "Premium Foul Medames"
      )
    );

    assert.equal(renamedAlert.recommendedQuantity, 10);
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Product name change refreshed the alert message");

    // Test 5: Simulate failure after updating a pending alert.
    // The product, inventory, and alert changes must all roll back.
    const hookName = "SIMULATED_PENDING_REFRESH_FAILURE";

    RestockAlert.addHook("afterUpdate", hookName, () => {
      throw new Error(hookName);
    });

    try {
      const failed = await controller.submitUpdates(
        JSON.stringify({
          productName: "This Name Must Roll Back",
          quantityOnHand: 2,
        })
      );

      assert.equal(failed, false);
      assert.match(controller.lastError, /SIMULATED_PENDING_REFRESH_FAILURE/);
      assert.equal(controller.lastResult, null);
      assert.equal(controller.lastAlert, null);
    } finally {
      RestockAlert.removeHook("afterUpdate", hookName);
    }

    // Reload everything directly from SQLite.
    const productAfterFailure = await Product.findByPk("REFRESH-P1");
    const inventoryAfterFailure = await InventoryRecord.findByPk("REFRESH-I1");
    const alertAfterFailure = await RestockAlert.findByPk(originalAlertId);

    assert.equal(productAfterFailure.productName, "Premium Foul Medames");
    assert.equal(inventoryAfterFailure.quantityOnHand, 3);
    assert.equal(inventoryAfterFailure.reorderLevel, 12);
    assert.equal(alertAfterFailure.recommendedQuantity, 10);
    assert.equal(alertAfterFailure.alertStatus, "PENDING");
    assert.equal(await RestockAlert.count(), 1);

    assert.ok(
      alertAfterFailure.reorderInformation.includes(
        "Premium Foul Medames"
      )
    );

    console.log("PASS: Failed alert refresh rolled back all changes");

    // Test 6: Replenishment resolves the pending alert.
    const replenished = await controller.submitUpdates(
      JSON.stringify({ quantityOnHand: 20 })
    );

    assert.equal(replenished, true, controller.lastError);
    assert.equal(controller.lastAlert, null);

    const resolvedAlert = await RestockAlert.findByPk(originalAlertId);

    assert.equal(resolvedAlert.alertStatus, "RESOLVED");
    assert.equal(resolvedAlert.recommendedQuantity, 10);
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Replenishment resolved the existing alert");

    // Test 7: Another shortage creates a new pending alert.
    const shortage = await controller.submitUpdates(
      JSON.stringify({ quantityOnHand: 3 })
    );

    assert.equal(shortage, true, controller.lastError);
    assert.ok(controller.lastAlert);

    const newAlertId = controller.lastAlert.alertId;

    assert.notEqual(newAlertId, originalAlertId);
    assert.equal(controller.lastAlert.alertStatus, "PENDING");
    assert.equal(controller.lastAlert.recommendedQuantity, 10);
    assert.equal(await RestockAlert.count(), 2);

    const preservedAlert = await RestockAlert.findByPk(originalAlertId);

    assert.equal(preservedAlert.alertStatus, "RESOLVED");
    assert.equal(preservedAlert.recommendedQuantity, 10);

    console.log("PASS: New shortage created a separate alert");

    // Test 8: Updating the new pending alert must not create duplicates.
    const anotherUpdate = await controller.submitUpdates(
      JSON.stringify({ quantityOnHand: 2 })
    );

    assert.equal(anotherUpdate, true, controller.lastError);
    assert.equal(controller.lastAlert.alertId, newAlertId);
    assert.equal(controller.lastAlert.recommendedQuantity, 11);
    assert.equal(await RestockAlert.count(), 2);

    const pendingCount = await RestockAlert.count({
      where: {
        inventoryId: "REFRESH-I1",
        alertStatus: "PENDING",
      },
    });

    assert.equal(pendingCount, 1);

    console.log("PASS: Only one pending alert exists");

    console.log("\nAll pending restock alert tests passed.");
  } catch (error) {
    console.error("\nPending restock alert verification failed:");
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
