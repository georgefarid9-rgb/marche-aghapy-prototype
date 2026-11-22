// Exercise the legacy upgrade only on a disposable database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-f2-migration-"));
process.env.SQLITE_PATH = path.join(dir, "legacy.sqlite");
const sequelize = require("../src/database");
require("../src/models");
let closed = false;

async function run() {
  try {
    await sequelize.sync();
    await sequelize.query("INSERT INTO reports (reportId, reportType, reportStatus) VALUES ('old-exp', 'expiry-restock', 'Generated'), ('old-sales', 'sales', 'Closed'), ('finance', 'financial', 'Generated')");
    await sequelize.close();
    closed = true;
    const migration = path.join(__dirname, "migrateFeature2Prototype2.js");
    for (let i = 0; i < 2; i += 1) {
      execFileSync(process.execPath, [migration], { env: { ...process.env, BTM495_TEST_DB: "1" }, stdio: "inherit" });
    }
    const { Sequelize, QueryTypes } = require("sequelize");
    const check = new Sequelize({ dialect: "sqlite", storage: process.env.SQLITE_PATH, logging: false });
    try {
      const rows = await check.query("SELECT reportId, reportType, reportStatus FROM reports ORDER BY reportId", { type: QueryTypes.SELECT });
      assert.deepEqual(rows, [
        { reportId: "finance", reportType: "financial", reportStatus: "Generated" },
        { reportId: "old-exp", reportType: "expiryRestock", reportStatus: "generated" },
        { reportId: "old-sales", reportType: "sales", reportStatus: "closed" },
      ]);
      assert.deepEqual(await check.query("PRAGMA foreign_key_check", { type: QueryTypes.SELECT }), []);
      assert.equal(fs.readdirSync(dir).filter((name) => name.startsWith("marche-aghapy-before-f2-prototype2-")).length, 2);
    } finally {
      await check.close();
    }
    console.log("PASS: Legacy Feature 2 migration preserves reports and financial status, creates backups, and is repeatable.");
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (!closed) await sequelize.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
run();
