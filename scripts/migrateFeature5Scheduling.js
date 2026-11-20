// Feature 5 (Prototype 2): bring an existing database up to date.
// Adds the EmployeeShift.role column if it is missing. Safe to run more than once.
// New databases created with npm run db:setup already have the column.
const sequelize = require("../src/database");
const { DataTypes } = require("sequelize");

async function migrateFeature5Scheduling() {
  try {
    await sequelize.authenticate();

    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable("employee_shifts");

    if (!columns.role) {
      await queryInterface.addColumn("employee_shifts", "role", {
        type: DataTypes.STRING,
        allowNull: true,
      });
      console.log("SUCCESS: EmployeeShift role column added.");
    } else {
      console.log("EmployeeShift role column already exists.");
    }
  } catch (error) {
    console.error("Feature 5 migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature5Scheduling();
