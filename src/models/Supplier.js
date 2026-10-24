const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Supplier is used by Feature 1 (Supplier 1 ---- 0..* Product) and
// extended by Feature 3 (Supplier is a kind of BusinessPartner and
// accumulates PerformanceRecords).

class Supplier extends Model {
  // Feature 3: score the supplier from its delivery history.
  // Returns the average fill rate (0-100) across all performance records,
  // or null if the supplier has no records yet.
  async evaluatePerformance() {
    const records = await this.getPerformanceRecords();
    if (records.length === 0) {
      return null;
    }
    const total = records.reduce((sum, r) => sum + r.calculateFillRate(), 0);
    return Math.round((total / records.length) * 10) / 10;
  }
}

Supplier.init(
  {
    // ----- Feature 1 -----
    supplierId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    supplierName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    leadTimeDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // ----- Feature 3 -----
    contactInformation: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    paymentTerms: {
      type: DataTypes.STRING, // e.g. "Net 30"
      allowNull: true,
    },

    // Link to the shared BusinessPartner profile (generalization).
    // Nullable so older Feature 1 supplier rows without a profile still work.
    partnerId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      references: { model: "business_partners", key: "partnerId" },
    },
  },
  {
    sequelize,
    modelName: "Supplier",
    tableName: "suppliers",
    timestamps: false,
  }
);

module.exports = Supplier;
