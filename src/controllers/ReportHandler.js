const { ValidationError } = require("sequelize");
const {
  DashboardSummary,
  Report,
  InventoryReport,
  SalesReport,
  ExpiryRestockReport,
  ReportFilter,
} = require("../models");
const generateId = require("../utils/generateId");
const { today } = require("../utils/dates");
const { checkPeriod, toDateOnly } = require("../utils/reportHelpers");

// Feature 2 - Dashboard and Reports (Prototype 2)
//
// <<controller>> ReportHandler sits between the Store Owner and the Feature 2 classes.
// Each method makes the calls in the same order as the Feature 2 sequence diagrams:
//
//   openDashboard()            -> DashboardSummary.refreshSummary()
//   viewReports()              -> DashboardSummary.getAvailableReportTypes()
//   selectReport(type, start, end)
//                              -> create InventoryReport / SalesReport / ExpiryRestockReport
//                              -> aRep.generateReport()
//   selectSalesPeriod(start, end)                      (subflow 5b, opt)
//                              -> aSalesRep.summarizeSales(start, end)
//   applyFilter(startDate, endDate, productId, category)   (subflow 8a, alternate flow 8b)
//                              -> create ReportFilter (or updateCriteria) -> validateCriteria()
//                              -> [isValid] aRep.applyFilter(aFilter)
//   exportReport(format)       -> aRep.exportReport(format) -> ReportExport.createExportFile()
//   closeReport()              -> aRep.closeReport()      (alternate flow 10b)
//   refreshDashboard()         (alternate flow 2a)
//   returnToReportSelection()  (alternate flow 6a)
//
// Every method returns a plain object describing what the Store Owner sees, with ok and a
// message. A rule that is broken (bad dates, wrong format, ...) gives ok: false and a
// message instead of an error, so a page can show it.

const REPORT_CLASSES = {
  inventory: InventoryReport,
  sales: SalesReport,
  expiryRestock: ExpiryRestockReport,
};

// Our own rule errors and Sequelize validation errors are shown to the user.
// Anything else (a bug, a broken database) is not hidden.
function isExpected(error) {
  return error instanceof ValidationError || error.constructor === Error;
}

function messageOf(error) {
  return error instanceof ValidationError ? error.errors.map((e) => e.message).join("; ") : error.message;
}

class ReportHandler {
  constructor() {
    this.summary = null; // today's DashboardSummary
    this.currentReport = null; // the report the Store Owner is looking at
    this.pendingFilter = null; // a filter that was rejected and is waiting to be corrected
  }

  async run(action) {
    try {
      return await action();
    } catch (error) {
      if (isExpected(error)) {
        return { ok: false, message: messageOf(error) };
      }
      throw error;
    }
  }

  // ----- Dashboard (normal flow steps 1-3, alternate flow 2a) -----

  openDashboard() {
    return this.run(async () => {
      await this.loadSummary();
      await this.summary.refreshSummary();
      return this.describeSummary();
    });
  }

  // Alternate flow 2a: the owner asks to refresh after some data was unavailable.
  refreshDashboard() {
    return this.openDashboard();
  }

  viewReports() {
    return this.run(async () => {
      await this.ensureSummary();
      return { ok: true, reportTypes: this.summary.getAvailableReportTypes() };
    });
  }

  // ----- Reports (normal flow steps 4-6, subflows 5a, 5b, 5c, alternate flow 6a) -----

  selectReport(reportType, periodStart, periodEnd) {
    return this.run(async () => {
      const ReportClass = REPORT_CLASSES[reportType];
      if (!ReportClass) {
        throw new Error(`Choose a report type: ${Object.keys(REPORT_CLASSES).join(", ")}.`);
      }
      checkPeriod(periodStart, periodEnd);
      await this.ensureSummary();

      this.currentReport = null;
      this.pendingFilter = null;

      // aRep := create(periodStart, periodEnd)
      const reportId = generateId("REP");
      const aRep = ReportClass.build({ reportId });
      aRep.report = Report.build({
        reportId,
        reportType,
        periodStart,
        periodEnd,
        summaryId: this.summary.summaryId,
        generatedDate: null, // set by generateReport()
        reportStatus: null, // set by generateReport()
      });

      await aRep.generateReport();

      if (aRep.report.reportStatus === "noData") {
        // Alternate flow 6a: nothing was saved.
        return {
          ok: false,
          reportStatus: "noData",
          reportType,
          periodStart,
          periodEnd,
          message: "No information is available for this report and period. Choose another report or period.",
        };
      }

      this.currentReport = aRep;
      return this.describeReport("Report generated.");
    });
  }

  // Subflow 5b (opt): the Store Owner picks a different sales period.
  selectSalesPeriod(newStart, newEnd) {
    return this.run(async () => {
      const aSalesRep = this.requireReport();
      if (!(aSalesRep instanceof SalesReport)) {
        throw new Error("A different period can only be picked for a sales report.");
      }
      this.pendingFilter = null;

      await aSalesRep.summarizeSales(newStart, newEnd);

      return this.describeReport(
        aSalesRep.numberOfSales === 0
          ? "No sales were recorded in this period."
          : "Sales summary updated for the new period."
      );
    });
  }

  // Alternate flow 6a: go back to the list of report types.
  returnToReportSelection() {
    this.currentReport = null;
    this.pendingFilter = null;
    return this.viewReports();
  }

  // ----- Filter (subflow 8a, alternate flow 8b) -----

  applyFilter(startDate, endDate, productId, category) {
    return this.run(async () => {
      const aRep = this.requireReport();
      const criteria = JSON.stringify({
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        productId: productId ?? null,
        category: category ?? null,
      });

      let aFilter = this.pendingFilter;
      if (aFilter) {
        // 8b: the owner corrects the criteria that were rejected.
        aFilter.updateCriteria(criteria);
      } else {
        aFilter = ReportFilter.build({ filterId: generateId("FIL"), reportId: aRep.reportId });
        aFilter.updateCriteria(criteria);
      }

      const isValid = aFilter.validateCriteria();
      if (!isValid) {
        this.pendingFilter = aFilter;
        return {
          ok: false,
          isValid: false,
          message: `Invalid or incomplete filter criteria: ${aFilter.criteriaProblem()} Please correct them.`,
        };
      }

      await aRep.applyFilter(aFilter);
      this.pendingFilter = null;

      return {
        ...this.describeReport(
          `Filter applied: ${aRep.filteredResults.length} of ${aRep.reportData.length} record(s) match.`
        ),
        isValid: true,
        filterId: aFilter.filterId,
      };
    });
  }

  // ----- Export and close (normal flow, alternate flow 10b) -----

  exportReport(format) {
    return this.run(async () => {
      const aRep = this.requireReport();
      const anExport = await aRep.exportReport(format);
      return {
        ok: true,
        exportId: anExport.exportId,
        exportFormat: anExport.exportFormat,
        fileName: anExport.fileName,
        filePath: anExport.getFilePath(),
        message: `Report exported as ${anExport.fileName}.`,
      };
    });
  }

  closeReport() {
    return this.run(async () => {
      const aRep = this.requireReport();
      await aRep.closeReport();
      this.currentReport = null;
      this.pendingFilter = null;
      return { ok: true, reportId: aRep.reportId, reportStatus: "closed", message: "Report closed." };
    });
  }

  // ----- Helpers -----

  // Today's summary. Its id is SUM-<date>, so there is one summary per day.
  async loadSummary() {
    const summaryDate = today();
    if (!this.summary || toDateOnly(this.summary.summaryDate) !== summaryDate) {
      const summaryId = `SUM-${summaryDate}`;
      this.summary =
        (await DashboardSummary.findByPk(summaryId)) ?? DashboardSummary.build({ summaryId, summaryDate });
    }
    return this.summary;
  }

  // Make sure the summary exists in the database before a report is attached to it.
  async ensureSummary() {
    if (!this.summary || this.summary.isNewRecord) {
      await this.loadSummary();
      if (this.summary.isNewRecord) {
        await this.summary.refreshSummary();
      }
    }
    return this.summary;
  }

  requireReport() {
    if (!this.currentReport) {
      throw new Error("Select a report first.");
    }
    return this.currentReport;
  }

  describeSummary() {
    const summary = this.summary;
    const unavailable = summary.dataStatus === "Unavailable";
    return {
      ok: true,
      summaryId: summary.summaryId,
      summaryDate: toDateOnly(summary.summaryDate),
      lastRefreshed: summary.lastRefreshed,
      totalSalesToday: summary.totalSalesToday,
      lowStockCount: summary.lowStockCount,
      nearExpiryCount: summary.nearExpiryCount,
      pendingRestockCount: summary.pendingRestockCount,
      dataStatus: summary.dataStatus,
      message: unavailable
        ? `Some dashboard information is unavailable: ${(summary.unavailableParts ?? []).join(", ")}. Choose refresh to try again.`
        : "Dashboard is up to date.",
    };
  }

  describeReport(message) {
    const aRep = this.currentReport;
    const report = aRep.report;
    const content = aRep.getExportContent(report);
    return {
      ok: true,
      message,
      reportId: aRep.reportId,
      reportType: report.reportType,
      periodStart: toDateOnly(report.periodStart),
      periodEnd: toDateOnly(report.periodEnd),
      reportStatus: report.reportStatus,
      generatedDate: report.generatedDate,
      summary: content.summaryLines,
      columns: content.columns,
      rows: content.rows,
    };
  }
}

module.exports = ReportHandler;
