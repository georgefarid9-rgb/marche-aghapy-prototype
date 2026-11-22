const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Always use a fresh database, even when called by the integration suite.
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-reports-check-"));
process.env.SQLITE_PATH = path.join(testDir, "reports.sqlite");

// Exported test files go to a temporary folder that is removed at the end.
const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-report-exports-"));
process.env.REPORT_EXPORT_DIR = exportDir;

const { QueryTypes, Op } = require("sequelize");
const sequelize = require("../src/database");

const {
  DashboardSummary,
  Report,
  InventoryReport,
  SalesReport,
  ExpiryRestockReport,
  ReportFilter,
  ReportExport,
  Product,
  InventoryRecord,
  RestockAlert,
  Sale,
  SaleItem,
  SaleSalesReport,
  InventoryReportRecord,
  ExpiryRestockReportRecord,
} = require("../src/models");
const ReportBase = require("../src/models/ReportBase");
const ReportHandler = require("../src/controllers/ReportHandler");
const { today } = require("../src/utils/dates");
const { roundMoney } = require("../src/utils/reportHelpers");

// Feature 2 verification. Every step is checked with an assertion.
// Any failed check stops the script with exit code 1, so it cannot
// report success when something is wrong.
//
// Sections 1-6 check the classes, attributes and relationships.
// Sections 7-15 check the Prototype 2 methods, following the Feature 2 sequence diagrams.
//
// The script creates its own test records (all IDs start with "VR-")
// and deletes them at the end, so it does not need seed data and can
// be run more than once.

const SUMMARY_ID = "VR-SUM-001";
const HANDLER_SUMMARY_ID = "VR-SUM-002";
const INV_REPORT_ID = "VR-REP-INV";
const SALES_REPORT_ID = "VR-REP-SAL";
const EXPIRY_REPORT_ID = "VR-REP-EXP";
const FILTER_ID = "VR-FIL-001";
const EXPORT_ID = "VR-EXP-001";
const MISSING_ID = "VR-DOES-NOT-EXIST";
const TEST_CATEGORY = "VR Test Category";

const ALL_REPORT_IDS = [
  INV_REPORT_ID,
  SALES_REPORT_ID,
  EXPIRY_REPORT_ID,
  "VR-REP-NOTYPE",
  "VR-REP-BADSUM",
  "VR-REP-BADTYPE",
  "VR-REP-BADPERIOD",
  "VR-REP-BADSTATUS",
];

const PRODUCT_IDS = ["VR-PROD-LOW", "VR-PROD-EXP", "VR-PROD-OK"];
const INVENTORY_IDS = ["VR-INV-LOW", "VR-INV-EXP", "VR-INV-OK"];
const SALE_IDS = ["VR-SALE-1", "VR-SALE-2"];

let passed = 0;
let createdTodaySummary = false;

function pass(message) {
  passed += 1;
  console.log(`  PASS  ${message}`);
}

// Run fn and confirm it is rejected (throws or rejects).
async function expectRejected(fn, message) {
  let rejected = false;
  try {
    await fn();
  } catch (err) {
    rejected = true;
    console.log(`  PASS  ${message} -> rejected: ${err.message.split("\n")[0]}`);
  }
  assert.ok(rejected, `${message}: expected the operation to be rejected, but it succeeded`);
  passed += 1;
}

// A handler result with ok: false is how ReportHandler shows a problem to the user.
function expectRefused(result, pattern, message) {
  assert.equal(result.ok, false, `${message}: expected ok: false`);
  assert.match(result.message, pattern, `${message}: unexpected message "${result.message}"`);
  pass(`${message} -> "${result.message}"`);
}

function expectOk(result, message) {
  assert.equal(result.ok, true, `${message}: ${result.message}`);
}

// "YYYY-MM-DD" a number of days from today (UTC, like src/utils/dates.js).
function addDays(days) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const idsOf = (records, key) => records.map((record) => record[key]).sort();

// Delete every test record, children first so foreign keys are respected.
async function removeTestData() {
  const reportRows = await Report.findAll({
    attributes: ["reportId"],
    where: {
      [Op.or]: [{ summaryId: [SUMMARY_ID, HANDLER_SUMMARY_ID] }, { reportId: ALL_REPORT_IDS }],
    },
  });
  const reportIds = [...new Set([...reportRows.map((r) => r.reportId), ...ALL_REPORT_IDS, MISSING_ID])];

  await ReportFilter.destroy({
    where: { [Op.or]: [{ filterId: [FILTER_ID, "VR-FIL-BAD"] }, { reportId: reportIds }] },
  });
  await ReportExport.destroy({
    where: { [Op.or]: [{ exportId: [EXPORT_ID, "VR-EXP-BAD", "VR-EXP-NOFMT"] }, { reportId: reportIds }] },
  });
  await InventoryReportRecord.destroy({
    where: { [Op.or]: [{ reportId: reportIds }, { inventoryId: INVENTORY_IDS }] },
  });
  await ExpiryRestockReportRecord.destroy({
    where: { [Op.or]: [{ reportId: reportIds }, { inventoryId: INVENTORY_IDS }] },
  });
  await SaleSalesReport.destroy({ where: { [Op.or]: [{ reportId: reportIds }, { saleId: SALE_IDS }] } });
  await InventoryReport.destroy({ where: { reportId: reportIds } });
  await SalesReport.destroy({ where: { reportId: reportIds } });
  await ExpiryRestockReport.destroy({ where: { reportId: reportIds } });
  await Report.destroy({ where: { reportId: reportIds } });
  await DashboardSummary.destroy({ where: { summaryId: [SUMMARY_ID, HANDLER_SUMMARY_ID] } });

  // Today's summary is only removed if this script created it and nothing uses it.
  const todayId = `SUM-${today()}`;
  if (createdTodaySummary && (await Report.count({ where: { summaryId: todayId } })) === 0) {
    await DashboardSummary.destroy({ where: { summaryId: todayId } });
  }

  await SaleItem.destroy({ where: { saleId: SALE_IDS } });
  await Sale.destroy({ where: { saleId: SALE_IDS } });
  await InventoryRecord.destroy({ where: { inventoryId: INVENTORY_IDS } });
  await Product.destroy({ where: { productId: PRODUCT_IDS } });
}

// Read a PRAGMA result as a plain list of rows.
async function pragma(sql) {
  const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });
  return Array.isArray(rows[0]) ? rows[0] : rows;
}

// Products, stock and sales used by sections 8-15.
async function createTestStoreData() {
  for (const [productId, productName] of [
    ["VR-PROD-LOW", "VR Tahini"],
    ["VR-PROD-EXP", "VR Pita Bread"],
    ["VR-PROD-OK", "VR Lentils"],
  ]) {
    await Product.create({ productId, productName, category: TEST_CATEGORY });
  }

  // Low stock (2 <= reorder level 5), no expiry date.
  await InventoryRecord.create({ inventoryId: "VR-INV-LOW", productId: "VR-PROD-LOW", quantityOnHand: 2, reorderLevel: 5 });
  // Plenty of stock, but it expires in 3 days.
  await InventoryRecord.create({
    inventoryId: "VR-INV-EXP",
    productId: "VR-PROD-EXP",
    quantityOnHand: 30,
    reorderLevel: 5,
    expiryDate: addDays(3),
  });
  // Plenty of stock, expires in 200 days.
  await InventoryRecord.create({
    inventoryId: "VR-INV-OK",
    productId: "VR-PROD-OK",
    quantityOnHand: 50,
    reorderLevel: 5,
    expiryDate: addDays(200),
  });

  // A sale today (2 x 4.25 = 8.50) and a sale 10 days ago (1 x 3.00).
  const saleToday = await Sale.create({ saleId: "VR-SALE-1", saleDate: today(), paymentMethod: "Debit" });
  await saleToday.addItem({ productId: "VR-PROD-OK", quantity: 2, unitPrice: 4.25 });
  const saleBefore = await Sale.create({ saleId: "VR-SALE-2", saleDate: addDays(-10), paymentMethod: "Cash" });
  await saleBefore.addItem({ productId: "VR-PROD-LOW", quantity: 1, unitPrice: 3 });
}

async function verifyReports() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    // ----- 1. Foreign keys exist in the database itself -----
    console.log("\n1. Foreign keys in the database schema");

    const [fkSetting] = await pragma("PRAGMA foreign_keys");
    assert.equal(Number(fkSetting.foreign_keys), 1, "SQLite foreign key enforcement is OFF.");
    pass("SQLite foreign key enforcement is ON");

    const expectedForeignKeys = [
      ["reports", "summaryId", "dashboard_summaries"],
      ["inventory_reports", "reportId", "reports"],
      ["sales_reports", "reportId", "reports"],
      ["expiry_restock_reports", "reportId", "reports"],
      ["report_filters", "reportId", "reports"],
      ["report_exports", "reportId", "reports"],
      ["inventory_report_records", "reportId", "inventory_reports"],
      ["inventory_report_records", "inventoryId", "inventory_records"],
      ["expiry_restock_report_records", "reportId", "expiry_restock_reports"],
      ["expiry_restock_report_records", "inventoryId", "inventory_records"],
      ["sale_sales_reports", "reportId", "sales_reports"],
      ["sale_sales_reports", "saleId", "sales"],
    ];

    for (const [table, column, parent] of expectedForeignKeys) {
      const fks = await pragma(`PRAGMA foreign_key_list(${table})`);
      const found = fks.some((fk) => fk.from === column && fk.table === parent);
      assert.ok(
        found,
        `${table}.${column} has no foreign key to ${parent}. ` +
          "Is the database up to date? Run npm run reports:migrate (see README)."
      );
      pass(`${table}.${column} -> ${parent}`);
    }

    await removeTestData(); // in case an earlier run stopped halfway

    // ----- 2. Creating reports -----
    console.log("\n2. Report creation");

    await DashboardSummary.create({
      summaryId: SUMMARY_ID,
      summaryDate: "2026-10-25",
      totalSalesToday: 300,
      lowStockCount: 1,
      nearExpiryCount: 2,
      pendingRestockCount: 1,
    });

    await Report.bulkCreate([
      {
        reportId: INV_REPORT_ID,
        reportType: "inventory",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-25",
        summaryId: SUMMARY_ID,
      },
      {
        reportId: SALES_REPORT_ID,
        reportType: "sales",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-25",
        summaryId: SUMMARY_ID,
      },
      {
        reportId: EXPIRY_REPORT_ID,
        reportType: "expiryRestock",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-25",
        summaryId: SUMMARY_ID,
      },
    ]);

    await InventoryReport.create({
      reportId: INV_REPORT_ID,
      totalProducts: 12,
      totalQuantityOnHand: 240,
      lowStockCount: 1,
    });
    await SalesReport.create({
      reportId: SALES_REPORT_ID,
      totalSalesAmount: 300,
      numberOfSales: 4,
    });
    await ExpiryRestockReport.create({
      reportId: EXPIRY_REPORT_ID,
      nearExpiryCount: 2,
      restockCount: 1,
    });
    await ReportFilter.create({
      filterId: FILTER_ID,
      reportId: INV_REPORT_ID,
      startDate: "2026-10-01",
      endDate: "2026-10-25",
      category: "Canned Foods",
    });
    await ReportExport.create({
      exportId: EXPORT_ID,
      reportId: INV_REPORT_ID,
      exportFormat: "CSV",
      fileName: "inventory-report-oct-2026.csv",
    });
    pass("created 1 DashboardSummary, 3 Reports with details, 1 ReportFilter, 1 ReportExport");

    // ----- 3. Retrieval and default values -----
    console.log("\n3. Report retrieval");

    const invReport = await Report.findByPk(INV_REPORT_ID, {
      include: [
        { model: DashboardSummary, as: "dashboardSummary" },
        { model: InventoryReport, as: "inventoryDetails" },
        { model: SalesReport, as: "salesDetails" },
        { model: ReportFilter, as: "filters" },
        { model: ReportExport, as: "exports" },
      ],
    });

    assert.ok(invReport, `${INV_REPORT_ID} was not found after it was created.`);
    assert.equal(invReport.reportType, "inventory");
    assert.equal(invReport.periodStart, "2026-10-01");
    assert.equal(invReport.periodEnd, "2026-10-25");
    assert.equal(invReport.reportStatus, "generated", "reportStatus should default to generated");
    assert.ok(invReport.generatedDate instanceof Date, "generatedDate should be set automatically");
    pass("inventory report read back with its period, default status and generated date");

    const summary = await DashboardSummary.findByPk(SUMMARY_ID);
    assert.equal(summary.dataStatus, "Available", "dataStatus should default to Available");
    assert.equal(summary.totalSalesToday, 300);
    pass("DashboardSummary read back; dataStatus defaults to Available");

    // ----- 4. Associations -----
    console.log("\n4. Associations");

    // DashboardSummary 1 <>---- 1..* Report
    const summaryWithReports = await DashboardSummary.findByPk(SUMMARY_ID, {
      include: [{ model: Report, as: "reports" }],
    });
    const reportIds = summaryWithReports.reports.map((r) => r.reportId).sort();
    assert.deepEqual(reportIds, [INV_REPORT_ID, SALES_REPORT_ID, EXPIRY_REPORT_ID].sort());
    assert.equal(invReport.dashboardSummary.summaryId, SUMMARY_ID);
    pass("DashboardSummary contains its 3 reports, and each report points back to it");

    // Report 1 ---- 0..* ReportFilter
    assert.equal(invReport.filters.length, 1);
    assert.equal(invReport.filters[0].category, "Canned Foods");
    const filter = await ReportFilter.findByPk(FILTER_ID, {
      include: [{ model: Report, as: "report" }],
    });
    assert.equal(filter.report.reportId, INV_REPORT_ID);
    pass("Report is narrowed by its ReportFilter, and the filter points back to the report");

    // Report 1 ---- 0..* ReportExport
    assert.equal(invReport.exports.length, 1);
    assert.equal(invReport.exports[0].exportFormat, "CSV");
    assert.ok(invReport.exports[0].exportDate instanceof Date, "exportDate should be set automatically");
    const exported = await ReportExport.findByPk(EXPORT_ID, {
      include: [{ model: Report, as: "report" }],
    });
    assert.equal(exported.report.reportId, INV_REPORT_ID);
    pass("Report is exported as its ReportExport (exports), and the export points back to the report");

    // Report <|---- InventoryReport, SalesReport, ExpiryRestockReport
    assert.equal(invReport.inventoryDetails.totalProducts, 12);
    assert.equal(invReport.inventoryDetails.totalQuantityOnHand, 240);
    assert.equal(invReport.salesDetails, null, "an inventory report should have no sales details");
    pass("inventory report has InventoryReport details and no SalesReport details");

    const salesDetails = await SalesReport.findByPk(SALES_REPORT_ID, {
      include: [{ model: Report, as: "report" }],
    });
    assert.equal(salesDetails.report.reportType, "sales");
    pass("SalesReport points back to its parent Report (type: sales)");

    const expiryReport = await Report.findByPk(EXPIRY_REPORT_ID, {
      include: [{ model: ExpiryRestockReport, as: "expiryRestockDetails" }],
    });
    assert.equal(expiryReport.expiryRestockDetails.nearExpiryCount, 2);
    assert.equal(expiryReport.expiryRestockDetails.restockCount, 1);
    assert.equal(expiryReport.expiryRestockDetails.expiryWindowDays, 7, "expiryWindowDays should default to 7");
    pass("ExpiryRestockReport details read back; expiryWindowDays defaults to 7");

    const details = await invReport.getDetails();
    assert.ok(details instanceof InventoryReport, "Report.getDetails() should return the InventoryReport");
    pass("Report.getDetails() returns the InventoryReport for an inventory report");

    // ----- 5. Derived attribute /averageSaleAmount -----
    console.log("\n5. Derived attribute /averageSaleAmount");

    assert.equal(salesDetails.averageSaleAmount, 75);
    pass("300 total over 4 sales -> averageSaleAmount is 75");

    const noSales = SalesReport.build({ reportId: "VR-UNSAVED", totalSalesAmount: 0, numberOfSales: 0 });
    assert.equal(noSales.averageSaleAmount, 0);
    pass("0 sales -> averageSaleAmount is 0 (no division by zero)");

    // ----- 6. Invalid data is rejected -----
    console.log("\n6. Invalid data is rejected");

    await expectRejected(
      () => ReportFilter.create({ filterId: "VR-FIL-BAD", reportId: MISSING_ID, category: "Canned Foods" }),
      "ReportFilter pointing to a report that does not exist"
    );

    await expectRejected(
      () => ReportExport.create({
        exportId: "VR-EXP-BAD",
        reportId: MISSING_ID,
        exportFormat: "PDF",
        fileName: "missing.pdf",
      }),
      "ReportExport pointing to a report that does not exist"
    );

    await expectRejected(
      () => InventoryReport.create({ reportId: MISSING_ID, totalProducts: 1 }),
      "InventoryReport details without a parent Report"
    );

    await expectRejected(
      () => Report.create({
        reportId: "VR-REP-BADSUM",
        reportType: "sales",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-25",
        summaryId: MISSING_ID,
      }),
      "Report pointing to a dashboard summary that does not exist"
    );

    await expectRejected(
      () => Report.create({ reportId: "VR-REP-NOTYPE" }),
      "Report without a reportType"
    );

    await expectRejected(
      () => Report.create({
        reportId: "VR-REP-BADTYPE",
        reportType: "expiry-restock",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-25",
        summaryId: SUMMARY_ID,
      }),
      'Report with the old type name "expiry-restock" (the diagram uses expiryRestock)'
    );

    await expectRejected(
      () => Report.create({
        reportId: "VR-REP-BADPERIOD",
        reportType: "inventory",
        periodStart: "2026-10-25",
        periodEnd: "2026-10-01",
        summaryId: SUMMARY_ID,
      }),
      "Report whose periodStart is after periodEnd {periodStart <= periodEnd}"
    );

    await expectRejected(
      () => Report.create({
        reportId: "VR-REP-BADSTATUS",
        reportType: "inventory",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-25",
        reportStatus: "Exported",
        summaryId: SUMMARY_ID,
      }),
      "Report whose reportStatus is not generated, noData or closed"
    );

    await expectRejected(
      () => ExpiryRestockReport.build({ reportId: "VR-UNSAVED", expiryWindowDays: 0 }).validate(),
      "ExpiryRestockReport with expiryWindowDays 0 {> 0}"
    );

    await expectRejected(
      () => ReportExport.create({ exportId: "VR-EXP-NOFMT", reportId: INV_REPORT_ID, fileName: "x.csv" }),
      "ReportExport without an exportFormat"
    );

    assert.throws(() => new ReportBase(), /abstract/);
    pass("Report (ReportBase) is abstract and cannot be created directly");

    // ----- 7. ReportFilter.validateCriteria() and updateCriteria() -----
    console.log("\n7. ReportFilter methods");

    const aFilter = ReportFilter.build({ filterId: "VR-FIL-MEM", reportId: INV_REPORT_ID });
    assert.equal(aFilter.validateCriteria(), false);
    pass("no criteria -> validateCriteria() is false (incomplete)");

    aFilter.updateCriteria(JSON.stringify({ startDate: "2026-11-10", endDate: "2026-11-01" }));
    assert.equal(aFilter.validateCriteria(), false);
    pass("start date after end date -> validateCriteria() is false {startDate <= endDate}");

    aFilter.updateCriteria(JSON.stringify({ startDate: "2026-13-40" }));
    assert.equal(aFilter.validateCriteria(), false);
    pass("impossible date 2026-13-40 -> validateCriteria() is false");

    aFilter.updateCriteria(JSON.stringify({ startDate: "2026-11-01", endDate: "2026-11-10", category: "Canned Foods" }));
    assert.equal(aFilter.validateCriteria(), true);
    assert.equal(aFilter.category, "Canned Foods");
    pass("corrected criteria -> validateCriteria() is true");

    aFilter.updateCriteria(JSON.stringify({ endDate: "" }));
    assert.equal(aFilter.endDate, null);
    assert.equal(aFilter.startDate, "2026-11-01", "criteria that are not mentioned should stay the same");
    pass("updateCriteria() only changes the fields it is given; an empty value clears one");

    await expectRejected(() => aFilter.updateCriteria('{"colour":"red"}'), "updateCriteria() with an unknown field");
    await expectRejected(() => aFilter.updateCriteria("category=Canned"), "updateCriteria() with text that is not JSON");

    // ----- 8. Test products, stock and sales -----
    console.log("\n8. Test data for the report methods");

    await createTestStoreData();
    pass("created 3 products with stock (low stock, near expiry, fine) and 2 sales (today, 10 days ago)");

    // ----- 9. DashboardSummary methods (normal flow steps 1-3, alternate flow 2a) -----
    console.log("\n9. DashboardSummary methods");

    const testSummary = DashboardSummary.build({ summaryId: HANDLER_SUMMARY_ID, summaryDate: today() });
    await testSummary.refreshSummary();

    const salesToday = await Sale.findAll({ where: { saleDate: today() } });
    const expectedSalesToday = roundMoney(salesToday.reduce((sum, sale) => sum + sale.totalAmount, 0));
    assert.equal(testSummary.totalSalesToday, expectedSalesToday);
    assert.ok(expectedSalesToday >= 8.5, "today's test sale (8.50) should be counted");
    pass(`refreshSummary(): /totalSalesToday = ${expectedSalesToday} (sum of today's sales)`);

    const lowStockTotal = await InventoryRecord.count({ where: { inventoryStatus: ["LOW_STOCK", "OUT_OF_STOCK"] } });
    const nearExpiryTotal = await InventoryRecord.count({
      where: { expiryDate: { [Op.ne]: null, [Op.lte]: addDays(7) } },
    });
    const pendingAlerts = await RestockAlert.count({ where: { alertStatus: "PENDING" } });
    assert.equal(testSummary.lowStockCount, lowStockTotal);
    assert.equal(testSummary.nearExpiryCount, nearExpiryTotal);
    assert.equal(testSummary.pendingRestockCount, pendingAlerts);
    pass(`refreshSummary(): /lowStockCount ${lowStockTotal}, /nearExpiryCount ${nearExpiryTotal}, /pendingRestockCount ${pendingAlerts}`);

    const savedSummary = await DashboardSummary.findByPk(HANDLER_SUMMARY_ID);
    assert.ok(savedSummary, "refreshSummary() should save the summary");
    assert.equal(savedSummary.dataStatus, "Available");
    assert.ok(savedSummary.lastRefreshed instanceof Date, "lastRefreshed should be set");
    pass("refreshSummary() saves the summary with dataStatus Available and lastRefreshed");

    assert.deepEqual(testSummary.getAvailableReportTypes(), ["inventory", "sales", "expiryRestock"]);
    pass("getAvailableReportTypes() -> inventory, sales, expiryRestock");

    const offline = DashboardSummary.build({ summaryId: "VR-UNSAVED", summaryDate: today() });
    offline.flagUnavailableData();
    assert.equal(offline.dataStatus, "Unavailable");
    pass("flagUnavailableData() sets dataStatus to Unavailable");

    // Alternate flow 2a: one source cannot be read -> partial summary, flagged.
    RestockAlert.count = async () => {
      throw new Error("restock alerts could not be read (simulated)");
    };
    try {
      await testSummary.refreshSummary();
    } finally {
      delete RestockAlert.count; // back to the normal Sequelize count()
    }
    assert.equal(testSummary.dataStatus, "Unavailable");
    assert.ok(testSummary.unavailableParts.some((part) => part.startsWith("restock alerts")));
    assert.equal(testSummary.totalSalesToday, expectedSalesToday, "the parts that could be read are still shown");
    pass("2a: when restock alerts cannot be read, the summary is partial and flagged Unavailable");

    await testSummary.refreshSummary();
    assert.equal(testSummary.dataStatus, "Available");
    pass("2a: refreshing again brings dataStatus back to Available");

    // ReportHandler.openDashboard() / viewReports()
    const todayId = `SUM-${today()}`;
    const todayExisted = Boolean(await DashboardSummary.findByPk(todayId));
    const dashboardHandler = new ReportHandler();
    const opened = await dashboardHandler.openDashboard();
    createdTodaySummary = !todayExisted;
    expectOk(opened, "openDashboard()");
    assert.equal(opened.summaryId, todayId);
    assert.equal(opened.dataStatus, "Available");
    const viewed = await dashboardHandler.viewReports();
    expectOk(viewed, "viewReports()");
    assert.deepEqual(viewed.reportTypes, ["inventory", "sales", "expiryRestock"]);
    pass(`ReportHandler.openDashboard() refreshes ${todayId}; viewReports() lists the 3 report types`);

    // From here on the handler uses the test summary, so every test report can be removed.
    const handler = new ReportHandler();
    handler.summary = testSummary;

    // ----- 10. Inventory report (normal flow, subflow 5a) -----
    console.log("\n10. Inventory report: generateReport(), identifyLowStock()");

    const inv = await handler.selectReport("inventory", addDays(-30), today());
    expectOk(inv, "selectReport(inventory)");
    const invRep = handler.currentReport;
    assert.ok(invRep instanceof InventoryReport);
    assert.equal(inv.reportStatus, "generated");

    const savedInv = await Report.findByPk(inv.reportId, {
      include: [{ model: InventoryReport, as: "inventoryDetails" }],
    });
    assert.ok(savedInv, "the generated report should be saved");
    assert.equal(savedInv.reportType, "inventory");
    assert.equal(savedInv.reportStatus, "generated");
    assert.equal(savedInv.summaryId, HANDLER_SUMMARY_ID);
    assert.ok(savedInv.generatedDate instanceof Date, "generatedDate should be saved");
    pass('generateReport(): reportStatus = "generated", generatedDate saved, linked to the DashboardSummary');

    const everyRecord = await InventoryRecord.findAll();
    assert.equal(savedInv.inventoryDetails.totalProducts, everyRecord.length);
    assert.equal(
      savedInv.inventoryDetails.totalQuantityOnHand,
      everyRecord.reduce((sum, record) => sum + record.quantityOnHand, 0)
    );
    assert.equal(savedInv.inventoryDetails.lowStockCount, lowStockTotal);
    pass(`totals saved: ${everyRecord.length} products, /lowStockCount ${lowStockTotal}`);

    const lowIds = idsOf(invRep.lowStockItems, "inventoryId");
    assert.ok(lowIds.includes("VR-INV-LOW"), "VR-INV-LOW should be low stock");
    assert.ok(!lowIds.includes("VR-INV-OK"), "VR-INV-OK should not be low stock");
    pass("identifyLowStock() returns VR-INV-LOW and not VR-INV-OK");

    const linkedRecords = await savedInv.inventoryDetails.getInventoryRecords();
    assert.equal(linkedRecords.length, everyRecord.length);
    const lowRecord = await InventoryRecord.findByPk("VR-INV-LOW", {
      include: [{ model: InventoryReport, as: "inventoryReports" }],
    });
    assert.ok(lowRecord.inventoryReports.some((report) => report.reportId === inv.reportId));
    pass("inventoryRecords[1..*] saved, and InventoryRecord.inventoryReports points back");

    // Subflow 8a / alternate flow 8b: filter
    const badFilter = await handler.applyFilter(today(), addDays(-30), null, null);
    expectRefused(badFilter, /start date must be on or before/, "8b: filter with start date after end date");
    assert.equal(badFilter.isValid, false);
    assert.equal(await ReportFilter.count({ where: { reportId: inv.reportId } }), 0, "an invalid filter must not be saved");
    const pendingFilterId = handler.pendingFilter.filterId;

    const goodFilter = await handler.applyFilter(null, null, null, TEST_CATEGORY);
    expectOk(goodFilter, "8b: corrected filter");
    assert.equal(goodFilter.isValid, true);
    assert.equal(goodFilter.filterId, pendingFilterId, "8b should correct the same filter (updateCriteria)");
    assert.deepEqual(idsOf(invRep.filteredResults, "inventoryId"), [...INVENTORY_IDS].sort());
    const savedFilter = await ReportFilter.findByPk(pendingFilterId);
    assert.equal(savedFilter.category, TEST_CATEGORY);
    assert.equal(savedFilter.startDate, null, "the corrected filter replaces the old dates");
    pass("8b: corrected criteria are applied to the same filter, saved, and match the 3 test items");

    const productFilter = await handler.applyFilter(null, null, "VR-PROD-LOW", null);
    expectOk(productFilter, "filter by product");
    assert.deepEqual(idsOf(invRep.filteredResults, "inventoryId"), ["VR-INV-LOW"]);
    pass("applyFilter() by productId keeps only VR-INV-LOW");

    // Export (normal flow) - the export shows the filtered records.
    const csv = await handler.exportReport("csv");
    expectOk(csv, "exportReport(CSV)");
    assert.equal(csv.exportFormat, "CSV");
    const csvText = fs.readFileSync(csv.filePath, "utf8");
    assert.ok(csvText.includes("VR-INV-LOW") && !csvText.includes("VR-INV-OK"), "the CSV should hold the filtered rows");
    const savedExport = await ReportExport.findByPk(csv.exportId);
    assert.equal(savedExport.fileName, csv.fileName);
    pass(`exportReport("csv") -> createExportFile() wrote ${csv.fileName} and saved the ReportExport`);

    const pdf = await handler.exportReport("PDF");
    expectOk(pdf, "exportReport(PDF)");
    const pdfBytes = fs.readFileSync(pdf.filePath, "latin1");
    assert.ok(pdfBytes.startsWith("%PDF-") && pdfBytes.trimEnd().endsWith("%%EOF"), "the PDF file is not valid");
    pass(`exportReport("PDF") -> ${pdf.fileName} is a PDF file`);

    expectRefused(await handler.exportReport("DOCX"), /PDF or CSV/, "export format other than PDF or CSV {PDF, CSV}");

    const withChildren = await Report.findByPk(inv.reportId, {
      include: [
        { model: ReportExport, as: "exports" },
        { model: ReportFilter, as: "filters" },
      ],
    });
    assert.equal(withChildren.exports.length, 2);
    assert.equal(withChildren.filters.length, 2);
    pass("the report now has 2 exports and 2 filters");

    // Close (alternate flow 10b)
    const closed = await handler.closeReport();
    expectOk(closed, "closeReport()");
    assert.equal((await Report.findByPk(inv.reportId)).reportStatus, "closed");
    assert.equal(handler.currentReport, null);
    pass('closeReport(): reportStatus = "closed"');

    expectRefused(await handler.applyFilter(null, null, null, TEST_CATEGORY), /Select a report first/, "filter after the report was closed");
    const lateFilter = ReportFilter.build({ filterId: "VR-FIL-LATE", reportId: inv.reportId, category: TEST_CATEGORY });
    await expectRejected(() => invRep.applyFilter(lateFilter), "applyFilter() on a closed report");
    await expectRejected(() => invRep.exportReport("CSV"), "exportReport() on a closed report");
    await expectRejected(() => invRep.closeReport(), "closeReport() twice");
    await expectRejected(
      async () => (await Report.findByPk(inv.reportId)).generateReport(),
      "generateReport() on a closed report"
    );

    // ----- 11. Sales report (subflow 5b) -----
    console.log("\n11. Sales report: generateReport(), summarizeSales()");

    const periodStart = addDays(-30);
    const sales = await handler.selectReport("sales", periodStart, today());
    expectOk(sales, "selectReport(sales)");
    const salesRep = handler.currentReport;
    assert.ok(salesRep instanceof SalesReport);

    const periodSales = await Sale.findAll({ where: { saleDate: { [Op.between]: [periodStart, today()] } } });
    const periodTotal = roundMoney(periodSales.reduce((sum, sale) => sum + sale.totalAmount, 0));
    const savedSales = await SalesReport.findByPk(sales.reportId);
    assert.equal(savedSales.numberOfSales, periodSales.length);
    assert.equal(savedSales.totalSalesAmount, periodTotal);
    assert.equal(savedSales.averageSaleAmount, roundMoney(periodTotal / periodSales.length));
    pass(`summarizeSales(): ${periodSales.length} sales, total ${periodTotal}, average ${savedSales.averageSaleAmount}`);

    const linkedSales = idsOf(await savedSales.getSales(), "saleId");
    assert.equal(linkedSales.length, periodSales.length);
    assert.ok(linkedSales.includes("VR-SALE-1") && linkedSales.includes("VR-SALE-2"));
    const oldSale = await Sale.findByPk("VR-SALE-2", { include: [{ model: SalesReport, as: "salesReports" }] });
    assert.ok(oldSale.salesReports.some((report) => report.reportId === sales.reportId));
    pass("sales[0..*] saved, and Sale.salesReports points back");

    const salesByProduct = await handler.applyFilter(null, null, "VR-PROD-LOW", null);
    expectOk(salesByProduct, "sales filter by product");
    assert.deepEqual(idsOf(salesRep.filteredResults, "saleId"), ["VR-SALE-2"]);
    assert.ok(salesByProduct.summary.includes("Overall report totals (before filtering):"));
    assert.ok(salesByProduct.summary.some((line) => line.includes("showing 1 of 2 record(s)")));
    assert.equal(salesRep.totalSalesAmount, periodTotal);
    const filteredCsv = await handler.exportReport("CSV");
    expectOk(filteredCsv, "export filtered sales CSV");
    const filteredCsvText = fs.readFileSync(filteredCsv.filePath, "utf8");
    assert.match(filteredCsvText, /Overall report totals \(before filtering\)/);
    assert.match(filteredCsvText, /VR-SALE-2/);
    assert.doesNotMatch(filteredCsvText, /VR-SALE-1/);
    const filteredPdf = await handler.exportReport("PDF");
    expectOk(filteredPdf, "export filtered sales PDF");
    const filteredPdfText = fs.readFileSync(filteredPdf.filePath, "latin1");
    assert.match(filteredPdfText, /VR-SALE-2/);
    assert.doesNotMatch(filteredPdfText, /VR-SALE-1/);
    pass("applyFilter() by product keeps the sale that contains VR-PROD-LOW");

    const salesByDate = await handler.applyFilter(today(), today(), null, null);
    expectOk(salesByDate, "sales filter by date");
    assert.ok(salesRep.filteredResults.every((sale) => sale.saleDate === today()));
    assert.ok(idsOf(salesRep.filteredResults, "saleId").includes("VR-SALE-1"));
    pass("applyFilter() by date keeps only today's sales");

    // Subflow 5b (opt): the Store Owner picks a different period.
    const todayOnly = await handler.selectSalesPeriod(today(), today());
    expectOk(todayOnly, "selectSalesPeriod(today, today)");
    assert.equal(salesRep.numberOfSales, salesToday.length);
    assert.equal(salesRep.totalSalesAmount, expectedSalesToday);
    assert.equal(salesRep.filteredResults, null, "a new period clears the old filter results");
    const movedReport = await Report.findByPk(sales.reportId);
    assert.equal(movedReport.periodStart, today());
    assert.equal(movedReport.periodEnd, today());
    const movedLinks = idsOf(await (await SalesReport.findByPk(sales.reportId)).getSales(), "saleId");
    assert.ok(movedLinks.includes("VR-SALE-1") && !movedLinks.includes("VR-SALE-2"));
    pass("5b opt: selectSalesPeriod() re-summarizes, saves the new period and its sales");

    expectRefused(
      await handler.selectSalesPeriod(today(), addDays(-1)),
      /on or before/,
      "selectSalesPeriod() with the end before the start"
    );

    const emptyPeriod = await handler.selectSalesPeriod("2000-01-01", "2000-01-02");
    expectOk(emptyPeriod, "selectSalesPeriod() with no sales");
    assert.equal(salesRep.numberOfSales, 0);
    assert.equal(salesRep.totalSalesAmount, 0);
    assert.equal(emptyPeriod.message, "No sales were recorded in this period.");
    pass("selectSalesPeriod() for a period with no sales -> 0 sales and a message");

    expectOk(await handler.closeReport(), "close the sales report");

    // ----- 12. Expiry / restock report (subflow 5c) -----
    console.log("\n12. Expiry / restock report: identifyNearExpiry(), identifyRestockNeeds()");

    const exp = await handler.selectReport("expiryRestock", addDays(-30), today());
    expectOk(exp, "selectReport(expiryRestock)");
    const expRep = handler.currentReport;
    assert.ok(expRep instanceof ExpiryRestockReport);

    const nearIds = idsOf(expRep.nearExpiryItems, "inventoryId");
    assert.ok(nearIds.includes("VR-INV-EXP"), "VR-INV-EXP expires in 3 days");
    assert.ok(!nearIds.includes("VR-INV-OK") && !nearIds.includes("VR-INV-LOW"));
    pass("identifyNearExpiry() returns VR-INV-EXP (3 days) and not VR-INV-OK (200 days) or VR-INV-LOW (no date)");

    const restockIds = idsOf(expRep.restockItems, "inventoryId");
    assert.ok(restockIds.includes("VR-INV-LOW") && !restockIds.includes("VR-INV-EXP"));
    pass("identifyRestockNeeds() returns VR-INV-LOW and not VR-INV-EXP");

    const savedExp = await ExpiryRestockReport.findByPk(exp.reportId);
    assert.equal(savedExp.nearExpiryCount, nearExpiryTotal);
    assert.equal(savedExp.restockCount, lowStockTotal);
    assert.equal(savedExp.expiryWindowDays, 7);
    assert.equal((await savedExp.getInventoryRecords()).length, everyRecord.length);
    const expRecord = await InventoryRecord.findByPk("VR-INV-EXP", {
      include: [{ model: ExpiryRestockReport, as: "expiryRestockReports" }],
    });
    assert.ok(expRecord.expiryRestockReports.some((report) => report.reportId === exp.reportId));
    pass(`counts saved (near expiry ${nearExpiryTotal}, restock ${lowStockTotal}); inventoryRecords linked both ways`);

    const expiringSoon = await handler.applyFilter(today(), addDays(7), null, TEST_CATEGORY);
    expectOk(expiringSoon, "expiry filter");
    assert.deepEqual(idsOf(expRep.filteredResults, "inventoryId"), ["VR-INV-EXP"]);
    pass("applyFilter() on expiry dates keeps only VR-INV-EXP");

    expectRefused(
      await handler.selectSalesPeriod(today(), today()),
      /only be picked for a sales report/,
      "selectSalesPeriod() on an expiry report"
    );

    // Report.generateReport() on the shared Report row is passed to the right report type.
    const expParent = await Report.findByPk(exp.reportId);
    const firstGenerated = expParent.generatedDate;
    await expParent.generateReport();
    const regenerated = await Report.findByPk(exp.reportId);
    assert.equal(regenerated.reportStatus, "generated");
    assert.ok(regenerated.generatedDate >= firstGenerated);
    pass("Report.generateReport() hands the work to the ExpiryRestockReport");

    expectOk(await handler.closeReport(), "close the expiry report");

    // ----- 13. No report data (alternate flow 6a) -----
    console.log("\n13. No report data (alternate flow 6a)");

    const reportsBefore = await Report.count();
    const none = await handler.selectReport("sales", "2000-01-01", "2000-01-31");
    assert.equal(none.ok, false);
    assert.equal(none.reportStatus, "noData");
    assert.match(none.message, /No information is available/);
    assert.equal(await Report.count(), reportsBefore, "a noData report must not be saved");
    assert.equal(handler.currentReport, null);
    pass('generateReport(): no sales in 2000 -> reportStatus = "noData", nothing saved');

    const back = await handler.returnToReportSelection();
    expectOk(back, "returnToReportSelection()");
    assert.deepEqual(back.reportTypes, ["inventory", "sales", "expiryRestock"]);
    pass("returnToReportSelection() shows the report types again");

    // ----- 14. generateReport() pre-conditions -----
    console.log("\n14. generateReport() pre-conditions");

    expectRefused(await handler.selectReport("weekly", addDays(-7), today()), /Choose a report type/, "unknown report type");
    expectRefused(await handler.selectReport("inventory", today(), addDays(-7)), /on or before/, "period start after period end");
    expectRefused(await handler.selectReport("sales", "2026-02-30", today()), /real dates/, "impossible period date");

    const mismatch = InventoryReport.build({ reportId: "VR-REP-MISMATCH" });
    mismatch.report = Report.build({
      reportId: "VR-REP-MISMATCH",
      reportType: "sales",
      periodStart: addDays(-7),
      periodEnd: today(),
      summaryId: HANDLER_SUMMARY_ID,
      reportStatus: null,
    });
    await expectRejected(() => mismatch.generateReport(), "an InventoryReport whose reportType is sales");

    // ----- 15. Nothing is left half-done -----
    console.log("\n15. Saved data is complete");

    const handlerReports = await Report.findAll({ where: { summaryId: HANDLER_SUMMARY_ID } });
    assert.equal(handlerReports.length, 3, "inventory, sales and expiry reports should be saved (not the noData one)");
    for (const report of handlerReports) {
      const reportDetails = await report.getDetails();
      assert.ok(reportDetails, `${report.reportId} has no ${report.reportType} row`);
      assert.equal(report.reportStatus, "closed");
    }
    pass("each saved report has its shared row and its own row, and all 3 were closed");

    console.log(`\nReport verification successful (${passed} checks passed).`);
  } catch (error) {
    console.error("\nReport verification FAILED:");
    console.error(`  ${error.message}`);
    process.exitCode = 1;
  } finally {
    // Remove the test records and files so the script can be run again.
    try {
      await removeTestData();
    } catch (cleanupError) {
      console.error(`Could not remove test data: ${cleanupError.message}`);
      process.exitCode = 1;
    }
    fs.rmSync(exportDir, { recursive: true, force: true });
    await sequelize.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

verifyReports();
