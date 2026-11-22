// Feature 2 (Prototype 2) demo: walks through Use Case 02 "View Dashboard and Reports"
// with the ReportHandler and prints what the Store Owner would see at each step.
// Runs on its own temporary database, so it never changes your real data.
// Exported files are written to the exports/ folder so you can open them.
//   npm run reports:demo
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const demoDir = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-reports-demo-"));
process.env.SQLITE_PATH = path.join(demoDir, "demo.sqlite");

const sequelize = require("../src/database");
const { Product, InventoryRecord, RestockAlert, Sale } = require("../src/models");
const ReportHandler = require("../src/controllers/ReportHandler");
const { today } = require("../src/utils/dates");

function addDays(days) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let stepNumber = 0;
function show(title, result) {
  stepNumber += 1;
  console.log(`\n--- ${stepNumber}. ${title} ---`);
  console.log(result.ok ? result.message : `[!] ${result.message}`);

  if (result.summaryId) {
    console.log(`  Sales today: $${Number(result.totalSalesToday).toFixed(2)}`);
    console.log(`  Low-stock products: ${result.lowStockCount}`);
    console.log(`  Products near expiry: ${result.nearExpiryCount}`);
    console.log(`  Pending restock alerts: ${result.pendingRestockCount}`);
    console.log(`  Data status: ${result.dataStatus}`);
  }
  if (result.reportTypes) {
    console.log(`  Report types: ${result.reportTypes.join(", ")}`);
  }
  if (result.summary) {
    console.log(`  Status: ${result.reportStatus}`);
    for (const line of result.summary) {
      console.log(`  ${line}`);
    }
  }
  if (result.rows && result.rows.length > 0) {
    console.table(result.rows);
  }
  if (result.filePath) {
    console.log(`  File: ${result.filePath}`);
  }
}

async function createSampleData() {
  const products = [
    ["PROD-001", "Foul Medames", "Canned Foods", 20, 15, addDays(130)],
    ["PROD-002", "Tahini", "Pantry", 4, 10, addDays(300)],
    ["PROD-003", "Pita Bread", "Bakery", 25, 10, addDays(3)],
    ["PROD-004", "Feta Cheese", "Dairy", 0, 5, addDays(20)],
    ["PROD-005", "Halawa", "Sweets", 40, 10, addDays(5)],
  ];
  for (const [productId, productName, category, quantityOnHand, reorderLevel, expiryDate] of products) {
    await Product.create({ productId, productName, category });
    await InventoryRecord.create({
      inventoryId: productId.replace("PROD", "INV"),
      productId,
      quantityOnHand,
      reorderLevel,
      expiryDate,
    });
  }
  await RestockAlert.create({ alertId: "ALERT-001", reorderInformation: "Reorder Tahini", inventoryId: "INV-002" });

  const sales = [
    ["SALE-101", today(), "Debit", [["PROD-001", 3, 2.5], ["PROD-003", 2, 3.49]]],
    ["SALE-102", today(), "Cash", [["PROD-002", 1, 8.99]]],
    ["SALE-103", addDays(-3), "Credit", [["PROD-005", 2, 6.5]]],
    ["SALE-104", addDays(-12), "Debit", [["PROD-001", 5, 2.5], ["PROD-004", 1, 7.99]]],
  ];
  for (const [saleId, saleDate, paymentMethod, items] of sales) {
    const sale = await Sale.create({ saleId, saleDate, paymentMethod });
    for (const [productId, quantity, unitPrice] of items) {
      await sale.addItem({ productId, quantity, unitPrice });
    }
  }
}

async function demo() {
  try {
    await sequelize.sync();
    await createSampleData();

    const handler = new ReportHandler();
    const monthStart = addDays(-30);

    console.log("FEATURE 2 - VIEW DASHBOARD AND REPORTS (Store Owner)");

    show("Owner opens the dashboard (steps 1-3)", await handler.openDashboard());
    show("Owner views the available reports (step 4)", await handler.viewReports());

    show(
      "Owner selects the Inventory Report for the last 30 days (steps 5-6, subflow 5a)",
      await handler.selectReport("inventory", monthStart, today())
    );
    show(
      "Owner enters a filter with the start date after the end date (alternate flow 8b)",
      await handler.applyFilter(today(), monthStart, null, null)
    );
    show(
      "Owner corrects the filter: category Canned Foods (subflow 8a)",
      await handler.applyFilter(null, null, null, "Canned Foods")
    );
    show("Owner exports the filtered report as a PDF", await handler.exportReport("PDF"));
    show("Owner closes the report", await handler.closeReport());

    show(
      "Owner selects the Sales Report for the last 30 days (subflow 5b)",
      await handler.selectReport("sales", monthStart, today())
    );
    show("Owner picks a different sales period: today only (subflow 5b, opt)", await handler.selectSalesPeriod(today(), today()));
    show("Owner exports the sales report as a CSV file", await handler.exportReport("CSV"));
    show("Owner tries to export as Word (only PDF or CSV are allowed)", await handler.exportReport("DOCX"));
    show("Owner closes the report", await handler.closeReport());

    show(
      "Owner selects the Expiry / Restock Report (subflow 5c)",
      await handler.selectReport("expiryRestock", monthStart, today())
    );
    show("Owner closes the report without exporting it (alternate flow 10b)", await handler.closeReport());

    show(
      "Owner asks for a sales report for January 2000 (alternate flow 6a: no data)",
      await handler.selectReport("sales", "2000-01-01", "2000-01-31")
    );
    show("Owner returns to the report selection", await handler.returnToReportSelection());

    console.log("\nDemo finished. (It used a temporary database; your real data was not changed.)");
    console.log(`Exported files are in: ${path.join(__dirname, "..", "exports")}`);
  } catch (error) {
    console.error("\nDemo failed:");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
    fs.rmSync(demoDir, { recursive: true, force: true });
  }
}

demo();
