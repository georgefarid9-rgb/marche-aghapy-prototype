
const assert = require("node:assert/strict");
const sequelize = require("../src/database");

const {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

async function verifyPrototype() {
  try {
    await sequelize.authenticate();

    const product = await Product.findOne({
      where: {
        productId: "PROD-001",
      },
      include: [
        {
          model: Supplier,
          as: "supplier",
        },
        {
          model: InventoryRecord,
          as: "inventoryRecord",
          include: [
            {
              model: RestockAlert,
              as: "restockAlerts",
            },
          ],
        },
      ],
    });

    // Verify the sample product exists.
    assert.ok(product, "PROD-001 was not found.");

    // Verify the relationships.
    assert.ok(product.supplier, "Supplier relationship is missing.");
    assert.ok(
      product.inventoryRecord,
      "InventoryRecord relationship is missing."
    );

    assert.ok(
      product.inventoryRecord.restockAlerts.length > 0,
      "No RestockAlert records were found."
    );

    // Verify the expected sample identifiers.
    assert.equal(product.supplier.supplierId, "SUP-001");
    assert.equal(product.inventoryRecord.inventoryId, "INV-001");

    console.dir(product.toJSON(), {
      depth: null,
    });

    console.log("\nPrototype verification successful.");
  } catch (error) {
    console.error("Prototype verification failed:");
    console.error(error.message);

    // Tell Node.js and automated tests that verification failed.
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

verifyPrototype();
