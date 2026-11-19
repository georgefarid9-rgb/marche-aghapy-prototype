
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

    return true;
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

    // New field: optional due date for expenses
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // New field: optional supplier linked to an expense
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
