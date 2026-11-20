const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { Sequelize } = require("sequelize");

// Tests npm run support:migrate-refunds on a database made the OLD way (before refunds):
//   - the rows survive, the new columns exist, support_requests.customerId becomes optional,
//   - running it twice changes nothing,
//   - when the migration cannot finish, the database is left exactly as it was.
// It only uses temporary files; your real database is never touched.

const MIGRATION = path.join(__dirname, "migrateFeature6Refunds.js");

// The tables as they were before the refunds update (customerId was required).
const OLD_SCHEMA = (extraSupportColumn = "") => [
  "CREATE TABLE `customers` (`customerId` VARCHAR(255) PRIMARY KEY)",
  "CREATE TABLE `employees` (`employeeId` VARCHAR(255) PRIMARY KEY)",
  "CREATE TABLE `sales` (`saleId` VARCHAR(255) PRIMARY KEY)",
  "CREATE TABLE `sale_items` (`saleItemId` INTEGER PRIMARY KEY AUTOINCREMENT, `saleId` VARCHAR(255) NOT NULL REFERENCES `sales` (`saleId`), `productId` VARCHAR(255) NOT NULL, `quantity` INTEGER NOT NULL, `unitPrice` DOUBLE NOT NULL)",
  "CREATE TABLE `return_requests` (`returnId` VARCHAR(255) PRIMARY KEY, `reason` VARCHAR(255) NOT NULL, `amount` DOUBLE NOT NULL, `status` VARCHAR(255) NOT NULL DEFAULT 'Pending', `saleId` VARCHAR(255) REFERENCES `sales` (`saleId`), `customerId` VARCHAR(255) REFERENCES `customers` (`customerId`), `employeeId` VARCHAR(255) REFERENCES `employees` (`employeeId`))",
  "CREATE TABLE `support_requests` (`requestId` VARCHAR(255) NOT NULL PRIMARY KEY, `requestDate` DATE NOT NULL, `subject` VARCHAR(255) NOT NULL, `description` TEXT NOT NULL, `requestStatus` VARCHAR(255) NOT NULL DEFAULT 'Open', `customerId` VARCHAR(255) NOT NULL REFERENCES `customers` (`customerId`) ON DELETE RESTRICT ON UPDATE CASCADE, `employeeId` VARCHAR(255) REFERENCES `employees` (`employeeId`) ON DELETE SET NULL ON UPDATE CASCADE" +
    extraSupportColumn + ")",
];

const OLD_DATA = [
  "INSERT INTO customers VALUES ('C1'), ('C2')",
  "INSERT INTO employees VALUES ('E1')",
  "INSERT INTO sales VALUES ('S1')",
  "INSERT INTO sale_items (saleId, productId, quantity, unitPrice) VALUES ('S1', 'P1', 4, 3.5)",
  "INSERT INTO return_requests VALUES ('R1', 'Damaged', 3.5, 'Pending', 'S1', 'C1', 'E1')",
  "INSERT INTO support_requests (requestId, requestDate, subject, description, requestStatus, customerId, employeeId) VALUES " +
    "('Q1', '2026-11-01', 'Hours', 'Asked about hours', 'Open', 'C1', 'E1'), " +
    "('Q2', '2026-11-02', 'Refund', 'Asked about a refund', 'Logged', 'C2', NULL), " +
    "('Q3', '2026-11-03', 'Bag', 'Lost a bag', 'Closed', 'C1', 'E1')",
];

let failures = 0;
function check(condition, message) {
  console.log(`${condition ? "PASS" : "FAIL"}: ${message}`);
  if (!condition) {
    failures += 1;
  }
}

async function makeOldDatabase(file, extraSupportColumn) {
  const db = new Sequelize({ dialect: "sqlite", storage: file, logging: false });
  await db.query("PRAGMA foreign_keys = ON");
  for (const sql of [...OLD_SCHEMA(extraSupportColumn), ...OLD_DATA]) {
    await db.query(sql);
  }
  return db;
}

function runMigration(file) {
  try {
    const output = execFileSync(process.execPath, [MIGRATION], {
      env: { ...process.env, SQLITE_PATH: file },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    return { status: error.status, output: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

const names = async (db, table) => (await db.query(`PRAGMA table_info(${table})`))[0].map((c) => c.name);

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f6-migration-"));

  try {
    // ---- 1. A normal old database ----
    console.log("Migrating an old database");
    const file = path.join(dir, "old.sqlite");
    let db = await makeOldDatabase(file);
    await db.close();

    const first = runMigration(file);
    check(first.status === 0 && first.output.includes("migration successful"), "the migration succeeds");
    check(fs.readdirSync(dir).some((f) => f.startsWith("old") === false && f.includes("before-f6-refunds")), "a backup file was made");

    db = new Sequelize({ dialect: "sqlite", storage: file, logging: false });
    await db.query("PRAGMA foreign_keys = ON");
    check((await names(db, "sale_items")).includes("returnedQuantity"), "sale_items has returnedQuantity");
    const [[item]] = await db.query("SELECT quantity, unitPrice, returnedQuantity FROM sale_items");
    check(item.quantity === 4 && item.unitPrice === 3.5 && item.returnedQuantity === 0, "the sale line kept its data, returnedQuantity starts at 0");
    const returnColumns = await names(db, "return_requests");
    check(returnColumns.includes("quantity") && returnColumns.includes("saleItemId"), "return_requests has quantity and saleItemId");
    const [[ret]] = await db.query("SELECT amount, status FROM return_requests WHERE returnId = 'R1'");
    check(ret.amount === 3.5 && ret.status === "Pending", "the return request kept its data");

    const [rows] = await db.query("SELECT * FROM support_requests ORDER BY requestId");
    check(rows.length === 3, "all 3 support requests were copied");
    check(
      rows[1].requestId === "Q2" && rows[1].subject === "Refund" && rows[1].requestStatus === "Logged" &&
        rows[1].customerId === "C2" && rows[1].employeeId === null && rows[0].description === "Asked about hours",
      "support request values are unchanged"
    );
    const customerColumn = (await db.query("PRAGMA table_info(support_requests)"))[0].find((c) => c.name === "customerId");
    check(customerColumn.notnull === 0, "support_requests.customerId is now optional");
    await db.query("INSERT INTO support_requests (requestId, requestDate, subject, description, requestStatus, customerId) VALUES ('Q4', '2026-11-04', 'Missing record', 'x', 'Open', NULL)");
    check((await db.query("SELECT COUNT(*) AS n FROM support_requests"))[0][0].n === 4, "a support request without a customer can be saved");
    let blocked = false;
    try {
      await db.query("INSERT INTO support_requests (requestId, requestDate, subject, description, customerId) VALUES ('Q5', '2026-11-05', 'x', 'x', 'NOBODY')");
    } catch (error) {
      blocked = true;
    }
    check(blocked, "a customer that does not exist is still refused (foreign key kept)");
    await db.query("DELETE FROM support_requests WHERE requestId = 'Q4'");
    check((await db.query("PRAGMA foreign_key_check"))[0].length === 0, "no foreign-key problems");
    await db.close();

    // ---- 2. Running it again changes nothing ----
    console.log("\nRunning it a second time");
    const second = runMigration(file);
    db = new Sequelize({ dialect: "sqlite", storage: file, logging: false });
    check(second.status === 0, "it succeeds again");
    check((await db.query("SELECT COUNT(*) AS n FROM support_requests"))[0][0].n === 3, "still 3 support requests, none duplicated");
    await db.close();

    // ---- 3. It cannot finish: everything is undone ----
    console.log("\nA migration that cannot finish leaves the database unchanged");
    const badFile = path.join(dir, "bad.sqlite");
    db = await makeOldDatabase(badFile, ", `internalNote` TEXT");
    await db.close();
    const bad = runMigration(badFile);
    check(bad.status !== 0 && bad.output.includes("unexpected columns"), "it stops with a clear message");
    db = new Sequelize({ dialect: "sqlite", storage: badFile, logging: false });
    check(!(await names(db, "sale_items")).includes("returnedQuantity"), "the earlier column changes were undone too (sale_items unchanged)");
    check(!(await names(db, "return_requests")).includes("quantity"), "return_requests unchanged");
    const [[count]] = await db.query("SELECT COUNT(*) AS n FROM support_requests");
    check(count.n === 3, "support_requests still has its 3 rows");
    check(!(await db.query("SELECT name FROM sqlite_master WHERE name LIKE 'support_requests_%'"))[0].length, "no leftover temporary table");
    await db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nFeature 6 migration verification successful.");
  }
}

main().catch((error) => {
  console.error("Migration verification could not run:", error.message);
  process.exitCode = 1;
});
