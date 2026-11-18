const fs = require("fs");
const path = require("path");
const sequelize = require("../src/database");

const { SupportRequest } = require("../src/models");

// Feature 6 upgrade for a database created BEFORE refunds updated the sales data.
// It keeps all existing data and is safe to run more than once.
//
//   1. Backs up the database (VACUUM INTO database/marche-aghapy-before-f6-refunds-<time>.sqlite)
//   2. sale_items.returnedQuantity      (units already returned, default 0)
//   3. return_requests.quantity and return_requests.saleItemId  (which line, how many)
//   4. support_requests.customerId becomes optional ("Missing record" flags have no customer)
//
// Run npm run support:migrate first if the Feature 6 tables do not exist yet.
// Do NOT use this on a brand-new database: use npm run db:setup instead.

async function columnsOf(table) {
  const [rows] = await sequelize.query(`PRAGMA table_info(${table})`);
  return rows;
}

async function migrateFeature6Refunds() {
  try {
    const databasePath = sequelize.options.storage;
    if (!fs.existsSync(databasePath)) {
      throw new Error(`No database found at ${databasePath}. Use npm run db:setup for a new database.`);
    }

    await sequelize.authenticate();
    const tables = await sequelize.getQueryInterface().showAllTables();
    for (const required of ["sale_items", "return_requests", "support_requests"]) {
      if (!tables.includes(required)) {
        throw new Error(`The ${required} table does not exist. Run npm run support:migrate first.`);
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      path.dirname(databasePath),
      `marche-aghapy-before-f6-refunds-${stamp}.sqlite`
    );
    await sequelize.query("VACUUM INTO ?", { replacements: [backupPath] });
    console.log(`Backup created: ${backupPath}`);

    const has = async (table, column) => (await columnsOf(table)).some((c) => c.name === column);

    if (!(await has("sale_items", "returnedQuantity"))) {
      await sequelize.query("ALTER TABLE sale_items ADD COLUMN returnedQuantity INTEGER NOT NULL DEFAULT 0");
      console.log("Added sale_items.returnedQuantity.");
    }
    if (!(await has("return_requests", "quantity"))) {
      await sequelize.query("ALTER TABLE return_requests ADD COLUMN quantity INTEGER");
      console.log("Added return_requests.quantity.");
    }
    if (!(await has("return_requests", "saleItemId"))) {
      await sequelize.query("ALTER TABLE return_requests ADD COLUMN saleItemId INTEGER REFERENCES sale_items(saleItemId)");
      console.log("Added return_requests.saleItemId.");
    }

    // SQLite cannot drop NOT NULL, so rebuild support_requests with an optional customerId.
    const customerColumn = (await columnsOf("support_requests")).find((c) => c.name === "customerId");
    if (customerColumn && customerColumn.notnull === 1) {
      await sequelize.query("PRAGMA foreign_keys = OFF");
      await sequelize.query("ALTER TABLE support_requests RENAME TO support_requests_old");
      await SupportRequest.sync();
      await sequelize.query("INSERT INTO support_requests SELECT * FROM support_requests_old");
      await sequelize.query("DROP TABLE support_requests_old");
      await sequelize.query("PRAGMA foreign_keys = ON");
      console.log("support_requests.customerId is now optional.");
    }

    console.log("Feature 6 refunds migration successful.");
  } catch (error) {
    console.error("Feature 6 refunds migration failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature6Refunds();
