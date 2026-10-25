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

    // For a supplier linked to a BusinessPartner, this is a synchronized copy
    // of BusinessPartner.partnerName (the authoritative name). It is filled in
    // automatically and must be changed through BusinessPartner.updateProfile().
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
    // Nullable so older Feature 1 supplier rows without a profile still work;
    // scripts/migrateFeature3Profiles.js gives every existing supplier a profile.
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
    hooks: {
      // Before every create or save of a supplier linked to a partner:
      // the partner must exist and be a Supplier, and supplierName must
      // match the partner's name.
      async beforeValidate(supplier, options) {
        if (!supplier.partnerId) {
          return; // legacy Feature 1 supplier without a profile
        }

        const partner = await sequelize.models.BusinessPartner.findByPk(
          supplier.partnerId,
          { transaction: options.transaction }
        );

        if (!partner) {
          throw new Error(
            `Supplier ${supplier.supplierId}: BusinessPartner ${supplier.partnerId} does not exist.`
          );
        }
        if (partner.partnerType !== "Supplier") {
          throw new Error(
            `Supplier ${supplier.supplierId}: BusinessPartner ${partner.partnerId} has partnerType ` +
              `"${partner.partnerType}", expected "Supplier".`
          );
        }

        if (supplier.isNewRecord || !supplier.supplierName) {
          // New supplier: take the name from its partner profile.
          supplier.supplierName = partner.partnerName;
        } else if (supplier.supplierName !== partner.partnerName) {
          throw new Error(
            `Supplier ${supplier.supplierId}: change the name with ` +
              "BusinessPartner.updateProfile() so both names stay the same."
          );
        }
      },
    },
  }
);

module.exports = Supplier;
