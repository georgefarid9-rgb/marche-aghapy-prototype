
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { today, daysBetween } = require("../utils/dates");

// Use the same expiry window as the existing reporting feature.
const EXPIRY_WINDOW_DAYS = 7;

function validateQuantity(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
}

function validateExpiryDate(value) {
  if (value == null) return;

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error("Expiry date must use YYYY-MM-DD format.");
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Expiry date is invalid.");
  }
}

function parseInventoryData(data) {
  if (typeof data !== "string") {
    throw new Error("Inventory data must be a JSON string.");
  }

  let details;

  try {
    details = JSON.parse(data);
  } catch {
    throw new Error("Inventory data is not valid JSON.");
  }

  if (!details || typeof details !== "object" || Array.isArray(details)) {
    throw new Error("Inventory data must contain an object.");
  }

  return details;
}

function calculateStockStatus(quantity, reorderLevel) {
  validateQuantity(quantity, "Quantity");
  validateQuantity(reorderLevel, "Reorder level");

  if (quantity === 0) return "OUT_OF_STOCK";
  if (quantity <= reorderLevel) return "LOW_STOCK";

  return "IN_STOCK";
}

class InventoryRecord extends Model {
  // Update the quantity and its corresponding stock status.
  async updateQuantity(qty, options = {}) {
    validateQuantity(qty, "Quantity");

    await this.update({
      quantityOnHand: qty,
      inventoryStatus: calculateStockStatus(qty, this.reorderLevel),
      lastUpdated: new Date(),
    }, options);
  }

  // Save an expiry date previously assigned to the record.
  async updateExpiryInformation(options = {}) {
    validateExpiryDate(this.expiryDate);

    await this.update({
      expiryDate: this.expiryDate,
      lastUpdated: new Date(),
    }, options);
  }

  // Determine the product's current stock condition.
  evaluateInventoryStatus() {
    return calculateStockStatus(
      this.quantityOnHand,
      this.reorderLevel
    );
  }

  // Determine whether a product is expired or nearing expiry.
  evaluateExpiryConditions() {
    if (!this.expiryDate) {
      return "NO_EXPIRY_DATE";
    }

    validateExpiryDate(this.expiryDate);

    const remainingDays = daysBetween(today(), this.expiryDate);

    if (remainingDays < 0) return "EXPIRED";
    if (remainingDays <= EXPIRY_WINDOW_DAYS) return "NEAR_EXPIRY";

    return "NOT_EXPIRING_SOON";
  }

  // Return the current inventory record.
  getCurrentProductAndStockData() {
    return this;
  }

  // Create and save a new inventory record.
  async createInventoryRecord(data, options = {}) {
    if (!this.isNewRecord) {
      throw new Error("This inventory record already exists.");
    }

    const details = parseInventoryData(data);

    const inventoryId = details.inventoryId ?? this.inventoryId;
    const productId = details.productId ?? this.productId;
    const quantity = details.quantityOnHand ?? this.quantityOnHand;
    const reorderLevel = details.reorderLevel ?? this.reorderLevel;
    const expiryDate = details.expiryDate ?? this.expiryDate ?? null;

    if (typeof inventoryId !== "string" || !inventoryId.trim()) {
      throw new Error("Inventory ID is required.");
    }

    if (typeof productId !== "string" || !productId.trim()) {
      throw new Error("Product ID is required.");
    }

    validateQuantity(quantity, "Quantity");
    validateQuantity(reorderLevel, "Reorder level");
    validateExpiryDate(expiryDate);

    this.set({
      inventoryId,
      productId,
      quantityOnHand: quantity,
      reorderLevel,
      expiryDate,
      inventoryStatus: calculateStockStatus(quantity, reorderLevel),
      lastUpdated: new Date(),
    });

    await this.save(options);
  }

  // Evaluate stock and expiry conditions together.
  evaluateStockAndExpiry() {
    const stockStatus = this.evaluateInventoryStatus();
    const expiryStatus = this.evaluateExpiryConditions();

    return `${stockStatus} | ${expiryStatus}`;
  }

  // Update the selected inventory fields.
  async updateInventoryInformation(data, options = {}) {
    if (this.isNewRecord) {
      throw new Error("The inventory record must be saved first.");
    }

    const details = parseInventoryData(data);

    if (
      details.inventoryId !== undefined &&
      details.inventoryId !== this.inventoryId
    ) {
      throw new Error("Inventory ID cannot be changed.");
    }

    if (
      details.productId !== undefined &&
      details.productId !== this.productId
    ) {
      throw new Error("Product ID cannot be changed.");
    }

    const changes = {};

    for (const field of [
      "quantityOnHand",
      "reorderLevel",
      "expiryDate",
    ]) {
      if (Object.prototype.hasOwnProperty.call(details, field)) {
        changes[field] = details[field];
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error("No inventory changes were provided.");
    }

    const quantity = changes.quantityOnHand ?? this.quantityOnHand;
    const reorderLevel = changes.reorderLevel ?? this.reorderLevel;

    validateQuantity(quantity, "Quantity");
    validateQuantity(reorderLevel, "Reorder level");

    if (Object.prototype.hasOwnProperty.call(changes, "expiryDate")) {
      validateExpiryDate(changes.expiryDate);
    }

    await this.update({
      ...changes,
      inventoryStatus: calculateStockStatus(quantity, reorderLevel),
      lastUpdated: new Date(),
    }, options);
  }
}

InventoryRecord.init(
  {
    inventoryId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    // Required to link the record to its Product.
    productId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    quantityOnHand: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        validQuantity(value) {
          validateQuantity(value, "Quantity");
        },
      },
    },

    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      validate: {
        validExpiry(value) {
          validateExpiryDate(value);
        },
      },
    },

    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    reorderLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        validReorderLevel(value) {
          validateQuantity(value, "Reorder level");
        },
      },
    },

    inventoryStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "OUT_OF_STOCK",
      validate: {
        isIn: [["OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"]],
      },
    },
  },
  {
    sequelize,
    modelName: "InventoryRecord",
    tableName: "inventory_records",
    timestamps: false,

    hooks: {
      beforeValidate(record) {
        if (
          Number.isSafeInteger(record.quantityOnHand) &&
          Number.isSafeInteger(record.reorderLevel) &&
          record.quantityOnHand >= 0 &&
          record.reorderLevel >= 0
        ) {
          record.inventoryStatus = record.evaluateInventoryStatus();
        }
      },
    },
  }
);

module.exports = InventoryRecord;
