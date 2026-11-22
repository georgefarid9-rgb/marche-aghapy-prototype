const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { REPORT_TYPES, DEFAULT_EXPIRY_WINDOW_DAYS, isLowStock, isNearExpiry, roundMoney } = require("../utils/reportHelpers");

// Feature 2 - the dashboard the Store Owner sees first (UC 02, steps 1-3).
//
//   +refreshSummary() : void
//   +flagUnavailableData() : void
//   +getAvailableReportTypes() : String[]
//   reports[1..*] : Report

class DashboardSummary extends Model {
  // +refreshSummary() : void
  // Recalculates the derived counts from the current data and saves the summary.
  // If one source cannot be read, the rest is still shown and the data is flagged as
  // unavailable (alternate flow 2a). The parts that failed are listed in this.unavailableParts.
  async refreshSummary() {
    const { Sale, InventoryRecord, RestockAlert } = sequelize.models;
    this.unavailableParts = [];

    // /totalSalesToday: gross total of the sales made on summaryDate.
    try {
      const total = await Sale.sum("totalAmount", { where: { saleDate: this.summaryDate } });
      this.totalSalesToday = roundMoney(Number(total) || 0);
    } catch (error) {
      this.unavailableParts.push(`sales (${error.message})`);
    }

    // /lowStockCount and /nearExpiryCount: from the inventory records.
    try {
      const records = await InventoryRecord.findAll();
      this.lowStockCount = records.filter(isLowStock).length;
      this.nearExpiryCount = records.filter((record) =>
        isNearExpiry(record.expiryDate, DEFAULT_EXPIRY_WINDOW_DAYS)
      ).length;
    } catch (error) {
      this.unavailableParts.push(`inventory (${error.message})`);
    }

    // /pendingRestockCount: restock alerts that have not been resolved yet (Feature 1).
    try {
      this.pendingRestockCount = await RestockAlert.count({ where: { alertStatus: "PENDING" } });
    } catch (error) {
      this.unavailableParts.push(`restock alerts (${error.message})`);
    }

    this.lastRefreshed = new Date();
    this.dataStatus = "Available";
    if (this.unavailableParts.length > 0) {
      this.flagUnavailableData();
    }

    await this.save();
  }

  // +flagUnavailableData() : void
  // Marks the summary as incomplete. refreshSummary() saves it.
  flagUnavailableData() {
    this.dataStatus = "Unavailable";
  }

  // +getAvailableReportTypes() : String[]
  getAvailableReportTypes() {
    return [...REPORT_TYPES];
  }
}

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

    // The four counts below are derived attributes (/) calculated by refreshSummary().
    // They are stored so the dashboard can show the last values without recalculating.
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
      validate: { isIn: [["Available", "Unavailable"]] },
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
