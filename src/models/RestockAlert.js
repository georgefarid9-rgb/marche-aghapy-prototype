
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { today, daysBetween } = require("../utils/dates");

class RestockAlert extends Model {
  // Generate an alert when inventory requires replenishment.
  async generateRestockAlert() {
    if (!this.isNewRecord) {
      throw new Error("This restock alert has already been saved.");
    }

    if (typeof this.alertId !== "string" || !this.alertId.trim()) {
      throw new Error("Alert ID is required.");
    }

    if (typeof this.inventoryId !== "string" || !this.inventoryId.trim()) {
      throw new Error("Inventory ID is required.");
    }

    // Load the inventory record, its product, and its supplier.
    const { InventoryRecord, Product, Supplier } = sequelize.models;

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
      }
    );

    if (!inventory || !inventory.product) {
      throw new Error("Inventory record or product was not found.");
    }

    const product = inventory.product;
    const supplier = product.supplier;

    const stockStatus = inventory.evaluateInventoryStatus();
    const expiryStatus = inventory.evaluateExpiryConditions();

    // Use the supplier's lead time if one is available.
    const leadTimeDays =
      Number.isSafeInteger(supplier?.leadTimeDays) &&
      supplier.leadTimeDays >= 0
        ? supplier.leadTimeDays
        : null;

    const daysUntilExpiry = inventory.expiryDate
      ? daysBetween(today(), inventory.expiryDate)
      : null;

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
      throw new Error("This product does not currently need restocking.");
    }

    // Aim for one unit above the reorder threshold.
    // Stock at risk of expiring is not counted as available.
    const availableStock = expiryRisk
      ? 0
      : inventory.quantityOnHand;

    const recommendedQuantity = Math.max(
      1,
      inventory.reorderLevel + 1 - availableStock
    );

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

    this.set({
      reorderInformation,
      recommendedQuantity,
      alertStatus: "PENDING",
    });

    await this.save();
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
