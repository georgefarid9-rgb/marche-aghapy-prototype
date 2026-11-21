
const { Model, DataTypes, Op } = require("sequelize");
const sequelize = require("../database");

class Ledger extends Model {
  async addTransaction(transaction) {
    if (!transaction || typeof transaction.isValid !== "function") {
      throw new Error("A valid transaction is required.");
    }

    if (!transaction.isValid()) {
      throw new Error("Transaction validation failed.");
    }

    if (!transaction.transactionId) {
      throw new Error("Transaction ID is required.");
    }

    if (!this.ledgerId) {
      throw new Error("A valid ledger is required.");
    }

    const Transaction = require("./Transaction");

    // Only Revenue transactions can be associated with a Sale.
    const saleId =
      transaction.transactionType === "Revenue"
        ? transaction._saleId
        : null;

    await sequelize.transaction(async (dbTransaction) => {
      const existingTransaction = await Transaction.findByPk(
        transaction.transactionId,
        { transaction: dbTransaction }
      );

      if (existingTransaction) {
        throw new Error("A transaction with this ID already exists.");
      }

      // If a Sale was supplied, confirm it exists before saving.
      let sale = null;

      if (saleId) {
        const Sale = require("./Sale");

        sale = await Sale.findByPk(saleId, {
          transaction: dbTransaction,
        });

        if (!sale) {
          throw new Error(`Sale ${saleId} does not exist.`);
        }
      }

      transaction.ledgerId = this.ledgerId;

      // Save the accounting transaction.
      await transaction.save({ transaction: dbTransaction });

      // Link the saved Revenue transaction to its Sale.
      if (sale) {
        await sale.addRevenue(transaction, {
          transaction: dbTransaction,
        });
      }

      // Recalculate the balance using saved transactions.
      const transactions = await Transaction.findAll({
        where: { ledgerId: this.ledgerId },
        transaction: dbTransaction,
      });

      let balance = 0;

      for (const savedTransaction of transactions) {
        const amount = Number(savedTransaction.amount);

        if (savedTransaction.transactionType === "Revenue") {
          balance += amount;
        } else if (savedTransaction.transactionType === "Expense") {
          balance -= amount;
        }
      }

      this.currentBalance = balance;
      await this.save({ transaction: dbTransaction });
    });

    // The contract specifies void: no value is returned.
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

  async getTransactions(periodStart, periodEnd) {
    const Transaction = require("./Transaction");

    const where = {
      ledgerId: this.ledgerId,
    };

    if (periodStart || periodEnd) {
      where.date = {};

      if (periodStart) {
        where.date[Op.gte] = periodStart;
      }

      if (periodEnd) {
        where.date[Op.lte] = periodEnd;
      }
    }

    return Transaction.findAll({
      where,
      order: [["date", "ASC"]],
    });
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
