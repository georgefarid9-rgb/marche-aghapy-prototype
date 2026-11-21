
const fs = require("fs");
const path = require("path");
const { DataTypes } = require("sequelize");
const sequelize = require("../src/database");

// Feature 4 - Accounting Migration
// Adds missing accounting columns and the Sale-Revenue relationship.
// Existing database records are preserved.
// Safe to run multiple times.

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
          `Required table "${table}" does not exist. Earlier migrations may be needed first.`
        );
      }
    }

    // Back up the database before making changes.
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    const backupPath = path.join(
      path.dirname(databasePath),
      `marche-aghapy-before-feature4-${stamp}.sqlite`
    );

    await sequelize.query(
      `VACUUM INTO ${sequelize.escape(backupPath)}`
    );

    console.log(`Backup created: ${backupPath}`);

    // Add a column only if it does not already exist.
    async function addColumnIfMissing(
      tableName,
      columnName,
      definition
    ) {
      const currentColumns =
        await queryInterface.describeTable(tableName);

      if (currentColumns[columnName]) {
        console.log(
          `${tableName}.${columnName} already exists. Skipping.`
        );
        return;
      }

      await queryInterface.addColumn(
        tableName,
        columnName,
        definition
      );

      console.log(`Added ${tableName}.${columnName}`);
    }

    // 1. Ledger columns
    await addColumnIfMissing("ledgers", "storeId", {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "stores",
        key: "storeId",
      },
    });

    // 2. Transaction columns
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

    await addColumnIfMissing(
      "transactions",
      "budgetThresholdId",
      {
        type: DataTypes.STRING,
        allowNull: true,
        references: {
          model: "budget_thresholds",
          key: "thresholdId",
        },
      }
    );

    await addColumnIfMissing("transactions", "source", {
      type: DataTypes.STRING,
      allowNull: true,
    });

    // 3. Financial report columns
    await addColumnIfMissing(
      "financial_reports",
      "ledgerId",
      {
        type: DataTypes.STRING,
        allowNull: true,
        references: {
          model: "ledgers",
          key: "ledgerId",
        },
      }
    );

    await addColumnIfMissing(
      "financial_reports",
      "reviewedBy",
      {
        type: DataTypes.STRING,
        allowNull: true,
        references: {
          model: "store_owners",
          key: "ownerId",
        },
      }
    );

    // 4. Sale-Revenue relationship
    // Shared between Feature 4 and Feature 6.
    // Prince's Sequelize association uses timestamps: false.

    const currentTables =
      await queryInterface.showAllTables();

    if (!currentTables.includes("sales")) {
      console.log(
        "Sales table does not exist. Skipping Sale-Revenue relationship."
      );
    } else {
      const latestTables =
        await queryInterface.showAllTables();

      if (!latestTables.includes("sale_revenues")) {
        await queryInterface.createTable(
          "sale_revenues",
          {
            saleId: {
              type: DataTypes.STRING,
              allowNull: false,
              primaryKey: true,
              references: {
                model: "sales",
                key: "saleId",
              },
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },

            transactionId: {
              type: DataTypes.STRING,
              allowNull: false,
              primaryKey: true,
              references: {
                model: "transactions",
                key: "transactionId",
              },
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
          }
        );

        console.log(
          "Created sale_revenues junction table."
        );
      } else {
        console.log(
          "sale_revenues already exists. Skipping creation."
        );
      }

      // Verify that both required columns exist.
      const junctionColumns =
        await queryInterface.describeTable(
          "sale_revenues"
        );

      const expectedJunctionColumns = [
        "saleId",
        "transactionId",
      ];

      for (const columnName of expectedJunctionColumns) {
        if (!junctionColumns[columnName]) {
          throw new Error(
            `Verification failed: sale_revenues.${columnName} is missing.`
          );
        }
      }

      console.log(
        "Sale-Revenue junction table verified."
      );
    }

    // 5. Verify all required accounting columns.
    const expectedColumns = {
      ledgers: [
        "storeId",
      ],
      transactions: [
        "dueDate",
        "supplierId",
        "budgetThresholdId",
        "source",
      ],
      financial_reports: [
        "ledgerId",
        "reviewedBy",
      ],
    };

    for (const [tableName, columns] of Object.entries(
      expectedColumns
    )) {
      const actualColumns =
        await queryInterface.describeTable(tableName);

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
    console.log("All required accounting columns are present.");
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
