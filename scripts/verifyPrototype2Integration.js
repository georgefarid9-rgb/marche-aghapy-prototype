const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "aghapy-full-integration-")
);
const temporaryDatabase = path.join(temporaryDirectory, "prototype2.sqlite");

const scripts = [
  // Build and seed a disposable copy of the full schema.
  "setupDatabase.js",
  "seedDatabase.js",
  "migrateFeature1Prototype2.js", // Must also handle current-schema databases.
  "verifyFeature1Migration.js",   // Tests older schemas and idempotence separately.

  // Complete Feature 1 workflow, plus its individual class tests.
  "verifyFeature1EndToEnd.js",
  "verifyInventoryProduct.js",
  "verifyInventoryRecord.js",
  "verifyRestockAlert.js",
  "verifyInventoryController.js",
  "verifyInventoryPage.js",


  // Additional Feature 1 regression checks.
  // These scripts each use a separate temporary database.
  "verifyInventoryControllerRollback.js",
  "verifyPendingRestockAlerts.js",
  "verifyProductInventoryTransactions.js",

  // Regression checks already used by the whole team.
  "testDatabase.js",
  "verifyPrototype.js",
  "migrateFeature2Prototype2.js", // Must also handle current-schema databases.
  "verifyReports.js",
  "verifyProfiles.js",
  "verifyScheduling.js",
  "verifyAccounting.js",
  "verifyAccountingReports.js",
  "verifyCustomerSupport.js",
];

try {
  for (const script of scripts) {
    console.log(`\n========== ${script} ==========`);
    execFileSync(process.execPath, [path.join(__dirname, script)], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        SQLITE_PATH: temporaryDatabase,
        BTM495_TEST_DB: "1",
      },
      stdio: "inherit",
    });
  }
  console.log("\nPASS: Full Prototype 2 integration and regression sequence completed.");
} catch (error) {
  console.error("\nFAIL: A test script did not complete successfully.");
  console.error(`Exit status: ${error.status ?? "unknown"}`);
  process.exitCode = 1;
} finally {
  // Test output is saved in the terminal; the disposable database is removed.
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
