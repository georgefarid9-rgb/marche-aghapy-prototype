const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// One PerformanceRecord is written each time a supplier delivery arrives.
// A Supplier accumulates many records; an Employee records them.
// Both links are required: a record cannot exist without its Supplier
// and the Employee who recorded it.
// An UNPLANNED delivery (alternate flow 6b: no purchase order exists) has
// isUnplanned = true and no quantity ordered or expected delivery date.

const CONDITION_RATINGS = ["Good", "Acceptable", "Poor"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

class PerformanceRecord extends Model {
  // Days between the expected and the actual delivery date.
  // Positive = late, 0 = on time, negative = early.
  // null when there is no expected date (unplanned delivery).
  calculateDeliveryDelay() {
    if (!this.expectedDeliveryDate) {
      return null;
    }
    const actual = new Date(this.deliveryDate);
    const expected = new Date(this.expectedDeliveryDate);
    return Math.round((actual - expected) / MS_PER_DAY);
  }

  // Percentage of the ordered quantity that was received, from 0 to 100
  // (method contract C3-02, method specification MS3-02).
  // Over-delivery counts as 100% filled (the order was fully met); the extra
  // units are not credited, and flagDiscrepancy() reports the over-delivery.
  // An unplanned delivery has nothing ordered, so its fill rate is 0.
  calculateFillRate() {
    if (this.isUnplanned || !this.quantityOrdered) {
      return 0;
    }
    const filled = Math.min(this.quantityReceived, this.quantityOrdered);
    const rate = (filled / this.quantityOrdered) * 100;
    return Math.round(rate * 10) / 10;
  }

  // True when the delivery has a problem the owner should look at
  // (method contract C3-03, method specification MS3-03, alternate flow 6a):
  // the goods arrived in Poor condition (damaged or expired), or the quantity
  // received differs from the quantity ordered (short OR over).
  // An unplanned delivery has no quantity ordered, so only its condition counts.
  flagDiscrepancy() {
    if (this.conditionRating === "Poor") {
      return true;
    }
    if (this.isUnplanned) {
      return false;
    }
    return this.quantityReceived !== this.quantityOrdered;
  }
}

PerformanceRecord.init(
  {
    recordId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    deliveryDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    // Needed to calculate /deliveryDelay. Required unless the delivery is unplanned.
    expectedDeliveryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // Required unless the delivery is unplanned.
    quantityOrdered: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1 },
    },

    // Alternate flow 6b: the delivery had no purchase order.
    isUnplanned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    quantityReceived: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },

    conditionRating: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Good",
      validate: { isIn: [CONDITION_RATINGS] },
    },

    // Required links (also declared on the associations in models/index.js).
    supplierId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: "suppliers", key: "supplierId" },
    },

    employeeId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: "employees", key: "employeeId" },
    },

    // Derived attributes (/deliveryDelay, /fillRate): computed, not stored.
    deliveryDelay: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.calculateDeliveryDelay();
      },
    },

    fillRate: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.calculateFillRate();
      },
    },
  },
  {
    sequelize,
    modelName: "PerformanceRecord",
    tableName: "performance_records",
    timestamps: false,
    validate: {
      // A planned delivery must say what was ordered and when it was expected.
      plannedDeliveryHasOrderDetails() {
        if (!this.isUnplanned && (this.quantityOrdered == null || !this.expectedDeliveryDate)) {
          throw new Error(
            `Performance record ${this.recordId}: a planned delivery needs quantityOrdered and ` +
              "expectedDeliveryDate (set isUnplanned = true when there is no purchase order)."
          );
        }
      },
    },
  }
);

module.exports = PerformanceRecord;
