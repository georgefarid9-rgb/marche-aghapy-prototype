const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Report extends Model {}

Report.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reportType: {
      type: DataTypes.STRING, // "inventory", "sales" or "expiry-restock"
      allowNull: false,
    },

    generatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    reportStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Generated",
    },

    summaryId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: { model: "dashboard_summaries", key: "summaryId" },
    },
  },
  {
    sequelize,
    modelName: "Report",
    tableName: "reports",
    timestamps: false,
  }
);

module.exports = Report;