const fs = require("fs");
const path = require("path");
const sequelize = require("../src/database");
const installGracefulShutdown = require("../src/utils/gracefulShutdown");

// Feature 2 upgrade for the Prototype 2 class diagram. It keeps all existing data and is
// safe to run more than once.
//
//   1. Backs up the database (VACUUM INTO database/marche-aghapy-before-f2-prototype2-<time>.sqlite)
//   2. In ONE transaction (all changes are saved together, or none of them are):
//        inventory_report_records        InventoryReport.inventoryRecords / InventoryRecord.inventoryReports
//        expiry_restock_report_records   ExpiryRestockReport.inventoryRecords / InventoryRecord.expiryRestockReports
//        sale_sales_reports              SalesReport.sales / Sale.salesReports (if Feature 6 did not add it yet)
//        reportType "expiry-restock"     -> "expiryRestock" (the name used in the diagrams)
//        reportStatus "Generated"/"Closed" -> "generated"/"closed" for Feature 2 reports
//
//   npm run reports:migrate
// Do NOT use this on a brand-new database: use npm run db:setup instead.

const LINK_TABLES = [
  `CREATE TABLE IF NOT EXISTS \`inventory_report_records\` (
     \`reportId\` VARCHAR(255) NOT NULL REFERENCES \`inventory_reports\` (\`reportId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     \`inventoryId\` VARCHAR(255) NOT NULL REFERENCES \`inventory_records\` (\`inventoryId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     PRIMARY KEY (\`reportId\`, \`inventoryId\`))`,
  `CREATE TABLE IF NOT EXISTS \`expiry_restock_report_records\` (
     \`reportId\` VARCHAR(255) NOT NULL REFERENCES \`expiry_restock_reports\` (\`reportId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     \`inventoryId\` VARCHAR(255) NOT NULL REFERENCES \`inventory_records\` (\`inventoryId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     PRIMARY KEY (\`reportId\`, \`inventoryId\`))`,
  `CREATE TABLE IF NOT EXISTS \`sale_sales_reports\` (
     \`saleId\` VARCHAR(255) NOT NULL REFERENCES \`sales\` (\`saleId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     \`reportId\` VARCHAR(255) NOT NULL REFERENCES \`sales_reports\` (\`reportId\`) ON DELETE CASCADE ON UPDATE CASCADE,
     PRIMARY KEY (\`saleId\`, \`reportId\`))`,
];

const REQUIRED_TABLES = [
  "reports", "inventory_reports", "sales_reports", "expiry_restock_reports", "inventory_records", "sales",
];

async function migrateInTransaction(transaction) {
  const q = (sql) => sequelize.query(sql, { transaction });

  for (const sql of LINK_TABLES) {
    await q(sql);
  }
  console.log("Link tables are in place (inventory_report_records, expiry_restock_report_records, sale_sales_reports).");

  await q("UPDATE reports SET reportType = 'expiryRestock' WHERE reportType = 'expiry-restock'");
  await q(`UPDATE reports
             SET reportStatus = CASE reportStatus WHEN 'Generated' THEN 'generated' WHEN 'Closed' THEN 'closed' ELSE reportStatus END
           WHERE reportType IN ('inventory', 'sales', 'expiryRestock') AND reportStatus IN ('Generated', 'Closed')`);
  console.log("Report types and statuses now use the names in the class diagram.");

  // Every foreign key must still point at a real row, or the migration is undone.
  const [violations] = await q("PRAGMA foreign_key_check");
  if (violations.length > 0) {
    throw new Error(
      `${violations.length} foreign-key problem(s) found (first: table ${violations[0].table}, row ${violations[0].rowid}). Nothing was changed.`
    );
  }
}

async function migrateFeature2Prototype2() {
  installGracefulShutdown(sequelize);

  try {
    const databasePath = sequelize.options.storage;
    const defaultPath = path.resolve(__dirname, "..", "database", "marche-aghapy.sqlite");
    if (process.env.BTM495_TEST_DB === "1" && path.resolve(databasePath) === defaultPath) {
      throw new Error("Testing requires SQLITE_PATH to point to a disposable database.");
    }
    if (!fs.existsSync(databasePath)) {
      throw new Error(`No database found at ${databasePath}. Use npm run db:setup for a new database.`);
    }

    await sequelize.authenticate();
    const tables = await sequelize.getQueryInterface().showAllTables();
    for (const required of REQUIRED_TABLES) {
      if (!tables.includes(required)) {
        throw new Error(`The ${required} table does not exist. Is this the Marché Aghapy database?`);
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      path.dirname(databasePath),
      `marche-aghapy-before-f2-prototype2-${stamp}.sqlite`
    );
    await sequelize.query("VACUUM INTO ?", { replacements: [backupPath] });
    console.log(`Backup created: ${backupPath}`);

    // One transaction: a power cut or an error leaves the database exactly as it was.
    await sequelize.transaction(migrateInTransaction);

    console.log("Feature 2 Prototype 2 migration successful.");
  } catch (error) {
    console.error("Feature 2 Prototype 2 migration failed. The database was not changed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature2Prototype2();
