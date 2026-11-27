const { DataTypes, Op } = require("sequelize");
const sequelize = require("../database");
const ReportBase = require("./ReportBase");
const { checkPeriod, roundMoney, toDateOnly } = require("../utils/reportHelpers");

// Feature 2 - Sales Report (subflow 5b): a summary of sales over the selected period.
//
// Shared attributes and methods come from ReportBase. This class adds:
//   -retrieveReportData() : void
//   +summarizeSales(periodStart : Date, periodEnd : Date) : void
//   sales[0..*] : Sale   (link table sale_sales_reports)
//
// Sales figures are GROSS: Sale.totalAmount does not go down when items are returned
// (Feature 6). Returns and refunds are not subtracted here.

class SalesReport extends ReportBase {
  static get REPORT_TYPE() {
    return "sales";
  }

  static get REPORT_TITLE() {
    return "Sales Report";
  }

  static get EXPORT_COLUMNS() {
    return [
      { key: "saleId", label: "Sale ID" },
      { key: "saleDate", label: "Date" },
      { key: "paymentMethod", label: "Payment" },
      { key: "customerId", label: "Customer" },
      { key: "employeeId", label: "Employee" },
      { key: "unitsSold", label: "Units" },
      { key: "totalAmount", label: "Total (gross, CAD)" },
    ];
  }

  // -retrieveReportData() : void
  // Reads the sales made from periodStart to periodEnd, with their items and products.
  async retrieveReportData() {
    const report = await this.getParentReport();
    this.reportData = await findSalesBetween(toDateOnly(report.periodStart), toDateOnly(report.periodEnd));
    this.filteredResults = null;
  }

  // +summarizeSales(periodStart : Date, periodEnd : Date) : void
  // Sets totalSalesAmount and numberOfSales (/averageSaleAmount is calculated from them).
  //
  // generateReport() calls it with the report's own period. ReportHandler.selectSalesPeriod()
  // calls it with a different period when the Store Owner picks one (subflow 5b, opt):
  // then the report's period and its list of sales change too, and the report is saved again.
  async summarizeSales(periodStart, periodEnd) {
    checkPeriod(periodStart, periodEnd);
    const report = await this.getParentReport();

    const samePeriod =
      periodStart === toDateOnly(report.periodStart) && periodEnd === toDateOnly(report.periodEnd);
    if (!samePeriod) {
      this.checkIsGenerated(report, "given a new period");
    }

    const sales =
      samePeriod && this.reportData ? this.reportData : await findSalesBetween(periodStart, periodEnd);

    this.totalSalesAmount = roundMoney(sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0));
    this.numberOfSales = sales.length;

    if (!samePeriod) {
      report.periodStart = periodStart;
      report.periodEnd = periodEnd;
      report.generatedDate = new Date();
      this.reportData = sales;
      this.filteredResults = null;
      await this.saveReport();
    }
  }

  // Saves the sales[0..*] relationship (called by ReportBase.saveReport()).
  async linkReportData(transaction) {
    await this.setSales(this.reportData, { transaction });
  }

  getSummaryLines() {
    return [
      `Total sales (gross, before returns): $${Number(this.totalSalesAmount).toFixed(2)} CAD`,
      `Number of sales: ${this.numberOfSales}`,
      `Average sale: $${Number(this.averageSaleAmount).toFixed(2)} CAD`,
    ];
  }

  // What the filter compares: sale date, and the products and categories on the sale.
  filterValues(sale) {
    const items = sale.items ?? [];
    return {
      date: toDateOnly(sale.saleDate),
      productIds: items.map((item) => item.productId),
      categories: items.map((item) => item.product?.category),
    };
  }

  toRow(sale) {
    return {
      saleId: sale.saleId,
      saleDate: toDateOnly(sale.saleDate),
      paymentMethod: sale.paymentMethod,
      customerId: sale.customerId ?? "walk-in",
      employeeId: sale.employeeId ?? "",
      unitsSold: (sale.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: Number(sale.totalAmount).toFixed(2),
    };
  }
}

// Sales from periodStart to periodEnd (both days included), oldest first.
function findSalesBetween(periodStart, periodEnd) {
  return sequelize.models.Sale.findAll({
    where: { saleDate: { [Op.between]: [periodStart, periodEnd] } },
    include: [{ association: "items", include: [{ association: "product" }] }],
    order: [
      ["saleDate", "ASC"],
      ["saleId", "ASC"],
    ],
  });
}

SalesReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    // Gross total of the sales in the period.
    totalSalesAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },

    numberOfSales: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0 },
    },

    // Derived attribute (/averageSaleAmount): calculated, not stored
    averageSaleAmount: {
      type: DataTypes.VIRTUAL,
      get() {
        const count = this.getDataValue("numberOfSales");
        return count > 0 ? roundMoney(this.getDataValue("totalSalesAmount") / count) : 0;
      },
    },
  },
  {
    sequelize,
    modelName: "SalesReport",
    tableName: "sales_reports",
    timestamps: false,
  }
);

module.exports = SalesReport;
