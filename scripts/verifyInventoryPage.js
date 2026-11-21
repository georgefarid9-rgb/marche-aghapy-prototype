
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-page-")
);

process.env.SQLITE_PATH = path.join(testDir, "test.sqlite");

const sequelize = require("../src/database");
const {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

const InventoryPage = require("../src/pages/InventoryPage");
const { today } = require("../src/utils/dates");

function dateAfter(days) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function run() {
  try {
    await sequelize.sync();

    await Supplier.create({
      supplierId: "PAGE-SUP-1",
      supplierName: "Test Supplier",
      leadTimeDays: 7,
    });

    const page = new InventoryPage();

    // Verify all 17 UML methods are implemented.
    const methods = [
      "beginInventoryReview",
      "displayCurrentInventory",
      "selectMaintenanceTask",
      "displayUpdatedInformation",
      "reviewUpdatedInformation",
      "selectRecordNewProduct",
      "requestProductAndInventoryDetails",
      "provideProductQuantityExpiry",
      "selectUpdateExistingProduct",
      "displayExistingProduct",
      "provideProductAndInventoryChanges",
      "displayUpdatedInventory",
      "submitProductInformation",
      "requestCorrections",
      "provideCorrectedInformation",
      "continueSelectedSubflow",
      "inventoryReviewComplete",
    ];

    for (const method of methods) {
      assert.equal(typeof page[method], "function", method);
    }

    console.log("PASS: All 17 UML methods exist");

    // Test 1: Begin inventory review.
    await page.beginInventoryReview();

    assert.equal(page.view, "INVENTORY_LIST");
    assert.equal(page.currentInventory.length, 0);

    console.log("PASS: Inventory review started");

    // Test 2: Select new-product subflow.
    page.selectedTask = "NEW";
    await page.selectMaintenanceTask();

    assert.equal(page.view, "NEW_PRODUCT_FORM");

    console.log("PASS: New-product task selected");

    // Test 3: Provide the new product details.
    page.formData = {
      productId: "PAGE-P1",
      productName: "Foul Medames",
      category: "Canned Foods",
      supplierId: "PAGE-SUP-1",
      inventoryId: "PAGE-I1",
      quantityOnHand: 5,
      reorderLevel: 10,
      expiryDate: dateAfter(30),
    };

    page.provideProductQuantityExpiry();
    await page.submitProductInformation();

    assert.equal(page.errorMessage, null);
    assert.equal(page.view, "UPDATED_INVENTORY");
    assert.equal(await Product.count(), 1);
    assert.equal(await InventoryRecord.count(), 1);
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: New product and inventory saved");

    // Test 4: Continue and complete the review.
    page.continueSelectedSubflow();
    assert.equal(page.view, "UPDATED_DETAILS");

    page.reviewUpdatedInformation();
    assert.equal(page.view, "REVIEWING_UPDATED_INFORMATION");

    page.inventoryReviewComplete();
    assert.equal(page.reviewComplete, true);
    assert.equal(page.view, "COMPLETE");

    // Continuing must not create a duplicate alert.
    assert.equal(await RestockAlert.count(), 1);

    console.log("PASS: Inventory review completed");

    // Test 5: Select an existing product.
    await page.beginInventoryReview();

    page.selectedTask = "UPDATE";
    page.selectedProductId = "PAGE-P1";

    await page.selectMaintenanceTask();

    assert.equal(page.view, "EDIT_PRODUCT_FORM");
    assert.equal(page.existingProduct.productId, "PAGE-P1");

    console.log("PASS: Existing product displayed");

    // Test 6: Reject invalid changes.
    page.formData = { quantityOnHand: -3 };

    page.provideProductAndInventoryChanges();
    await page.submitProductInformation();

    assert.equal(page.view, "CORRECTION_REQUIRED");
    assert.ok(page.errorMessage);

    const unchanged = await InventoryRecord.findByPk("PAGE-I1");
    assert.equal(unchanged.quantityOnHand, 5);

    console.log("PASS: Invalid update rejected");

    // Test 7: Correct the information and save.
    page.formData = { quantityOnHand: 20 };

    page.provideCorrectedInformation();
    assert.equal(page.view, "READY_TO_SUBMIT");

    await page.submitProductInformation();

    assert.equal(page.errorMessage, null);

    const updated = await InventoryRecord.findByPk("PAGE-I1");
    assert.equal(updated.quantityOnHand, 20);
    assert.equal(updated.inventoryStatus, "IN_STOCK");

    console.log("PASS: Corrected update saved");

    // Test 8: The pending alert should be resolved.
    const alert = await RestockAlert.findOne({
      where: { inventoryId: "PAGE-I1" },
    });

    assert.equal(alert.alertStatus, "RESOLVED");

    console.log("PASS: Restock alert resolved");

    console.log("\nAll InventoryPage tests passed.");
  } catch (error) {
    console.error("InventoryPage test failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();

    fs.rmSync(testDir, {
      recursive: true,
      force: true,
    });
  }
}

run();
