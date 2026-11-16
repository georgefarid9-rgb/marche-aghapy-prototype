
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { today, daysBetween } = require("../utils/dates");

class RestockAlert extends Model {
  // Create a new restock alert or refresh an existing pending alert.
  async generateRestockAlert(options = {}) {
    // Resolved alerts are historical records and cannot be reopened.
    if (!this.isNewRecord && this.alertStatus !== "PENDING") {
      throw new Error("Only pending restock alerts can be refreshed.");
    }

    if (typeof this.alertId !== "string" || !this.alertId.trim()) {
      throw new Error("Alert ID is required.");
    }

    if (typeof this.inventoryId !== "string" || !this.inventoryId.trim()) {
      throw new Error("Inventory ID is required.");
    }

    const { InventoryRecord, Product, Supplier } = sequelize.models;

    // Retrieve the latest inventory, product, and supplier information.
    const inventory = await InventoryRecord.findByPk(
      this.inventoryId,
      {
        include: [{
          model: Product,
          as: "product",
          include: [{
            model: Supplier,
            as: "supplier",
          }],
        }],
        transaction: options.transaction,
      }
    );

    if (!inventory || !inventory.product) {
      throw new Error("Inventory record or product was not found.");
    }

    const product = inventory.product;
    const supplier = product.supplier;

    const stockStatus = inventory.evaluateInventoryStatus();
    const expiryStatus = inventory.evaluateExpiryConditions();

    const leadTimeDays =
      Number.isSafeInteger(supplier?.leadTimeDays) &&
      supplier.leadTimeDays >= 0
        ? supplier.leadTimeDays
        : null;

    const daysUntilExpiry = inventory.expiryDate
      ? daysBetween(today(), inventory.expiryDate)
      : null;

    // Evaluate replenishment using stock and expiry conditions.
    const expiryRisk =
      expiryStatus === "EXPIRED" ||
      expiryStatus === "NEAR_EXPIRY" ||
      (
        daysUntilExpiry !== null &&
        leadTimeDays !== null &&
        daysUntilExpiry <= leadTimeDays
      );

    const needsRestock =
      stockStatus === "LOW_STOCK" ||
      stockStatus === "OUT_OF_STOCK" ||
      expiryRisk;

    if (!needsRestock) {
      throw new Error(
        "This product does not currently need restocking."
      );
    }

    // Stock at risk of expiring is excluded from available stock.
    const availableStock = expiryRisk
      ? 0
      : inventory.quantityOnHand;

    // Recalculate whenever this method is called.
    const recommendedQuantity = Math.max(
      1,
      inventory.reorderLevel + 1 - availableStock
    );

    // Build the reorder message using the latest information.
    const reorderInformation = [
      `Reorder ${recommendedQuantity} unit(s) of ${product.productName}.`,
      `Current stock: ${inventory.quantityOnHand}.`,
      `Reorder level: ${inventory.reorderLevel}.`,
      `Stock status: ${stockStatus}.`,
      `Expiry status: ${expiryStatus}.`,
      `Expiry date: ${inventory.expiryDate ?? "Not recorded"}.`,
      `Supplier: ${supplier?.supplierName ?? "Not assigned"}.`,
      `Lead time: ${
        leadTimeDays === null ? "Unknown" : `${leadTimeDays} days`
      }.`,
    ].join(" ");

    // For an existing pending alert, preserve its original alertId.
    // Only the recommendation and message are refreshed.
    this.set({
      reorderInformation,
      recommendedQuantity,
      alertStatus: "PENDING",
    });

    // Create or update within the supplied transaction.
    await this.save(options);
  }
}

RestockAlert.init(
  {
    alertId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reorderInformation: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    alertStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "PENDING",
      validate: {
        isIn: [["PENDING", "RESOLVED"]],
      },
    },

    recommendedQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        isInt: true,
        min: 0,
      },
    },
  },
  {
    sequelize,
    modelName: "RestockAlert",
    tableName: "restock_alerts",
    timestamps: false,
  }
);

module.exports = RestockAlert;
