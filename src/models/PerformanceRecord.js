const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// One PerformanceRecord is written each time a supplier delivery arrives.
// A Supplier accumulates many records; an Employee records them.

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

  // Percentage of the ordered quantity that was received (0-100).
  calculateFillRate() {
    if (!this.quantityOrdered) {
      return 0;
    }
    const rate = (this.quantityReceived / this.quantityOrdered) * 100;
    return Math.round(rate * 10) / 10;
  }

  // True when the delivery has a problem the owner should look at:
  // the quantity received differs from the quantity ordered,
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

    // Added so /deliveryDelay can be calculated (not in the original class diagram).
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
