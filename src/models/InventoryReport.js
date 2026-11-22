const { DataTypes } = require("sequelize");
const sequelize = require("../database");
const ReportBase = require("./ReportBase");
const { isLowStock, toDateOnly } = require("../utils/reportHelpers");

// Feature 2 - Inventory Report (subflow 5a): current stock levels and low-stock products.
//
// Shared attributes and methods (generateReport, applyFilter, exportReport, closeReport, ...)
// come from ReportBase. This class adds:
//   -retrieveReportData() : void
//   +identifyLowStock() : InventoryRecord[]
//   inventoryRecords[1..*] : InventoryRecord   (link table inventory_report_records)
//
// The inventory has no history, so the report shows stock as it is when the report is
// generated. The period (periodStart to periodEnd) labels the report.

class InventoryReport extends ReportBase {
  static get REPORT_TYPE() {
    return "inventory";
  }

  static get REPORT_TITLE() {
    return "Inventory Report";
  }

  static get EXPORT_COLUMNS() {
    return [
      { key: "inventoryId", label: "Inventory ID" },
      { key: "productId", label: "Product ID" },
      { key: "productName", label: "Product" },
      { key: "category", label: "Category" },
      { key: "quantityOnHand", label: "On hand" },
      { key: "reorderLevel", label: "Reorder level" },
      { key: "inventoryStatus", label: "Stock status" },
      { key: "expiryDate", label: "Expiry date" },
    ];
  }

  // -retrieveReportData() : void
  // Reads every InventoryRecord with its Product, and the totals for the report.
  async retrieveReportData() {
    this.reportData = await sequelize.models.InventoryRecord.findAll({
      include: [{ association: "product" }],
      order: [["inventoryId", "ASC"]],
    });
    this.filteredResults = null;

    this.totalProducts = this.reportData.length;
    this.totalQuantityOnHand = this.reportData.reduce((sum, record) => sum + record.quantityOnHand, 0);
  }

  // +identifyLowStock() : InventoryRecord[]
  // Products whose stock is low or out (Feature 1 stock status). Updates /lowStockCount.
  identifyLowStock() {
    const lowStockItems = (this.reportData ?? []).filter(isLowStock);
    this.lowStockCount = lowStockItems.length;
    return lowStockItems;
  }

  // Saves the inventoryRecords[1..*] relationship (called by ReportBase.saveReport()).
  async linkReportData(transaction) {
    await this.setInventoryRecords(this.reportData, { transaction });
  }

  getSummaryLines() {
    const lowStockItems = this.lowStockItems ?? (this.reportData ?? []).filter(isLowStock);
    const lowStockNames = lowStockItems.map(productName);
    return [
      `Total products: ${this.totalProducts}`,
      `Total quantity on hand: ${this.totalQuantityOnHand}`,
      `Low-stock products: ${this.lowStockCount}${lowStockNames.length ? ` (${lowStockNames.join(", ")})` : ""}`,
    ];
  }

  // What the filter compares: last stock update date, product and category.
  filterValues(record) {
    return {
      date: toDateOnly(record.lastUpdated),
      productIds: [record.productId],
      categories: [record.product?.category],
    };
  }

  toRow(record) {
    return {
      inventoryId: record.inventoryId,
      productId: record.productId,
      productName: productName(record),
      category: record.product?.category ?? "",
      quantityOnHand: record.quantityOnHand,
      reorderLevel: record.reorderLevel,
      inventoryStatus: record.evaluateInventoryStatus(),
      expiryDate: record.expiryDate ?? "",
    };
  }
}

function productName(record) {
  return record.product?.productName ?? record.productId;
}

InventoryReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    totalProducts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0 },
    },

    totalQuantityOnHand: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0 },
    },

    // Derived attribute (/lowStockCount): calculated by identifyLowStock() when the report is
    // generated, and stored so the report keeps the count it had on that day.
    lowStockCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0 },
    },
  },
  {
    sequelize,
    modelName: "InventoryReport",
    tableName: "inventory_reports",
    timestamps: false,
  }
);

module.exports = InventoryReport;
