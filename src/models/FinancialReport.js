
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class FinancialReport extends Model {
  async compile() {
    const Transaction = require("./Transaction");

    const transactions = await Transaction.findAll({
      where: {
        date: {
          [require("sequelize").Op.gte]: this.periodStart,
          [require("sequelize").Op.lte]: this.periodEnd,
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
      totalRevenue: this.totalRevenue,
      totalExpenses: this.totalExpenses,
      netProfit: this.netProfit,
    };
  }
}

FinancialReport.init(
  {
    reportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
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
