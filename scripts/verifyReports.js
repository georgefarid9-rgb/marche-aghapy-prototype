const assert = require("node:assert/strict");
const { QueryTypes } = require("sequelize");
const sequelize = require("../src/database");

const {
  DashboardSummary,
  Report,
  InventoryReport,
  SalesReport,
  ExpiryRestockReport,
  ReportFilter,
  ReportExport,
} = require("../src/models");

// Feature 2 verification. Every step is checked with an assertion.
// Any failed check stops the script with exit code 1, so it cannot
// report success when something is wrong.
//
// The script creates its own test records (all IDs start with "VR-")
// and deletes them at the end, so it does not need seed data and can
// be run more than once.

const SUMMARY_ID = "VR-SUM-001";
const INV_REPORT_ID = "VR-REP-INV";
const SALES_REPORT_ID = "VR-REP-SAL";
const EXPIRY_REPORT_ID = "VR-REP-EXP";
const FILTER_ID = "VR-FIL-001";
const EXPORT_ID = "VR-EXP-001";
const MISSING_ID = "VR-DOES-NOT-EXIST";

const ALL_REPORT_IDS = [
  INV_REPORT_ID,
  SALES_REPORT_ID,
  EXPIRY_REPORT_ID,
  "VR-REP-NOTYPE",
  "VR-REP-BADSUM",
];

let passed = 0;

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

// Delete every test record, children first so foreign keys are respected.
async function removeTestData() {
  await ReportFilter.destroy({ where: { filterId: [FILTER_ID, "VR-FIL-BAD"] } });
  await ReportExport.destroy({ where: { exportId: [EXPORT_ID, "VR-EXP-BAD", "VR-EXP-NOFMT"] } });
  await InventoryReport.destroy({ where: { reportId: [...ALL_REPORT_IDS, MISSING_ID] } });
  await SalesReport.destroy({ where: { reportId: ALL_REPORT_IDS } });
  await ExpiryRestockReport.destroy({ where: { reportId: ALL_REPORT_IDS } });
  await Report.destroy({ where: { reportId: ALL_REPORT_IDS } });
  await DashboardSummary.destroy({ where: { summaryId: SUMMARY_ID } });
}

// Read a PRAGMA result as a plain list of rows.
async function pragma(sql) {
  const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });
  return Array.isArray(rows[0]) ? rows[0] : rows;
}

async function verifyReports() {
  try {
    await sequelize.authenticate();
    await removeTestData(); // in case an earlier run stopped halfway

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
    ];

    for (const [table, column, parent] of expectedForeignKeys) {
      const fks = await pragma(`PRAGMA foreign_key_list(${table})`);
      const found = fks.some((fk) => fk.from === column && fk.table === parent);
      assert.ok(
        found,
        `${table}.${column} has no foreign key to ${parent}. ` +
          "Is the database up to date? (see README: Verify Feature 2)"
      );
      pass(`${table}.${column} -> ${parent}`);
    }

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
        reportType: "expiry-restock",
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
        { model: ReportExport, as: "reportExports" },
      ],
    });

    assert.ok(invReport, `${INV_REPORT_ID} was not found after it was created.`);
    assert.equal(invReport.reportType, "inventory");
    assert.equal(invReport.periodStart, "2026-10-01");
    assert.equal(invReport.periodEnd, "2026-10-25");
    assert.equal(invReport.reportStatus, "Generated", "reportStatus should default to Generated");
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
    assert.equal(invReport.reportExports.length, 1);
    assert.equal(invReport.reportExports[0].exportFormat, "CSV");
    assert.ok(invReport.reportExports[0].exportDate instanceof Date, "exportDate should be set automatically");
    const exported = await ReportExport.findByPk(EXPORT_ID, {
      include: [{ model: Report, as: "report" }],
    });
    assert.equal(exported.report.reportId, INV_REPORT_ID);
    pass("Report is exported as its ReportExport, and the export points back to the report");

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
      () => ReportFilter.create({ filterId: "VR-FIL-BAD", reportId: MISSING_ID }),
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
      () => Report.create({ reportId: "VR-REP-BADSUM", reportType: "sales", summaryId: MISSING_ID }),
      "Report pointing to a dashboard summary that does not exist"
    );

    await expectRejected(
      () => Report.create({ reportId: "VR-REP-NOTYPE" }),
      "Report without a reportType"
    );

    await expectRejected(
      () => ReportExport.create({ exportId: "VR-EXP-NOFMT", reportId: INV_REPORT_ID, fileName: "x.csv" }),
      "ReportExport without an exportFormat"
    );

    console.log(`\nReport verification successful (${passed} checks passed).`);
  } catch (error) {
    console.error("\nReport verification FAILED:");
    console.error(`  ${error.message}`);
    process.exitCode = 1;
  } finally {
    // Remove the test records so the script can be run again.
    try {
      await removeTestData();
    } catch (cleanupError) {
      console.error(`Could not remove test data: ${cleanupError.message}`);
      process.exitCode = 1;
    }
    await sequelize.close();
  }
}

verifyReports();
