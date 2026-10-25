const fs = require("fs");
const path = require("path");
const sequelize = require("../src/database");

const {
  Sale,
  SaleItem,
  ComplaintCase,
  SupportRequest,
  ReturnRequest,
} = require("../src/models");

// Feature 6 migration for a database created BEFORE Feature 6 existed.
// It keeps all existing data. Safe to run more than once.
//
//   1. Backs up the database (VACUUM INTO database/marche-aghapy-before-feature6-<time>.sqlite)
//   2. Creates the new tables if missing: sales, sale_items, complaint_cases,
//      support_requests, return_requests
//
// The database must already contain the Feature 3 tables (run npm run profiles:migrate
// first if it does not), because Feature 6 links to customers and employees.
// Do NOT use this on a brand-new database: use npm run db:setup instead.

async function migrateFeature6Support() {
  try {
    const databasePath = sequelize.options.storage;

    if (!fs.existsSync(databasePath)) {
      throw new Error(
        `No database found at ${databasePath}. Nothing to migrate; use npm run db:setup for a new database.`
      );
    }

    await sequelize.authenticate();
    const tables = await sequelize.getQueryInterface().showAllTables();

    for (const required of ["customers", "employees", "products", "store_owners"]) {
      if (!tables.includes(required)) {
        throw new Error(
          `The ${required} table does not exist. Bring the database up to date with the earlier features first.`
        );
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      path.dirname(databasePath),
      `marche-aghapy-before-feature6-${stamp}.sqlite`
    );
    await sequelize.query("VACUUM INTO ?", { replacements: [backupPath] });
    console.log(`Backup created: ${backupPath}`);

    // sync() without force/alter only creates missing tables. Order matters: parents first.
    await Sale.sync();
    await SaleItem.sync();
    await ComplaintCase.sync();
    await SupportRequest.sync();
    await ReturnRequest.sync();

    console.log("Tables ready: sales, sale_items, complaint_cases, support_requests, return_requests.");
    console.log("Feature 6 migration successful.");
  } catch (error) {
    console.error("Feature 6 migration failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature6Support();
