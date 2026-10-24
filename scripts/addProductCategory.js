
const sequelize = require("../src/database");
const { DataTypes } = require("sequelize");

async function addProductCategory() {
  try {
    await sequelize.authenticate();

    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable("products");

    if (!columns.category) {
      await queryInterface.addColumn("products", "category", {
        type: DataTypes.STRING,
        allowNull: true,
      });

      console.log("SUCCESS: Product category column added.");
    } else {
      console.log("Product category column already exists.");
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

addProductCategory();
