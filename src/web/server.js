// Marché Aghapy — web demo for all six features (npm run demo, http://127.0.0.1:3001)
//
// A small Express server that puts screens on top of the team's existing classes.
// The browser pages (src/web/public) call the JSON routes in src/web/api, and each
// route calls the same boundary, controller and domain classes the test scripts use
// (InventoryPage, ReportHandler, SchedulePage, BusinessPartner, Ledger, Employee, ...).
// No business rule is written twice: validation and saving stay in those classes.
//
// LOCAL DEMONSTRATION ONLY. There is no login: the "Signed in as" choice in the top bar
// is a demo role switch, not security. The server therefore listens on 127.0.0.1 only
// (this computer), so nobody else on the network can open it. Do not deploy it publicly.
//
// By default it uses the DEMO database (database/demo.sqlite), never the team's main
// database, and writes exported reports to exports/demo/. The demo database is created
// automatically the first time; `npm run demo:reset` rebuilds it.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const MAIN_DATABASE = path.join(ROOT, "database", "marche-aghapy.sqlite");

if (!process.env.SQLITE_PATH) {
  const { DEMO_DATABASE, resetDemoDatabase } = require("../../scripts/demoReset");
  process.env.SQLITE_PATH = DEMO_DATABASE;
  if (!fs.existsSync(path.join(ROOT, DEMO_DATABASE))) {
    console.log("No demo database yet: creating it...");
    resetDemoDatabase();
  }
}
if (path.resolve(ROOT, process.env.SQLITE_PATH) === MAIN_DATABASE && process.env.DEMO_ALLOW_MAIN_DATABASE !== "1") {
  console.error("The web demo will not run on the team's main database (database/marche-aghapy.sqlite).");
  console.error("Run `npm run demo` without SQLITE_PATH to use database/demo.sqlite.");
  process.exit(1);
}
// Demo exports stay apart from reports exported with the main database (exports/).
if (!process.env.REPORT_EXPORT_DIR) {
  process.env.REPORT_EXPORT_DIR = path.join(ROOT, "exports", "demo");
}

const express = require("express");
const sequelize = require("../database");
require("../models");

const { errorHandler } = require("./api/respond");

function createApp() {
  const app = express();
  app.use(express.json());

  app.use("/api/dashboard", require("./api/dashboard"));
  app.use("/api/inventory", require("./api/inventory"));
  app.use("/api/profiles", require("./api/profiles"));
  app.use("/api/accounting", require("./api/accounting"));
  app.use("/api/schedule", require("./api/schedule"));
  app.use("/api/support", require("./api/support"));

  app.use("/api", (req, res) => res.status(404).json({ ok: false, message: "Unknown request." }));
  app.use(express.static(path.join(__dirname, "public")));
  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001; // 3000 is used by the Feature 1 browser prototype (npm start)
  const host = process.env.DEMO_HOST || "127.0.0.1"; // this computer only (see the note at the top)
  sequelize
    .authenticate()
    .then(() => sequelize.query("PRAGMA foreign_keys = ON"))
    .then(() => {
      createApp().listen(port, host, () => {
        console.log(`Marché Aghapy demo is running: open http://${host === "127.0.0.1" ? "localhost" : host}:${port}`);
        console.log(`Database: ${sequelize.options.storage}`);
        console.log(`Exported reports: ${process.env.REPORT_EXPORT_DIR}`);
        console.log("Local demonstration only (no login). Not for public deployment.");
        console.log("Press Ctrl+C to stop.");
      });
    })
    .catch((error) => {
      console.error("The server could not start:", error.message);
      process.exitCode = 1;
    });
}

module.exports = { createApp };
