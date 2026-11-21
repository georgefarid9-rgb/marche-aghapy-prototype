
const { Model, DataTypes, Op } = require("sequelize");
const sequelize = require("../database");

class FinancialReport extends Model {
  async compile() {
    const transactions = await this.retrieveReportData();

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const transaction of transactions) {
      const amount = Number(transaction.amount);

      if (transaction.transactionType === "Revenue") {
        totalRevenue += amount;
      } else if (transaction.transactionType === "Expense") {
        totalExpenses += amount;
      }
    }

    this.totalRevenue = totalRevenue;
    this.totalExpenses = totalExpenses;
    this.netProfit = totalRevenue - totalExpenses;

    return this;
  }

  async calculateTotals() {
    await this.compile();

    return {
      totalRevenue: Number(this.totalRevenue),
      totalExpenses: Number(this.totalExpenses),
      netProfit: Number(this.netProfit),
    };
  }

  async retrieveReportData() {
    const Transaction = require("./Transaction");

    if (!this.ledgerId) {
      throw new Error("A ledgerId is required to retrieve report data.");
    }

    if (!this.periodStart || !this.periodEnd) {
      throw new Error("A report start date and end date are required.");
    }

    if (new Date(this.periodStart) > new Date(this.periodEnd)) {
      throw new Error("The report start date cannot be after its end date.");
    }

    return Transaction.findAll({
      where: {
        ledgerId: this.ledgerId,
        date: {
          [Op.gte]: this.periodStart,
          [Op.lte]: this.periodEnd,
        },
      },
      order: [["date", "ASC"]],
    });
  }

  async generateReport() {
    await this.compile();
    await this.save();

    const Report = require("./Report");
    const report = await Report.findByPk(this.reportId);

    if (report) {
      report.generatedDate = new Date();
      report.reportStatus = "Generated";
      await report.save();
    }

    return this;
  }

  async applyFilter(criteria = {}) {
    const Transaction = require("./Transaction");

    const filters = {
      ledgerId: this.ledgerId,
      date: {
        [Op.gte]: criteria.startDate || this.periodStart,
        [Op.lte]: criteria.endDate || this.periodEnd,
      },
    };

    if (criteria.category) {
      filters.category = criteria.category;
    }

    return Transaction.findAll({
      where: filters,
      order: [["date", "ASC"]],
    });
  }

  async hasData() {
    const transactions = await this.retrieveReportData();
    return transactions.length > 0;
  }

  async exportReport(format = "CSV") {
    const ReportExport = require("./ReportExport");

    const normalizedFormat = String(format).toUpperCase();

    const extensions = {
      CSV: "csv",
      EXCEL: "xlsx",
      PDF: "pdf",
    };

    if (!extensions[normalizedFormat]) {
      throw new Error("Export format must be CSV, Excel, or PDF.");
    }

    const exportId = `EXP-${this.reportId}-${Date.now()}`;

    return ReportExport.create({
      exportId,
      reportId: this.reportId,
      exportDate: new Date(),
      exportFormat: normalizedFormat,
      fileName: `${this.reportId}.${extensions[normalizedFormat]}`,
    });
  }

  async closeReport() {
    const Report = require("./Report");
    const report = await Report.findByPk(this.reportId);

    if (!report) {
      throw new Error("The parent report could not be found.");
    }

    report.reportStatus = "Closed";
    await report.save();

    return report;
  }
}

FinancialReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: {
        model: "reports",
        key: "reportId",
      },
    },

    ledgerId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "ledgers",
        key: "ledgerId",
      },
    },

    reviewedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "store_owners",
        key: "ownerId",
      },
    },

    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    totalRevenue: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    totalExpenses: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    netProfit: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "FinancialReport",
    tableName: "financial_reports",
    timestamps: false,
  }
);

module.exports = FinancialReport;
