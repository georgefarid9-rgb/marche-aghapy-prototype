const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class SalesReport extends Model {}

SalesReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    totalSalesAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    numberOfSales: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    // Derived attribute (/averageSaleAmount): calculated, not stored
    averageSaleAmount: {
      type: DataTypes.VIRTUAL,
      get() {
        const count = this.getDataValue("numberOfSales");
        return count > 0 ? this.getDataValue("totalSalesAmount") / count : 0;
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