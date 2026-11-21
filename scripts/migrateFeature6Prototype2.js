const fs = require("fs");
const path = require("path");
const sequelize = require("../src/database");
const installGracefulShutdown = require("../src/utils/gracefulShutdown");

// Feature 6 upgrade for the Prototype 2 class diagram. It keeps all existing data and is
// safe to run more than once.
//
//   1. Backs up the database (VACUUM INTO database/marche-aghapy-before-f6-prototype2-<time>.sqlite)
//   2. In ONE transaction (all changes are saved together, or none of them are):
//        return_requests.ledgerId   which ledger a refund was posted to (ReturnRequest.ledger)
//        employee_customers         Employee.customers  / Customer.employees
//        sale_revenues              Sale.revenue
//        sale_sales_reports         Sale.salesReports
//      Refunds that were already posted get their ledgerId filled in from their REF-<returnId>
//      ledger entry.
//
// Run npm run support:migrate-refunds first if the earlier Feature 6 changes are missing.
// Do NOT use this on a brand-new database: use npm run db:setup instead.

const LINK_TABLES = [
  `CREATE TABLE IF NOT EXISTS \`employee_customers\` (
     \`employeeId\` VARCHAR(255) NOT NULL REFERENCES \`employees\` (\`employeeId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     \`customerId\` VARCHAR(255) NOT NULL REFERENCES \`customers\` (\`customerId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     PRIMARY KEY (\`employeeId\`, \`customerId\`))`,
  `CREATE TABLE IF NOT EXISTS \`sale_revenues\` (
     \`saleId\` VARCHAR(255) NOT NULL REFERENCES \`sales\` (\`saleId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     \`transactionId\` VARCHAR(255) NOT NULL REFERENCES \`transactions\` (\`transactionId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     PRIMARY KEY (\`saleId\`, \`transactionId\`))`,
  `CREATE TABLE IF NOT EXISTS \`sale_sales_reports\` (
     \`saleId\` VARCHAR(255) NOT NULL REFERENCES \`sales\` (\`saleId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     \`reportId\` VARCHAR(255) NOT NULL REFERENCES \`sales_reports\` (\`reportId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     PRIMARY KEY (\`saleId\`, \`reportId\`))`,
];

const REQUIRED_TABLES = [
  "return_requests", "sales", "employees", "customers", "transactions", "ledgers", "sales_reports",
];

async function migrateInTransaction(transaction) {
  const q = (sql) => sequelize.query(sql, { transaction });

  const [columns] = await q("PRAGMA table_info(return_requests)");
  if (!columns.some((c) => c.name === "ledgerId")) {
    await q("ALTER TABLE return_requests ADD COLUMN ledgerId VARCHAR(255) REFERENCES ledgers(ledgerId) ON DELETE RESTRICT ON UPDATE CASCADE");
    console.log("Added return_requests.ledgerId.");
  }

  // Refunds posted before this update: copy the ledger from the matching REF-<returnId> entry.
  await q(`UPDATE return_requests
             SET ledgerId = (SELECT t.ledgerId FROM transactions t WHERE t.transactionId = 'REF-' || return_requests.returnId)
           WHERE status = 'Refunded' AND ledgerId IS NULL`);

  for (const sql of LINK_TABLES) {
    await q(sql);
  }
  console.log("Link tables are in place (employee_customers, sale_revenues, sale_sales_reports).");

  // Every foreign key must still point at a real row, or the migration is undone.
  const [violations] = await q("PRAGMA foreign_key_check");
  if (violations.length > 0) {
    throw new Error(
      `${violations.length} foreign-key problem(s) found (first: table ${violations[0].table}, row ${violations[0].rowid}). Nothing was changed.`
    );
  }
}

async function migrateFeature6Prototype2() {
  installGracefulShutdown(sequelize);

  try {
    const databasePath = sequelize.options.storage;
    if (!fs.existsSync(databasePath)) {
      throw new Error(`No database found at ${databasePath}. Use npm run db:setup for a new database.`);
    }

    await sequelize.authenticate();
    const tables = await sequelize.getQueryInterface().showAllTables();
    for (const required of REQUIRED_TABLES) {
      if (!tables.includes(required)) {
        throw new Error(`The ${required} table does not exist. Run the earlier migrations first (npm run support:migrate, then npm run support:migrate-refunds).`);
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      path.dirname(databasePath),
      `marche-aghapy-before-f6-prototype2-${stamp}.sqlite`
    );
    await sequelize.query("VACUUM INTO ?", { replacements: [backupPath] });
    console.log(`Backup created: ${backupPath}`);

    // One transaction: a power cut or an error leaves the database exactly as it was.
    await sequelize.transaction(migrateInTransaction);

    console.log("Feature 6 Prototype 2 migration successful.");
  } catch (error) {
    console.error("Feature 6 Prototype 2 migration failed. The database was not changed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature6Prototype2();
