const { Model, ValidationError } = require("sequelize");
const sequelize = require("../database");
const generateId = require("../utils/generateId");
const { checkPeriod, toDateOnly, EXPORT_FORMATS } = require("../utils/reportHelpers");

// Feature 2 - Dashboard and Reports (Prototype 2)
//
// ReportBase is the abstract Report from the class diagram (CRC card 2.2, "Type: Abstract").
// InventoryReport, SalesReport and ExpiryRestockReport extend it, so they all inherit:
//
//   +generateReport() : void                       (contract C2-01 / spec MS2-01)
//   -retrieveReportData() : void                   (each report type overrides it)
//   +applyFilter(filter : ReportFilter) : void
//   -hasData() : Boolean
//   +exportReport(format : String) : ReportExport
//   +closeReport() : void
//
// Where the data lives: the attributes every report has (reportId, reportType,
// generatedDate, periodStart, periodEnd, reportStatus, summaryId) are stored once in the
// "reports" table (the Report model). Each report type keeps its own attributes in its own
// table (inventory_reports, sales_reports, expiry_restock_reports) with the same reportId.
// In the code, this.report is that shared Report row.
//
// ReportBase itself has no table: it only holds the shared methods.

const SALES = "sales";
const INVENTORY = "inventory";
const EXPIRY_RESTOCK = "expiryRestock";

class ReportBase extends Model {
  constructor(...args) {
    // Report is abstract: only an InventoryReport, SalesReport or ExpiryRestockReport
    // can be created (Misc. Notes of spec MS2-01).
    if (new.target === ReportBase) {
      throw new Error(
        "Report is abstract. Create an InventoryReport, SalesReport or ExpiryRestockReport instead."
      );
    }
    super(...args);
  }

  // The shared Report row (reportType, periodStart, periodEnd, reportStatus, ...).
  // ReportHandler sets this.report when it creates a new report; otherwise it is loaded.
  async getParentReport() {
    if (!this.report) {
      this.report = await this.getReport();
    }
    if (!this.report) {
      throw new Error(`Report ${this.reportId} has no matching row in the reports table.`);
    }
    return this.report;
  }

  // +generateReport() : void
  // Contract C2-01 / spec MS2-01. Follows the algorithm in the spec step by step.
  async generateReport() {
    const report = await this.getParentReport();

    // Pre-conditions
    if (report.reportType !== this.constructor.REPORT_TYPE) {
      throw new Error(
        `This is a ${this.constructor.name}, so its reportType must be "${this.constructor.REPORT_TYPE}" (it is "${report.reportType}").`
      );
    }
    checkPeriod(toDateOnly(report.periodStart), toDateOnly(report.periodEnd));
    if (report.reportStatus === "closed") {
      throw new Error("A closed report cannot be generated again. Select a new report instead.");
    }

    await this.retrieveReportData();
    const dataExists = this.hasData();

    if (dataExists === false) {
      // Alternate flow 6a: nothing is processed and nothing is saved.
      // generatedDate keeps its old value; ReportHandler reads reportStatus.
      report.reportStatus = "noData";
      return;
    }

    if (report.reportType === INVENTORY) {
      this.lowStockItems = this.identifyLowStock();
    } else if (report.reportType === EXPIRY_RESTOCK) {
      this.nearExpiryItems = this.identifyNearExpiry();
      this.restockItems = this.identifyRestockNeeds();
    } else if (report.reportType === SALES) {
      await this.summarizeSales(toDateOnly(report.periodStart), toDateOnly(report.periodEnd));
    }

    report.generatedDate = new Date();
    report.reportStatus = "generated";

    // "the time of generation is saved" (contract C2-01)
    await this.saveReport();
  }

  // -retrieveReportData() : void
  // Each report type overrides this and puts the records it read in this.reportData.
  async retrieveReportData() {
    throw new Error(`${this.constructor.name} must define retrieveReportData().`);
  }

  // -hasData() : Boolean
  // True when retrieveReportData() found at least one record.
  hasData() {
    return Array.isArray(this.reportData) && this.reportData.length > 0;
  }

  // +applyFilter(filter : ReportFilter) : void
  // Subflow 8a. Narrows the report to the records that match the filter and saves the filter.
  // The matching records are left in this.filteredResults for ReportHandler.
  async applyFilter(filter) {
    const report = await this.getParentReport();
    this.checkIsGenerated(report, "filtered");

    if (!(filter instanceof sequelize.models.ReportFilter)) {
      throw new Error("applyFilter() needs a ReportFilter.");
    }
    if (!filter.validateCriteria()) {
      throw new Error(`The filter criteria are invalid or incomplete: ${filter.criteriaProblem()}`);
    }

    if (!this.reportData) {
      await this.retrieveReportData();
    }

    this.filteredResults = this.reportData.filter((item) => matchesFilter(this.filterValues(item), filter));

    filter.reportId = this.reportId;
    await filter.save();
  }

  // +exportReport(format : String) : ReportExport
  // Creates the ReportExport, which writes the file (createExportFile), and returns it.
  // If a filter was applied, the export shows the filtered records.
  async exportReport(format) {
    const report = await this.getParentReport();
    this.checkIsGenerated(report, "exported");

    const exportFormat = String(format ?? "").trim().toUpperCase();
    if (!EXPORT_FORMATS.includes(exportFormat)) {
      throw new Error(`Export format must be ${EXPORT_FORMATS.join(" or ")}.`);
    }

    const anExport = sequelize.models.ReportExport.build({
      exportId: generateId("EXP"),
      reportId: this.reportId,
      exportDate: new Date(),
      exportFormat,
    });

    // What goes in the file. Not stored in the database.
    anExport.content = this.getExportContent(report);

    anExport.createExportFile();
    try {
      await anExport.save();
    } catch (error) {
      anExport.removeExportFile(); // do not leave a file without its database record
      throw error;
    }
    return anExport;
  }

  // +closeReport() : void
  // Alternate flow 10b (and the end of the normal flow): reportStatus becomes "closed".
  async closeReport() {
    const report = await this.getParentReport();
    if (report.reportStatus === "closed") {
      throw new Error("This report is already closed.");
    }
    this.checkIsGenerated(report, "closed");

    report.reportStatus = "closed";
    await report.save();
  }

  // ----- Helpers used by the methods above -----

  checkIsGenerated(report, action) {
    if (report.reportStatus !== "generated") {
      throw new Error(`Only a generated report can be ${action} (this report is "${report.reportStatus}").`);
    }
  }

  // The records the Store Owner is looking at: the filtered ones if a filter was applied.
  getVisibleItems() {
    return this.filteredResults ?? this.reportData ?? [];
  }

  // Title, summary lines, columns and rows, used for the screen and for exported files.
  getExportContent(report) {
    const items = this.getVisibleItems();
    const summaryLines = [
      `Report ID: ${this.reportId}`,
      `Period: ${toDateOnly(report.periodStart)} to ${toDateOnly(report.periodEnd)}`,
      `Generated: ${report.generatedDate ? new Date(report.generatedDate).toISOString() : "not yet"}`,
      ...this.getSummaryLines(),
    ];
    if (this.filteredResults) {
      summaryLines.push(`Filter applied: showing ${items.length} of ${this.reportData.length} record(s).`);
    }
    return {
      title: `Marché Aghapy - ${this.constructor.REPORT_TITLE}`,
      summaryLines,
      columns: this.constructor.EXPORT_COLUMNS,
      rows: items.map((item) => this.toRow(item)),
    };
  }

  // Save the shared Report row, this report's own row and its links in one transaction,
  // so either everything is saved or nothing is.
  async saveReport() {
    const report = await this.getParentReport();
    try {
      await sequelize.transaction(async (transaction) => {
        await report.save({ transaction });
        await this.save({ transaction });
        await this.linkReportData(transaction);
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`The report could not be saved: ${error.errors.map((e) => e.message).join("; ")}`);
      }
      throw error;
    }
  }
}

// Does one record match the filter? Empty criteria are ignored.
// values: { date: "YYYY-MM-DD" or null, productIds: [String], categories: [String] }
function matchesFilter(values, filter) {
  if (filter.startDate && (!values.date || values.date < filter.startDate)) {
    return false;
  }
  if (filter.endDate && (!values.date || values.date > filter.endDate)) {
    return false;
  }
  if (filter.productId && !values.productIds.includes(filter.productId.trim())) {
    return false;
  }
  if (filter.category) {
    const wanted = filter.category.trim().toLowerCase();
    if (!values.categories.some((category) => category && category.toLowerCase() === wanted)) {
      return false;
    }
  }
  return true;
}

module.exports = ReportBase;
