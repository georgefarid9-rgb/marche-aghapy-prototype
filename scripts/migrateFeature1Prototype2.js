const fs = require("node:fs");
const { QueryTypes } = require("sequelize");
const sequelize = require("../src/database");

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteSqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function assertIntegrity() {
  const rows = await sequelize.query("PRAGMA integrity_check", {
    type: QueryTypes.SELECT,
  });
  if (rows.length !== 1 || Object.values(rows[0])[0] !== "ok") {
    throw new Error("SQLite integrity_check failed.");
  }
}

async function getCounts() {
  const tables = await sequelize.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    { type: QueryTypes.SELECT }
  );
  const counts = {};
  for (const { name } of tables) {
    const rows = await sequelize.query(
      `SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`,
      { type: QueryTypes.SELECT }
    );
    counts[name] = Number(rows[0].count);
  }
  return counts;
}

async function run() {
  try {
    // Never silently select the project's default shared database.
    if (!process.env.SQLITE_PATH) {
      throw new Error("Set SQLITE_PATH explicitly before running this migration.");
    }

    const dbPath = sequelize.options.storage;
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database does not exist: ${dbPath}`);
    }

    await sequelize.authenticate();
    await assertIntegrity();

    const names = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table'",
      { type: QueryTypes.SELECT }
    );
    const available = new Set(names.map(({ name }) => name));
    for (const required of ["products", "inventory_records", "restock_alerts"]) {
      if (!available.has(required)) {
        throw new Error(`Required table missing: ${required}`);
      }
    }

    const foreignKeyIssues = await sequelize.query("PRAGMA foreign_key_check", {
      type: QueryTypes.SELECT,
    });
    if (foreignKeyIssues.length > 0) {
      throw new Error("Existing foreign key violations detected. Migration cancelled.");
    }

    const countsBefore = await getCounts();
    const backupPath = `${dbPath}.before-feature1-v2-${new Date()
      .toISOString().replace(/[:.]/g, "-")}.sqlite`;

    // SQLite creates a consistent backup, including committed WAL content.
    await sequelize.query(`VACUUM INTO ${quoteSqlString(backupPath)}`);
    if (!fs.existsSync(backupPath)) {
      throw new Error("Backup could not be verified. Migration cancelled.");
    }
    console.log(`Backup created: ${backupPath}`);

    await sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };
      const qi = sequelize.getQueryInterface();

      // Preserve legacy products and enforce the category requirement without
      // rebuilding a referenced SQLite table or disturbing its indexes and keys.
      const productColumns = await qi.describeTable("products", queryOptions);
      if (!productColumns.category) {
        await sequelize.query(
          "ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'Uncategorized'",
          queryOptions
        );
      } else {
        await sequelize.query(
          "UPDATE products SET category = 'Uncategorized' WHERE category IS NULL OR trim(category) = ''",
          queryOptions
        );
      }
      for (const operation of ["INSERT", "UPDATE OF category"]) {
        const triggerName = operation === "INSERT" ? "products_category_required_insert" : "products_category_required_update";
        await sequelize.query(`CREATE TRIGGER IF NOT EXISTS ${triggerName}
          BEFORE ${operation} ON products
          WHEN NEW.category IS NULL OR trim(NEW.category) = ''
          BEGIN SELECT RAISE(ABORT, 'Product category is required'); END`, queryOptions);
      }

      const inventoryColumns = await qi.describeTable("inventory_records", queryOptions);
      if (!inventoryColumns.inventoryStatus) {
        await sequelize.query(
          "ALTER TABLE inventory_records ADD COLUMN inventoryStatus TEXT NOT NULL DEFAULT 'OUT_OF_STOCK'",
          queryOptions
        );
        console.log("Added inventory_records.inventoryStatus");
      }

      const alertColumns = await qi.describeTable("restock_alerts", queryOptions);
      if (!alertColumns.alertStatus) {
        await sequelize.query(
          "ALTER TABLE restock_alerts ADD COLUMN alertStatus TEXT NOT NULL DEFAULT 'PENDING'",
          queryOptions
        );
        console.log("Added restock_alerts.alertStatus");
      }
      if (!alertColumns.recommendedQuantity) {
        await sequelize.query(
          "ALTER TABLE restock_alerts ADD COLUMN recommendedQuantity INTEGER NOT NULL DEFAULT 0",
          queryOptions
        );
        console.log("Added restock_alerts.recommendedQuantity");
      }

      // Correct the stock status of legacy inventory rows.
      await sequelize.query(`
        UPDATE inventory_records
        SET inventoryStatus = CASE
          WHEN quantityOnHand = 0 THEN 'OUT_OF_STOCK'
          WHEN quantityOnHand <= reorderLevel THEN 'LOW_STOCK'
          ELSE 'IN_STOCK'
        END
        WHERE inventoryStatus IS NULL OR inventoryStatus <> CASE
          WHEN quantityOnHand = 0 THEN 'OUT_OF_STOCK'
          WHEN quantityOnHand <= reorderLevel THEN 'LOW_STOCK'
          ELSE 'IN_STOCK'
        END
      `, queryOptions);
    });

    await assertIntegrity();
    const countsAfter = await getCounts();
    if (JSON.stringify(countsBefore) !== JSON.stringify(countsAfter)) {
      throw new Error("Record count changed unexpectedly. Restore from the backup.");
    }

    const foreignKeyIssuesAfter = await sequelize.query("PRAGMA foreign_key_check", {
      type: QueryTypes.SELECT,
    });
    if (foreignKeyIssuesAfter.length > 0) {
      throw new Error("Foreign key violations found after migration.");
    }

    console.log("PASS: Migration completed; all table row counts and foreign keys preserved.");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
