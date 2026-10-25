const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// One PerformanceRecord is written each time a supplier delivery arrives.
// A Supplier accumulates many records; an Employee records them.
// Both links are required: a record cannot exist without its Supplier
// and the Employee who recorded it.

const CONDITION_RATINGS = ["Good", "Acceptable", "Poor"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

class PerformanceRecord extends Model {
  // Days between the expected and the actual delivery date.
  // Positive = late, 0 = on time, negative = early.
  calculateDeliveryDelay() {
    const actual = new Date(this.deliveryDate);
    const expected = new Date(this.expectedDeliveryDate);
    return Math.round((actual - expected) / MS_PER_DAY);
  }

  // Percentage of the ordered quantity that was received, from 0 to 100.
  // Over-delivery counts as 100% filled (the order was fully met); the extra
  // units are not credited, and flagDiscrepancy() reports the over-delivery.
  calculateFillRate() {
    if (!this.quantityOrdered) {
      return 0;
    }
    const filled = Math.min(this.quantityReceived, this.quantityOrdered);
    const rate = (filled / this.quantityOrdered) * 100;
    return Math.round(rate * 10) / 10;
  }

  // True when the delivery has a problem the owner should look at:
  // the quantity received differs from the quantity ordered (short OR over),
  // or the goods arrived in Poor condition.
  flagDiscrepancy() {
    return (
      this.quantityReceived !== this.quantityOrdered ||
      this.conditionRating === "Poor"
    );
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

    // Needed to calculate /deliveryDelay (added to the class diagram).
    expectedDeliveryDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    quantityOrdered: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
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
  }
);

module.exports = PerformanceRecord;
