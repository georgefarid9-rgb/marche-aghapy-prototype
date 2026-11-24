// Marché Aghapy — web demo for all six features (npm run demo, http://localhost:3001)
//
// A small Express server that puts screens on top of the team's existing classes.
// The browser pages (src/web/public) call the JSON routes in src/web/api, and each
// route calls the same boundary, controller and domain classes the test scripts use
// (InventoryPage, ReportHandler, SchedulePage, BusinessPartner, Ledger, Employee, ...).
// No business rule is written twice: validation and saving stay in those classes.
//
// By default it uses the DEMO database (database/demo.sqlite), never the team's main
// database. It is created automatically the first time; `npm run demo:reset` rebuilds it.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

if (!process.env.SQLITE_PATH) {
  const { DEMO_DATABASE, resetDemoDatabase } = require("../../scripts/demoReset");
  process.env.SQLITE_PATH = DEMO_DATABASE;
  if (!fs.existsSync(path.join(ROOT, DEMO_DATABASE))) {
    console.log("No demo database yet: creating it...");
    resetDemoDatabase();
  }
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
  sequelize
    .authenticate()
    .then(() => sequelize.query("PRAGMA foreign_keys = ON"))
    .then(() => {
      createApp().listen(port, () => {
        console.log(`Marché Aghapy is running: open http://localhost:${port}`);
        console.log(`Database: ${sequelize.options.storage}`);
        console.log("Press Ctrl+C to stop.");
      });
    })
    .catch((error) => {
      console.error("The server could not start:", error.message);
      process.exitCode = 1;
    });
}

module.exports = { createApp };
