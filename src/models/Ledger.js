
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Ledger extends Model {
  async addTransaction(transaction) {
    if (!transaction || typeof transaction.validateTransaction !== "function") {
      throw new Error("A valid transaction is required.");
    }

    transaction.validateTransaction();

    if (!transaction.transactionId) {
      throw new Error("Transaction ID is required.");
    }

    transaction.ledgerId = this.ledgerId;
    await transaction.save();

    await this.recalculateBalance();

    return transaction;
  }

  async recalculateBalance() {
    const Transaction = require("./Transaction");

    const transactions = await Transaction.findAll({
      where: { ledgerId: this.ledgerId },
    });

    let balance = 0;

    for (const transaction of transactions) {
      const amount = Number(transaction.amount);

      if (transaction.transactionType === "Revenue") {
        balance += amount;
      } else if (transaction.transactionType === "Expense") {
        balance -= amount;
      }
    }

    this.currentBalance = balance;
    await this.save();

    return balance;
  }

  async getSummary() {
    const Transaction = require("./Transaction");

    const transactions = await Transaction.findAll({
      where: { ledgerId: this.ledgerId },
    });

    const revenue = transactions
      .filter((transaction) => transaction.transactionType === "Revenue")
      .reduce((total, transaction) => total + Number(transaction.amount), 0);

    const expenses = transactions
      .filter((transaction) => transaction.transactionType === "Expense")
      .reduce((total, transaction) => total + Number(transaction.amount), 0);

    return {
      ledgerId: this.ledgerId,
      currentBalance: Number(this.currentBalance),
      totalRevenue: revenue,
      totalExpenses: expenses,
      transactionCount: transactions.length,
    };
  }
}

Ledger.init(
  {
    ledgerId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    currentBalance: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    periodStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    storeId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "stores",
        key: "storeId",
      },
    },
  },
  {
    sequelize,
    modelName: "Ledger",
    tableName: "ledgers",
    timestamps: false,
  }
);

module.exports = Ledger;
