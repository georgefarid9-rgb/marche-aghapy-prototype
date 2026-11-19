
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use a temporary database to protect existing records.
const testDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-transactions-")
);

process.env.SQLITE_PATH = path.join(testDir, "test.sqlite");

const sequelize = require("../src/database");
const { Product, InventoryRecord } = require("../src/models");

async function run() {
  try {
    await sequelize.sync();

    // Test 1: Both records should roll back on failure.
    await assert.rejects(
      sequelize.transaction(async (transaction) => {
        const product = Product.build({
          productId: "TX-P1",
          productName: "Foul Medames",
        });

        await product.recordNewProduct(
          JSON.stringify({
            productId: "TX-P1",
            productName: "Foul Medames",
          }),
          { transaction }
        );

        const inventory = InventoryRecord.build();

        await inventory.createInventoryRecord(
          JSON.stringify({
            inventoryId: "TX-I1",
            productId: "TX-P1",
            quantityOnHand: 20,
            reorderLevel: 10,
          }),
          { transaction }
        );

        throw new Error("Simulated transaction failure");
      }),
      /Simulated transaction failure/
    );

    assert.equal(await Product.findByPk("TX-P1"), null);
    assert.equal(await InventoryRecord.findByPk("TX-I1"), null);

    console.log("PASS: New records rolled back together");

    // Test 2: Successful transaction should commit.
    await sequelize.transaction(async (transaction) => {
      const product = Product.build({
        productId: "TX-P2",
        productName: "Egyptian Lentils",
      });

      await product.recordNewProduct(
        JSON.stringify({
          productId: "TX-P2",
          productName: "Egyptian Lentils",
        }),
        { transaction }
      );

      const inventory = InventoryRecord.build();

      await inventory.createInventoryRecord(
        JSON.stringify({
          inventoryId: "TX-I2",
          productId: "TX-P2",
          quantityOnHand: 15,
          reorderLevel: 5,
        }),
        { transaction }
      );
    });

    assert.ok(await Product.findByPk("TX-P2"));
    assert.ok(await InventoryRecord.findByPk("TX-I2"));

    console.log("PASS: Successful transaction committed");

    // Test 3: Existing records should roll back together.
    await assert.rejects(
      sequelize.transaction(async (transaction) => {
        const product = await Product.findByPk("TX-P2", {
          transaction,
        });

        const inventory = await InventoryRecord.findByPk("TX-I2", {
          transaction,
        });

        await product.updateProductInformation(
          JSON.stringify({ productName: "Changed Lentils" }),
          { transaction }
        );

        await inventory.updateInventoryInformation(
          JSON.stringify({ quantityOnHand: 2 }),
          { transaction }
        );

        throw new Error("Simulated update failure");
      }),
      /Simulated update failure/
    );

    const product = await Product.findByPk("TX-P2");
    const inventory = await InventoryRecord.findByPk("TX-I2");

    assert.equal(product.productName, "Egyptian Lentils");
    assert.equal(inventory.quantityOnHand, 15);

    console.log("PASS: Existing records rolled back together");

    console.log("\nAll model transaction tests passed.");
  } catch (error) {
    console.error("Transaction verification failed:", error);
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
