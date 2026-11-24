// npm run demo:reset
//
// Builds a fresh DEMO database (database/demo.sqlite) for the web app:
//   1. deletes the old demo database, if there is one,
//   2. creates the tables       (scripts/setupDatabase.js),
//   3. adds the sample data      (scripts/seedDatabase.js),
//   4. adds extra demo data      (scripts/seedDemoData.js).
//
// It only ever touches database/demo.sqlite, never the team's main database.
// Works the same on macOS, Windows and Linux.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DEMO_DATABASE = path.join("database", "demo.sqlite");

function resetDemoDatabase() {
  const fullPath = path.join(ROOT, DEMO_DATABASE);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  for (const file of [fullPath, `${fullPath}-journal`]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  const env = { ...process.env, SQLITE_PATH: DEMO_DATABASE };
  for (const script of ["setupDatabase.js", "seedDatabase.js", "seedDemoData.js"]) {
    execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, env, stdio: "inherit" });
  }
  console.log(`Demo database ready: ${DEMO_DATABASE}`);
}

if (require.main === module) {
  try {
    resetDemoDatabase();
  } catch (error) {
    console.error("Demo reset failed.");
    process.exitCode = 1;
  }
}

module.exports = { resetDemoDatabase, DEMO_DATABASE };
