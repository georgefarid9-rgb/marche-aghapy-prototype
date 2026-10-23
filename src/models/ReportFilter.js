const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class ReportFilter extends Model {}

ReportFilter.init(
  {
    filterId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reportId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    productId: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "ReportFilter",
    tableName: "report_filters",
    timestamps: false,
  }
);

module.exports = ReportFilter;