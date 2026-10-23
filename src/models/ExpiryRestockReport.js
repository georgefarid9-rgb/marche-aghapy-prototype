const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class ExpiryRestockReport extends Model {}

ExpiryRestockReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    expiryWindowDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 7,
    },

    nearExpiryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    restockCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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