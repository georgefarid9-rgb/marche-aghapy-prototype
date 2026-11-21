
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Transaction extends Model {
  validateTransaction() {
    if (!Number.isFinite(Number(this.amount)) || Number(this.amount) <= 0) {
      throw new Error("Transaction amount must be greater than zero.");
    }

    if (!this.date) {
      throw new Error("Transaction date is required.");
    }

    if (!["Revenue", "Expense"].includes(this.transactionType)) {
      throw new Error("Transaction type must be Revenue or Expense.");
    }

    return true;
  }

  // Boolean validation for the accounting contract.
  // Kept separate from Sequelize's built-in validate() method.
  isValid() {
    try {
      this.validateTransaction();
      return true;
    } catch (error) {
      return false;
    }
  }

  categorize() {
    if (!this.category || !this.category.trim()) {
      throw new Error("Transaction category is required.");
    }

    return this.category;
  }
}

Transaction.init(
  {
    transactionId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    ledgerId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "ledgers",
        key: "ledgerId",
      },
    },

    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    supplierId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "suppliers",
        key: "supplierId",
      },
    },

    budgetThresholdId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "budget_thresholds",
        key: "thresholdId",
      },
    },

    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    amount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      validate: {
        isGreaterThanZero(value) {
          if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
            throw new Error("Transaction amount must be greater than zero.");
          }
        },
      },
    },

    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    source: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    transactionType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["Revenue", "Expense"]],
      },
    },
  },
  {
    sequelize,
    modelName: "Transaction",
    tableName: "transactions",
    timestamps: false,
  }
);

module.exports = Transaction;
