
const sequelize = require("../src/database");

async function migrate() {
  try {
    const [columns] = await sequelize.query("PRAGMA table_info(transactions)");
    const existing = new Set(columns.map((column) => column.name));

    if (!existing.has("dueDate")) {
      await sequelize.query(
        "ALTER TABLE transactions ADD COLUMN dueDate DATE"
      );
      console.log("Added dueDate column.");
    } else {
      console.log("dueDate column already exists.");
    }

    if (!existing.has("supplierId")) {
      await sequelize.query(
        "ALTER TABLE transactions ADD COLUMN supplierId VARCHAR(255) REFERENCES suppliers(supplierId)"
      );
      console.log("Added supplierId column.");
    } else {
      console.log("supplierId column already exists.");
    }

    console.log("Expense fields migration completed.");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
