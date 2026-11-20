const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { guardMethods } = require("../utils/supportGuard");

// Shared sales classes (used by Feature 6 - Customer Support).
// One line of a Sale: a product, how many were sold, and the price each.

class SaleItem extends Model {
  // How many units of this line can still be returned.
  get returnableQuantity() {
    return this.quantity - this.returnedQuantity;
  }

  // Record that `quantity` units of this line were returned (Feature 6 refund).
  // Returned units are NOT put back in stock: only returnedQuantity goes up.
  // Pass { transaction } to run the save inside a database transaction.
  async recordReturn(quantity, options = {}) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Returned quantity must be a whole number of at least 1.");
    }
    if (quantity > this.returnableQuantity) {
      throw new Error(
        `Sale item ${this.saleItemId}: only ${this.returnableQuantity} unit(s) can still be returned.`
      );
    }
    this.returnedQuantity += quantity;
    await this.save({ transaction: options.transaction });
  }
}

SaleItem.init(
  {
    // Surrogate key so each line of a sale can be removed individually.
    saleItemId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },

    unitPrice: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      validate: { min: 0 },
    },

    // Units of this line already returned by customers (Feature 6).
    returnedQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
  },
  {
    sequelize,
    modelName: "SaleItem",
    tableName: "sale_items",
    timestamps: false,
  }
);

guardMethods(SaleItem, {
  recordReturn: { action: "recording the returned items" },
});

module.exports = SaleItem;
