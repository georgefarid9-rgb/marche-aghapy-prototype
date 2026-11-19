
const sequelize = require("../src/database");

async function migrate() {
  try {
    const [columns] = await sequelize.query(
      "PRAGMA table_info(transactions)"
    );

    const exists = columns.some(
      (column) => column.name === "budgetThresholdId"
    );

    if (!exists) {
      await sequelize.query(
        "ALTER TABLE transactions ADD COLUMN budgetThresholdId VARCHAR(255) REFERENCES budget_thresholds(thresholdId)"
      );
      console.log("Added budgetThresholdId column.");
    } else {
      console.log("budgetThresholdId column already exists.");
    }
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
