// Restock and expiry alert reconciliation, shared by both web applications:
//   - the Feature 1 browser prototype (src/server.js, npm start, port 3000)
//   - the six-feature web demo        (src/web/server.js, npm run demo, port 3001)
//
// A product can become "near expiry" or "expired" just because the date changed, with no
// inventory update. reconcileAlerts() asks InventoryController to re-check every inventory
// record once per UTC day, on the first inventory read, so alerts stay accurate.
// The alert rules themselves stay in InventoryController._tryGenerateAlert(); nothing is
// copied here.
//
// exclusiveDatabaseWork() runs database writes one after another, so reconciliation and
// inventory saves never overlap (SQLite allows one writer at a time).

const sequelize = require("../database");
const { InventoryRecord } = require("../models");
const InventoryController = require("../controllers/InventoryController");
const { today } = require("./dates");

let reconciledDay = null; // UTC day of the last completed reconciliation
let reconciliation = null; // the reconciliation in progress, shared by concurrent callers
let databaseQueue = Promise.resolve();

function exclusiveDatabaseWork(work) {
  const result = databaseQueue.then(work);
  databaseQueue = result.catch(() => {});
  return result;
}

// Re-check every inventory record once per UTC day. Concurrent callers wait for the same
// run, and the controller never creates a second PENDING alert for the same record.
async function reconcileAlerts() {
  const day = today();

  if (reconciledDay === day) return;

  if (reconciliation) {
    await reconciliation;
    return reconcileAlerts();
  }

  reconciliation = exclusiveDatabaseWork(() =>
    sequelize.transaction(async (transaction) => {
      const records = await InventoryRecord.findAll({ transaction });
      const controller = new InventoryController();
      for (const record of records) {
        await controller._tryGenerateAlert(record, { transaction });
      }
    })
  );

  try {
    await reconciliation;
    reconciledDay = day;
  } finally {
    reconciliation = null;
  }
}

// For tests: forget the last reconciliation day (a new database starts unreconciled).
function resetReconciliation() {
  reconciledDay = null;
}

module.exports = { reconcileAlerts, exclusiveDatabaseWork, resetReconciliation };
