
const fs = require("fs");
const path = require("path");
const { DataTypes } = require("sequelize");
const sequelize = require("../src/database");

// Feature 4 migration.
// Adds only missing accounting columns and preserves existing data.
// Safe to run more than once.
//
// IMPORTANT:
// - Creates a database backup before making changes.
// - Does not reset or replace the database.
// - Does not create or modify Feature 6 tables.
// - New relationship columns are nullable at the SQLite level
//   to support safe ALTER TABLE operations.
//   Sequelize models enforce required values for new records.

async function migrateFeature4Accounting() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const databasePath = sequelize.options.storage;

    if (!fs.existsSync(databasePath)) {
      throw new Error(
        `No database found at ${databasePath}. Nothing to migrate.`
      );
    }

    await sequelize.authenticate();

    const tables = await queryInterface.showAllTables();

    const requiredTables = [
      "stores",
      "store_owners",
      "suppliers",
      "budget_thresholds",
      "ledgers",
      "transactions",
      "reports",
      "financial_reports",
    ];

    for (const table of requiredTables) {
      if (!tables.includes(table)) {
        throw new Error(
          `Required table "${table}" does not exist. Earlier feature migrations may be needed first.`
        );
      }
    }

    // Create a backup BEFORE changing the database.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    const backupPath = path.join(
      path.dirname(databasePath),
      `marche-aghapy-before-feature4-${stamp}.sqlite`
    );

    await sequelize.query(
      `VACUUM INTO ${sequelize.escape(backupPath)}`
    );

    console.log(`Backup created: ${backupPath}`);

    // Add a column only when it is missing.
    async function addColumnIfMissing(tableName, columnName, definition) {
      const currentColumns = await queryInterface.describeTable(tableName);

      if (currentColumns[columnName]) {
        console.log(`${tableName}.${columnName} already exists. Skipping.`);
        return;
      }

      await queryInterface.addColumn(
        tableName,
        columnName,
        definition
      );

      console.log(`Added ${tableName}.${columnName}`);
    }

    // 1. Ledgers
    // storeId links a ledger to its store.
    await addColumnIfMissing("ledgers", "storeId", {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "stores",
        key: "storeId",
      },
    });

    // 2. Transactions
    await addColumnIfMissing("transactions", "dueDate", {
      type: DataTypes.DATEONLY,
      allowNull: true,
    });

    await addColumnIfMissing("transactions", "supplierId", {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "suppliers",
        key: "supplierId",
      },
    });

    await addColumnIfMissing("transactions", "budgetThresholdId", {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "budget_thresholds",
        key: "thresholdId",
      },
    });

    await addColumnIfMissing("transactions", "source", {
      type: DataTypes.STRING,
      allowNull: true,
    });

    // 3. Financial reports
    await addColumnIfMissing("financial_reports", "ledgerId", {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "ledgers",
        key: "ledgerId",
      },
    });

    await addColumnIfMissing("financial_reports", "reviewedBy", {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "store_owners",
        key: "ownerId",
      },
    });

    // Verify that all expected columns now exist.
    const expectedColumns = {
      ledgers: ["storeId"],
      transactions: [
        "dueDate",
        "supplierId",
        "budgetThresholdId",
        "source",
      ],
      financial_reports: ["ledgerId", "reviewedBy"],
    };

    for (const [tableName, columns] of Object.entries(expectedColumns)) {
      const actualColumns = await queryInterface.describeTable(tableName);

      for (const columnName of columns) {
        if (!actualColumns[columnName]) {
          throw new Error(
            `Verification failed: ${tableName}.${columnName} is missing.`
          );
        }
      }
    }

    console.log("");
    console.log("Feature 4 migration successful.");
    console.log("All expected accounting columns are present.");
    console.log("Existing database records were preserved.");
  } catch (error) {
    console.error("");
    console.error("Feature 4 migration failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature4Accounting();
