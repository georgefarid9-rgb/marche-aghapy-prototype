
const sequelize = require("../src/database");
const {
  Report,
  FinancialReport,
  BudgetThreshold,
  Transaction,
  Ledger,
} = require("../src/models");

async function verifyAccountingReports() {
  const ids = {
    ledger: "TEST-REPORT-LEDGER",
    revenue: "TEST-REPORT-REV",
    expense: "TEST-REPORT-EXP",
    report: "TEST-FINANCIAL-REPORT",
    threshold: "TEST-BUDGET-THRESHOLD",
  };

  try {
    await sequelize.authenticate();

    // Remove leftovers from a previous test, if any.
    await FinancialReport.destroy({
      where: { reportId: ids.report },
    });
    await Report.destroy({ where: { reportId: ids.report } });
    await Transaction.destroy({
      where: {
        transactionId: [ids.revenue, ids.expense],
      },
    });
    await Ledger.destroy({ where: { ledgerId: ids.ledger } });
    await BudgetThreshold.destroy({
      where: { thresholdId: ids.threshold },
    });

    // Create a ledger and two transactions.
    const ledger = await Ledger.create({
      ledgerId: ids.ledger,
      currentBalance: 0,
      periodStartDate: "2026-10-01",
    });

    await ledger.addTransaction(
      Transaction.build({
        transactionId: ids.revenue,
        date: "2026-10-10",
        amount: 500,
        category: "Sales",
        description: "Test revenue",
        transactionType: "Revenue",
      })
    );

    await ledger.addTransaction(
      Transaction.build({
        transactionId: ids.expense,
        date: "2026-10-11",
        amount: 120,
        category: "Supplies",
        description: "Test expense",
        transactionType: "Expense",
      })
    );

    // Create the parent report before its financial details.
    await Report.create({
      reportId: ids.report,
      reportType: "sales",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });

    const financialReport = await FinancialReport.create({
      reportId: ids.report,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });

    const totals = await financialReport.calculateTotals();

    console.log("\nFinancial report test:");
    console.log("Expected revenue: 500 | Actual:", totals.totalRevenue);
    console.log("Expected expenses: 120 | Actual:", totals.totalExpenses);
    console.log("Expected net profit: 380 | Actual:", totals.netProfit);

    const reportPassed =
      totals.totalRevenue === 500 &&
      totals.totalExpenses === 120 &&
      totals.netProfit === 380;

    // Test the budget threshold.
    const threshold = await BudgetThreshold.create({
      thresholdId: ids.threshold,
      category: "Supplies",
      limitAmount: 100,
    });

    const thresholdPassed =
      threshold.isExceeded(120) === true &&
      threshold.isExceeded(80) === false;

    console.log("\nBudget threshold test:");
    console.log("120 exceeds limit 100:", threshold.isExceeded(120));
    console.log("80 exceeds limit 100:", threshold.isExceeded(80));

    if (reportPassed && thresholdPassed) {
      console.log("\nAccounting reports verification successful.");
    } else {
      console.error("\nAccounting reports verification failed.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\nAccounting reports verification failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    try {
      await FinancialReport.destroy({
        where: { reportId: ids.report },
      });
      await Report.destroy({ where: { reportId: ids.report } });
      await Transaction.destroy({
        where: {
          transactionId: [ids.revenue, ids.expense],
        },
      });
      await Ledger.destroy({ where: { ledgerId: ids.ledger } });
      await BudgetThreshold.destroy({
        where: { thresholdId: ids.threshold },
      });
    } catch (cleanupError) {
      console.error("Test cleanup issue:", cleanupError.message);
    }

    await sequelize.close();
  }
}

verifyAccountingReports();
