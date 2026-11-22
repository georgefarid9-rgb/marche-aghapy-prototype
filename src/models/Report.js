const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { REPORT_TYPES, REPORT_STATUSES, isValidDate, toDateOnly } = require("../utils/reportHelpers");

// The shared "reports" table: the attributes every report has.
// Each report also has one row in the table of its own type, with the same reportId:
//   inventory     -> InventoryReport      (inventory_reports)
//   sales         -> SalesReport          (sales_reports)
//   expiryRestock -> ExpiryRestockReport  (expiry_restock_reports)
//   financial     -> FinancialReport      (financial_reports, Feature 4)
//
// The shared methods of the abstract Report are in ReportBase.js.

// How to reach the row of each report type (associations in models/index.js).
const DETAILS_GETTERS = {
  inventory: "getInventoryDetails",
  sales: "getSalesDetails",
  expiryRestock: "getExpiryRestockDetails",
  financial: "getFinancialDetails",
};

class Report extends Model {
  // The InventoryReport, SalesReport, ExpiryRestockReport or FinancialReport for this report.
  async getDetails() {
    const getter = DETAILS_GETTERS[this.reportType];
    const details = getter ? await this[getter]() : null;
    if (!details) {
      throw new Error(`Report ${this.reportId} (${this.reportType}) has no matching ${this.reportType} report row.`);
    }
    details.report = this;
    return details;
  }

  // +generateReport() : void
  // Report is abstract, so the work is done by the report of the right type
  // (InventoryReport, SalesReport or ExpiryRestockReport, see ReportBase.generateReport()).
  async generateReport() {
    const details = await this.getDetails();
    await details.generateReport();
  }
}

Report.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reportType: {
      type: DataTypes.STRING, // "inventory", "sales", "expiryRestock" (Feature 2) or "financial" (Feature 4)
      allowNull: false,
      validate: {
        isIn: {
          args: [[...REPORT_TYPES, "financial"]],
          msg: `reportType must be one of: ${[...REPORT_TYPES, "financial"].join(", ")}.`,
        },
      },
    },

    // [0..1]: set by generateReport(). The default is kept so rows created by older code
    // still get a date.
    generatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },

    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // {generated, noData, closed} in the class diagram
    reportStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "generated",
    },

    // dashboardSummary[1..1]: the DashboardSummary this report belongs to.
    summaryId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: { model: "dashboard_summaries", key: "summaryId" },
    },
  },
  {
    sequelize,
    modelName: "Report",
    tableName: "reports",
    timestamps: false,

    validate: {
      // Class diagram rules for the Feature 2 reports. FinancialReport (Feature 4) keeps its
      // own rules, so financial rows are not checked here.
      feature2ReportRules() {
        if (!REPORT_TYPES.includes(this.reportType)) {
          return;
        }
        const start = toDateOnly(this.periodStart);
        const end = toDateOnly(this.periodEnd);
        if (!isValidDate(start) || !isValidDate(end)) {
          throw new Error("A report needs a valid periodStart and periodEnd (YYYY-MM-DD).");
        }
        if (start > end) {
          throw new Error("periodStart must be on or before periodEnd.");
        }
        if (!REPORT_STATUSES.includes(this.reportStatus)) {
          throw new Error(`reportStatus must be one of: ${REPORT_STATUSES.join(", ")}.`);
        }
        if (!this.summaryId) {
          throw new Error("A report must belong to a DashboardSummary (summaryId).");
        }
      },
    },
  }
);

module.exports = Report;
