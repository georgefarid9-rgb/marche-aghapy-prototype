
const sqlite3 = require("sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "../database/marche-aghapy.sqlite");
const backupPath = path.join(
  __dirname,
  "../database/marche-aghapy-before-not-null.sqlite"
);

const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, err => err ? reject(err) : resolve())
  );

const all = (sql) =>
  new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => err ? reject(err) : resolve(rows))
  );

async function migrate() {
  let transactionStarted = false;

  try {
    const columns = await all("PRAGMA table_info(inventory_records)");
    const productId = columns.find(c => c.name === "productId");

    if (!productId) throw new Error("productId column not found.");

    if (productId.notnull === 1) {
      console.log("NOT NULL constraint already exists.");
      return;
    }

    const violations = await all("PRAGMA foreign_key_check");
    if (violations.length) throw new Error("Existing foreign-key violations.");

    const invalid = await all(`
      SELECT productId FROM inventory_records
      GROUP BY productId
      HAVING productId IS NULL OR COUNT(*) > 1
    `);
    if (invalid.length) throw new Error("Invalid inventory product IDs.");

    if (fs.existsSync(backupPath)) {
      throw new Error("Backup filename already exists; migration stopped.");
    }

    await new Promise((resolve, reject) =>
      db.run("VACUUM INTO ?", [backupPath],
        err => err ? reject(err) : resolve())
    );
    console.log("Backup created:", backupPath);

    const before = await all("SELECT COUNT(*) AS n FROM inventory_records");

    await run("PRAGMA foreign_keys = OFF");
    await run("BEGIN IMMEDIATE");
    transactionStarted = true;

    await run(`
      CREATE TABLE new_inventory_records (
        inventoryId VARCHAR(255) NOT NULL PRIMARY KEY,
        quantityOnHand INTEGER NOT NULL DEFAULT 0,
        expiryDate DATE,
        lastUpdated DATETIME NOT NULL,
        productId VARCHAR(255) NOT NULL
          REFERENCES products(productId)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await run(`
      INSERT INTO new_inventory_records
      (inventoryId, quantityOnHand, expiryDate, lastUpdated, productId)
      SELECT inventoryId, quantityOnHand, expiryDate, lastUpdated, productId
      FROM inventory_records
    `);

    await run("DROP TABLE inventory_records");
    await run("ALTER TABLE new_inventory_records RENAME TO inventory_records");

    await run(`
      CREATE UNIQUE INDEX ux_inventory_records_product_id
      ON inventory_records(productId)
    `);

    const after = await all("SELECT COUNT(*) AS n FROM inventory_records");
    if (before[0].n !== after[0].n) {
      throw new Error("Inventory record count changed.");
    }

    const fkErrors = await all("PRAGMA foreign_key_check");
    if (fkErrors.length) throw new Error("Foreign-key validation failed.");

    const integrity = await all("PRAGMA integrity_check");
    if (integrity[0].integrity_check !== "ok") {
      throw new Error("Database integrity check failed.");
    }

    await run("COMMIT");
    transactionStarted = false;

    console.log("SUCCESS: Inventory productId is now NOT NULL.");
    console.log("Inventory records preserved:", after[0].n);
    console.log("Foreign-key and integrity checks passed.");

  } catch (error) {
    if (transactionStarted) {
      try {
        await run("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
      }
    }
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    try {
      await run("PRAGMA foreign_keys = ON");
    } catch (error) {
      console.error("Could not re-enable foreign keys:", error);
      process.exitCode = 1;
    }
    db.close();
  }
}

migrate();
