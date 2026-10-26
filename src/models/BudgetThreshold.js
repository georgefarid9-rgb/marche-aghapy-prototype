
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class BudgetThreshold extends Model {
  isExceeded(amount) {
    const value = Number(amount);

    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Amount must be a valid non-negative number.");
    }

    return value > Number(this.limitAmount);
  }
}

BudgetThreshold.init(
  {
    thresholdId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    limitAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      validate: {
        min: 0,
        isNumeric: true,
      },
    },
  },
  {
    sequelize,
    modelName: "BudgetThreshold",
    tableName: "budget_thresholds",
    timestamps: false,
  }
);

module.exports = BudgetThreshold;
