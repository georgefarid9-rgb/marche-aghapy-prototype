const { DataTypes } = require("sequelize");
const sequelize = require("../database");
const ReportBase = require("./ReportBase");
const { today, daysBetween } = require("../utils/dates");
const { isLowStock, isNearExpiry, toDateOnly, DEFAULT_EXPIRY_WINDOW_DAYS } = require("../utils/reportHelpers");

// Feature 2 - Expiry / Restock Report (subflow 5c): products nearing expiry and products
// that may need to be reordered.
//
// Shared attributes and methods come from ReportBase. This class adds:
//   -retrieveReportData() : void
//   +identifyNearExpiry() : InventoryRecord[]
//   +identifyRestockNeeds() : InventoryRecord[]
//   inventoryRecords[1..*] : InventoryRecord   (link table expiry_restock_report_records)

class ExpiryRestockReport extends ReportBase {
  static get REPORT_TYPE() {
    return "expiryRestock";
  }

  static get REPORT_TITLE() {
    return "Expiry / Restock Report";
  }

  static get EXPORT_COLUMNS() {
    return [
      { key: "inventoryId", label: "Inventory ID" },
      { key: "productName", label: "Product" },
      { key: "category", label: "Category" },
      { key: "quantityOnHand", label: "On hand" },
      { key: "reorderLevel", label: "Reorder level" },
      { key: "expiryDate", label: "Expiry date" },
      { key: "daysToExpiry", label: "Days to expiry" },
      { key: "nearExpiry", label: "Near expiry" },
      { key: "needsRestock", label: "Needs restock" },
    ];
  }

  // -retrieveReportData() : void
  // Reads every InventoryRecord with its Product.
  async retrieveReportData() {
    this.reportData = await sequelize.models.InventoryRecord.findAll({
      include: [{ association: "product" }],
      order: [["inventoryId", "ASC"]],
    });
    this.filteredResults = null;
  }

  // +identifyNearExpiry() : InventoryRecord[]
  // Items that expire within expiryWindowDays (already expired items are included).
  // Updates nearExpiryCount.
  identifyNearExpiry() {
    const nearExpiryItems = (this.reportData ?? []).filter((record) =>
      isNearExpiry(record.expiryDate, this.expiryWindowDays)
    );
    this.nearExpiryCount = nearExpiryItems.length;
    return nearExpiryItems;
  }

  // +identifyRestockNeeds() : InventoryRecord[]
  // Items whose stock is low or out and should be reordered. Updates restockCount.
  identifyRestockNeeds() {
    const restockItems = (this.reportData ?? []).filter(isLowStock);
    this.restockCount = restockItems.length;
    return restockItems;
  }

  // Saves the inventoryRecords[1..*] relationship (called by ReportBase.saveReport()).
  async linkReportData(transaction) {
    await this.setInventoryRecords(this.reportData, { transaction });
  }

  getSummaryLines() {
    const records = this.reportData ?? [];
    const near = (
      this.nearExpiryItems ?? records.filter((record) => isNearExpiry(record.expiryDate, this.expiryWindowDays))
    ).map(productName);
    const restock = (this.restockItems ?? records.filter(isLowStock)).map(productName);
    return [
      `Expiry window: ${this.expiryWindowDays} day(s)`,
      `Near expiry: ${this.nearExpiryCount}${near.length ? ` (${near.join(", ")})` : ""}`,
      `Need restocking: ${this.restockCount}${restock.length ? ` (${restock.join(", ")})` : ""}`,
    ];
  }

  // What the filter compares: expiry date, product and category.
  filterValues(record) {
    return {
      date: toDateOnly(record.expiryDate),
      productIds: [record.productId],
      categories: [record.product?.category],
    };
  }

  toRow(record) {
    return {
      inventoryId: record.inventoryId,
      productName: productName(record),
      category: record.product?.category ?? "",
      quantityOnHand: record.quantityOnHand,
      reorderLevel: record.reorderLevel,
      expiryDate: record.expiryDate ?? "",
      daysToExpiry: record.expiryDate ? daysBetween(today(), toDateOnly(record.expiryDate)) : "",
      nearExpiry: isNearExpiry(record.expiryDate, this.expiryWindowDays) ? "Yes" : "No",
      needsRestock: isLowStock(record) ? "Yes" : "No",
    };
  }
}

function productName(record) {
  return record.product?.productName ?? record.productId;
}

ExpiryRestockReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    // {> 0} in the class diagram
    expiryWindowDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DEFAULT_EXPIRY_WINDOW_DAYS,
      validate: {
        isInt: true,
        min: { args: [1], msg: "expiryWindowDays must be greater than 0." },
      },
    },

    nearExpiryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0 },
    },

    restockCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0 },
    },
  },
  {
    sequelize,
    modelName: "ExpiryRestockReport",
    tableName: "expiry_restock_reports",
    timestamps: false,
  }
);

module.exports = ExpiryRestockReport;
