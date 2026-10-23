const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class DashboardSummary extends Model {}

DashboardSummary.init(
  {
    summaryId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    summaryDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    lastRefreshed: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    totalSalesToday: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    lowStockCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    nearExpiryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    pendingRestockCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    dataStatus: {
      type: DataTypes.STRING, // "Available" or "Unavailable"
      allowNull: false,
      defaultValue: "Available",
    },
  },
  {
    sequelize,
    modelName: "DashboardSummary",
    tableName: "dashboard_summaries",
    timestamps: false,
  }
);

module.exports = DashboardSummary;