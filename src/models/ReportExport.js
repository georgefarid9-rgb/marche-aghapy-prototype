const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class ReportExport extends Model {}

ReportExport.init(
  {
    exportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reportId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    exportDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    exportFormat: {
      type: DataTypes.STRING, // "PDF", "Excel" or "CSV"
      allowNull: false,
    },

    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "ReportExport",
    tableName: "report_exports",
    timestamps: false,
  }
);

module.exports = ReportExport;