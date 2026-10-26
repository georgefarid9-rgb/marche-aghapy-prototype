
const sequelize = require("../src/database");
const { DataTypes } = require("sequelize");

async function addInventoryReorderLevel() {
  try {
    await sequelize.authenticate();

    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable("inventory_records");

    if (!columns.reorderLevel) {
      await queryInterface.addColumn(
        "inventory_records",
        "reorderLevel",
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        }
      );

      console.log("SUCCESS: Inventory reorderLevel column added.");
    } else {
      console.log("Inventory reorderLevel column already exists.");
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

addInventoryReorderLevel();
