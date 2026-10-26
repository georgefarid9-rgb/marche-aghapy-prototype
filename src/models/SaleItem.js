const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Shared sales classes (used by Feature 6 - Customer Support).
// One line of a Sale: a product, how many were sold, and the price each.

class SaleItem extends Model {}

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
  },
  {
    sequelize,
    modelName: "SaleItem",
    tableName: "sale_items",
    timestamps: false,
  }
);

module.exports = SaleItem;
