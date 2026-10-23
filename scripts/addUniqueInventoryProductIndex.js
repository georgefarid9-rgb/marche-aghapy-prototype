
const sequelize = require("../src/database");

async function addUniqueInventoryProductIndex() {
  try {
    await sequelize.authenticate();

    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      ux_inventory_records_product_id
      ON inventory_records (productId)
    `);

    console.log("SUCCESS: Unique productId index is present.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

addUniqueInventoryProductIndex();
