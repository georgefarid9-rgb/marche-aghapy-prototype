const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Supplier is used by Feature 1 (Supplier 1 ---- 0..* Product) and
// extended by Feature 3 (Supplier is a kind of BusinessPartner and
// accumulates PerformanceRecords).

// The supplier's planned deliveries. Unplanned deliveries (alternate flow 6b)
// have no quantity ordered or expected date, so they are left out of the metrics.
async function plannedDeliveriesOf(supplier) {
  const records = await supplier.getPerformanceRecords();
  return records.filter((record) => !record.isUnplanned);
}

// Round to one decimal place.
function round1(value) {
  return Math.round(value * 10) / 10;
}

class Supplier extends Model {
  // Feature 3: score the supplier from its delivery history (method contract
  // C3-01, method specification MS3-01). Returns the average fill rate (0-100)
  // of its PLANNED deliveries, or null when it has none (alternate flow 9a).
  // Unplanned deliveries (flow 6b) have no quantity ordered, so they are left out.
  async evaluatePerformance() {
    const plannedRecords = await plannedDeliveriesOf(this);
    if (plannedRecords.length === 0) {
      return null;
    }
    const total = plannedRecords.reduce((sum, record) => sum + record.calculateFillRate(), 0);
    return round1(total / plannedRecords.length);
  }

  // Use case 3 step 9: the share (0-100) of planned deliveries that arrived on
  // or before their expected delivery date. Null when there are none (9a).
  async calculateOnTimeDeliveryRate() {
    const plannedRecords = await plannedDeliveriesOf(this);
    if (plannedRecords.length === 0) {
      return null;
    }
    const onTime = plannedRecords.filter((record) => record.calculateDeliveryDelay() <= 0);
    return round1((onTime.length / plannedRecords.length) * 100);
  }

  // Use case 3 step 9: the supplier's average ACTUAL lead time in days.
  // The expected delivery date of an order is its order date plus the agreed
  // lead time (leadTimeDays), so each delivery's actual lead time is
  // leadTimeDays + its delivery delay (negative when early).
  // Null when the lead time is unknown or there are no planned deliveries (9a).
  async calculateAverageLeadTime() {
    if (this.leadTimeDays === null || this.leadTimeDays === undefined) {
      return null;
    }
    const plannedRecords = await plannedDeliveriesOf(this);
    if (plannedRecords.length === 0) {
      return null;
    }
    const total = plannedRecords.reduce(
      (sum, record) => sum + this.leadTimeDays + record.calculateDeliveryDelay(),
      0
    );
    return round1(total / plannedRecords.length);
  }

  // Use case 3 steps 8-9: the supplier performance report the owner reviews
  // before ordering. Average lead time, on-time delivery rate and average fill
  // rate, or a "no deliveries" message (alternate flow 9a).
  async getPerformanceReport() {
    const records = await this.getPerformanceRecords();
    const plannedCount = records.filter((record) => !record.isUnplanned).length;
    const report = {
      supplierId: this.supplierId,
      supplierName: this.supplierName,
      deliveriesRecorded: records.length,
      unplannedDeliveries: records.length - plannedCount,
      agreedLeadTimeDays: this.getSupplierLeadTime(),
      averageLeadTime: await this.calculateAverageLeadTime(),
      onTimeDeliveryRate: await this.calculateOnTimeDeliveryRate(),
      averageFillRate: await this.evaluatePerformance(),
      message: null,
    };
    if (records.length === 0) {
      report.message = "No deliveries were recorded for this supplier.";
    } else if (plannedCount === 0) {
      report.message =
        "Only unplanned deliveries were recorded for this supplier, so no performance metrics can be calculated.";
    }
    return report;
  }

  // The lead time agreed with the supplier, in days (Supplier.leadTimeDays).
  // calculateAverageLeadTime() gives the lead time actually observed.
  getSupplierLeadTime() {
    return this.leadTimeDays ?? null;
  }

  // Find the supplier whose profile has this name (class-scope operation,
  // used by alternate flow 5a). Returns the Supplier, or null.
  static async findProfile(partnerName) {
    if (partnerName === undefined || partnerName === null || String(partnerName).trim() === "") {
      return null;
    }
    const partner = await sequelize.models.BusinessPartner.findOne({
      where: { partnerName: String(partnerName).trim(), partnerType: "Supplier" },
    });
    return partner ? partner.getSupplierProfile() : null;
  }

  // Inherited from BusinessPartner: the supplier's profile as readable text.
  async retrieveInfo() {
    const partner = await this.getPartner();
    return partner ? partner.retrieveInfo() : null;
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
