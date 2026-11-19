
const { Model, DataTypes, Op } = require("sequelize");
const sequelize = require("../database");

class FinancialReport extends Model {
  async compile() {
    const Transaction = require("./Transaction");

    if (!this.ledgerId) {
      throw new Error("A ledgerId is required to compile a financial report.");
    }

    const transactions = await Transaction.findAll({
      where: {
        ledgerId: this.ledgerId,
        date: {
          [Op.gte]: this.periodStart,
          [Op.lte]: this.periodEnd,
        },
      },
    });

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const transaction of transactions) {
      if (transaction.transactionType === "Revenue") {
        totalRevenue += Number(transaction.amount);
      } else if (transaction.transactionType === "Expense") {
        totalExpenses += Number(transaction.amount);
      }
    }

    this.totalRevenue = totalRevenue;
    this.totalExpenses = totalExpenses;
    this.netProfit = totalRevenue - totalExpenses;

    return this;
  }

  async calculateTotals() {
    await this.compile();

    return {
      totalRevenue: Number(this.totalRevenue),
      totalExpenses: Number(this.totalExpenses),
      netProfit: Number(this.netProfit),
    };
  }
}

FinancialReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: {
        model: "reports",
        key: "reportId",
      },
    },
    ledgerId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "ledgers",
        key: "ledgerId",
      },
    },
    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    totalRevenue: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },
    totalExpenses: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },
    netProfit: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "FinancialReport",
    tableName: "financial_reports",
    timestamps: false,
  }
);

module.exports = FinancialReport;
