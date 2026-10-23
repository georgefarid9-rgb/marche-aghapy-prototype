const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class InventoryReport extends Model {}

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
    },

    totalQuantityOnHand: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    lowStockCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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