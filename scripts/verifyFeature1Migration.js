const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Sequelize, QueryTypes } = require("sequelize");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-migration-"));
const dbPath = path.join(directory, "legacy.sqlite");
const migration = path.join(__dirname, "migrateFeature1Prototype2.js");

function connect() {
  return new Sequelize({ dialect: "sqlite", storage: dbPath, logging: false });
}

async function run() {
  let db = connect();
  try {
    // Build a miniature pre-Prototype-2 database.
    await db.query("CREATE TABLE products (productId TEXT PRIMARY KEY, productName TEXT NOT NULL)");
    await db.query(`CREATE TABLE inventory_records (
      inventoryId TEXT PRIMARY KEY,
      productId TEXT NOT NULL REFERENCES products(productId),
      quantityOnHand INTEGER NOT NULL,
      reorderLevel INTEGER NOT NULL,
      expiryDate TEXT,
      lastUpdated TEXT NOT NULL
    )`);
    await db.query(`CREATE TABLE restock_alerts (
      alertId TEXT PRIMARY KEY,
      inventoryId TEXT REFERENCES inventory_records(inventoryId),
      reorderInformation TEXT NOT NULL
    )`);
    await db.query("CREATE TABLE employee_records (employeeId TEXT PRIMARY KEY, name TEXT NOT NULL)");
    await db.query("INSERT INTO employee_records VALUES ('EMP-OLD', 'Original employee')");
    await db.query("INSERT INTO products VALUES ('P1','Low'),('P2','Empty'),('P3','Healthy')");
    await db.query(`INSERT INTO inventory_records VALUES
      ('I1','P1',5,10,'2027-04-01','2026-11-01'),
      ('I2','P2',0,10,NULL,'2026-11-01'),
      ('I3','P3',20,10,NULL,'2026-11-01')`);
    await db.query("INSERT INTO restock_alerts VALUES ('A1','I1','Original reorder message')");
    const beforeOther = await db.query("SELECT * FROM employee_records", { type: QueryTypes.SELECT });
    const beforeOtherSchema = await db.query(
      "SELECT sql FROM sqlite_master WHERE name='employee_records'", { type: QueryTypes.SELECT }
    );
    await db.close();
    db = null;

    // Run twice to check that it is safe to repeat.
    for (let i = 1; i <= 2; i++) {
      execFileSync(process.execPath, [migration], {
        env: { ...process.env, SQLITE_PATH: dbPath },
        stdio: "inherit",
      });
      console.log(`PASS: Migration run ${i}`);
    }

    db = connect();
    const products = await db.query("SELECT productId, category FROM products ORDER BY productId", { type: QueryTypes.SELECT });
    assert.deepEqual(products.map(p => p.category), ["Uncategorized", "Uncategorized", "Uncategorized"]);
    await assert.rejects(() => db.query("UPDATE products SET category = NULL WHERE productId = 'P1'"));
    await assert.rejects(() => db.query("UPDATE products SET category = '  ' WHERE productId = 'P1'"));
    console.log("PASS: Legacy categories backfilled and required");

    const inventory = await db.query(
      "SELECT inventoryId, inventoryStatus, quantityOnHand, expiryDate FROM inventory_records ORDER BY inventoryId",
      { type: QueryTypes.SELECT }
    );
    assert.deepEqual(inventory.map(r => r.inventoryStatus), [
      "LOW_STOCK", "OUT_OF_STOCK", "IN_STOCK",
    ]);
    assert.equal(inventory[0].quantityOnHand, 5);
    assert.equal(inventory[0].expiryDate, "2027-04-01");
    console.log("PASS: Legacy stock statuses backfilled without changing stock data");

    const alerts = await db.query(
      "SELECT alertId, inventoryId, reorderInformation, alertStatus, recommendedQuantity FROM restock_alerts",
      { type: QueryTypes.SELECT }
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].reorderInformation, "Original reorder message");
    assert.equal(alerts[0].alertStatus, "PENDING");
    assert.equal(alerts[0].recommendedQuantity, 0);
    console.log("PASS: Legacy restock alert preserved");

    const afterOther = await db.query("SELECT * FROM employee_records", { type: QueryTypes.SELECT });
    const afterOtherSchema = await db.query(
      "SELECT sql FROM sqlite_master WHERE name='employee_records'", { type: QueryTypes.SELECT }
    );
    assert.deepEqual(afterOther, beforeOther);
    assert.deepEqual(afterOtherSchema, beforeOtherSchema);
    console.log("PASS: Unrelated feature table and rows untouched");

    const columns = await db.query("PRAGMA table_info('inventory_records')", {type:QueryTypes.SELECT});
    assert.ok(columns.some(c => c.name === "inventoryStatus" && c.notnull === 1));
    const alertColumns = await db.query("PRAGMA table_info('restock_alerts')", {type:QueryTypes.SELECT});
    assert.ok(alertColumns.some(c => c.name === "alertStatus" && c.notnull === 1));
    assert.ok(alertColumns.some(c => c.name === "recommendedQuantity" && c.notnull === 1));
    console.log("PASS: All three new required columns exist");

    const backups = fs.readdirSync(directory).filter(name =>
      name.startsWith("legacy.sqlite.before-feature1-v2-") && name.endsWith(".sqlite")
    );
    assert.equal(backups.length, 2);
    console.log("PASS: Each migration run created a database backup");
    // Existing category columns may be nullable in older databases.
    const nullablePath = path.join(directory, "nullable.sqlite");
    const nullableDb = new Sequelize({ dialect: "sqlite", storage: nullablePath, logging: false });
    await nullableDb.query("CREATE TABLE products (productId TEXT PRIMARY KEY, productName TEXT NOT NULL, category TEXT)");
    await nullableDb.query("CREATE INDEX products_name_idx ON products(productName)");
    await nullableDb.query("INSERT INTO products VALUES ('N1','Null',NULL),('N2','Blank','  '),('N3','Kept','Produce')");
    await nullableDb.query("CREATE TABLE inventory_records (inventoryId TEXT PRIMARY KEY, quantityOnHand INTEGER, reorderLevel INTEGER)");
    await nullableDb.query("CREATE TABLE restock_alerts (alertId TEXT PRIMARY KEY)");
    await nullableDb.close();
    execFileSync(process.execPath, [migration], { env: { ...process.env, SQLITE_PATH: nullablePath }, stdio: "inherit" });
    const checkedDb = new Sequelize({ dialect: "sqlite", storage: nullablePath, logging: false });
    try {
      const rows = await checkedDb.query("SELECT category FROM products ORDER BY productId", { type: QueryTypes.SELECT });
      assert.deepEqual(rows.map(row => row.category), ["Uncategorized", "Uncategorized", "Produce"]);
      await assert.rejects(() => checkedDb.query("INSERT INTO products VALUES ('N4','Invalid',NULL)"));
      await assert.rejects(() => checkedDb.query("UPDATE products SET category = '' WHERE productId = 'N3'"));
      const indexes = await checkedDb.query("PRAGMA index_list('products')", { type: QueryTypes.SELECT });
      assert.ok(indexes.some(index => index.name === "products_name_idx"));
    } finally {
      await checkedDb.close();
    }
    console.log("PASS: Nullable legacy categories backfilled; existing values and indexes preserved");
    console.log("\nAll Feature 1 migration tests passed.");
  } catch (error) {
    console.error("Feature 1 migration test failed:", error);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run();
