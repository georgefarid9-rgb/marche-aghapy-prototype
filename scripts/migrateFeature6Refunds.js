const fs = require("fs");
const path = require("path");
const sequelize = require("../src/database");
const installGracefulShutdown = require("../src/utils/gracefulShutdown");

// Feature 6 upgrade for a database created BEFORE refunds updated the sales data.
// It keeps all existing data and is safe to run more than once.
//
//   1. Backs up the database (VACUUM INTO database/marche-aghapy-before-f6-refunds-<time>.sqlite)
//   2. In ONE transaction (all changes are saved together, or none of them are):
//        sale_items.returnedQuantity     (units already returned, default 0)
//        return_requests.quantity and return_requests.saleItemId  (which line, how many)
//        support_requests.customerId becomes optional ("Missing record" flags have no customer)
//      support_requests is rebuilt by copying every row with explicit column names, and a
//      foreign-key check must pass before anything is saved.
//
// Run npm run support:migrate first if the Feature 6 tables do not exist yet.
// Do NOT use this on a brand-new database: use npm run db:setup instead.
//
// Test it on an older database with: npm run support:migrate-check

// The columns support_requests must have. The rebuild refuses to run on anything else,
// so no column can be lost silently.
const SUPPORT_REQUEST_COLUMNS = [
  "requestId",
  "requestDate",
  "subject",
  "description",
  "requestStatus",
  "customerId",
  "employeeId",
];

async function columnsOf(table, options = {}) {
  const [rows] = await sequelize.query(`PRAGMA table_info(${table})`, options);
  return rows;
}

// Everything below runs inside one transaction: any error undoes all of it.
async function migrateInTransaction(transaction) {
  const q = (sql, extra = {}) => sequelize.query(sql, { transaction, ...extra });
  const has = async (table, column) => (await columnsOf(table, { transaction })).some((c) => c.name === column);

  if (!(await has("sale_items", "returnedQuantity"))) {
    await q("ALTER TABLE sale_items ADD COLUMN returnedQuantity INTEGER NOT NULL DEFAULT 0");
    console.log("Added sale_items.returnedQuantity.");
  }
  if (!(await has("return_requests", "quantity"))) {
    await q("ALTER TABLE return_requests ADD COLUMN quantity INTEGER");
    console.log("Added return_requests.quantity.");
  }
  if (!(await has("return_requests", "saleItemId"))) {
    await q("ALTER TABLE return_requests ADD COLUMN saleItemId INTEGER REFERENCES sale_items(saleItemId)");
    console.log("Added return_requests.saleItemId.");
  }

  // SQLite cannot drop NOT NULL, so rebuild support_requests with an optional customerId.
  const columns = await columnsOf("support_requests", { transaction });
  const customerColumn = columns.find((c) => c.name === "customerId");
  if (customerColumn && customerColumn.notnull === 1) {
    const names = columns.map((c) => c.name).sort();
    if (JSON.stringify(names) !== JSON.stringify([...SUPPORT_REQUEST_COLUMNS].sort())) {
      throw new Error(
        `support_requests has unexpected columns (${names.join(", ")}). Nothing was changed.`
      );
    }

    const [[{ sql }]] = await q("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'support_requests'");
    const customerDefinition = /(`customerId`\s+VARCHAR\(255\))\s+NOT NULL/i;
    const tableName = /^\s*CREATE TABLE\s+(IF NOT EXISTS\s+)?[`"']?support_requests[`"']?/i;
    if (!customerDefinition.test(sql) || !tableName.test(sql)) {
      throw new Error("support_requests was created in an unexpected way. Nothing was changed.");
    }

    const [[{ before }]] = await q("SELECT COUNT(*) AS before FROM support_requests");
    const list = SUPPORT_REQUEST_COLUMNS.map((c) => `\`${c}\``).join(", ");

    await q(sql.replace(customerDefinition, "$1").replace(tableName, "CREATE TABLE `support_requests_new`"));
    await q(`INSERT INTO support_requests_new (${list}) SELECT ${list} FROM support_requests`);

    const [[{ after }]] = await q("SELECT COUNT(*) AS after FROM support_requests_new");
    if (after !== before) {
      throw new Error(`Copied ${after} of ${before} support requests. Nothing was changed.`);
    }

    await q("DROP TABLE support_requests");
    await q("ALTER TABLE support_requests_new RENAME TO support_requests");
    console.log(`support_requests.customerId is now optional (${after} rows copied).`);
  }

  // Every foreign key must still point at a real row, or the migration is undone.
  const [violations] = await q("PRAGMA foreign_key_check");
  if (violations.length > 0) {
    throw new Error(
      `${violations.length} foreign-key problem(s) found (first: table ${violations[0].table}, row ${violations[0].rowid}). Nothing was changed.`
    );
  }
}

async function migrateFeature6Refunds() {
  installGracefulShutdown(sequelize);

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

    // One transaction: a power cut or an error leaves the database exactly as it was.
    await sequelize.transaction(migrateInTransaction);

    console.log("Feature 6 refunds migration successful.");
  } catch (error) {
    console.error("Feature 6 refunds migration failed. The database was not changed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature6Refunds();
