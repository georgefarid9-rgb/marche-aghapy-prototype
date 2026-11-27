
const { randomUUID } = require("crypto");
const sequelize = require("../src/database");

const {
  Report,
  FinancialReport,
  BudgetThreshold,
  Transaction,
  Ledger,
  Store,
} = require("../src/models");

async function verifyAccountingReports() {
  const testRunId = randomUUID();

  const ids = {
    ledger: `TEST-REPORT-LEDGER-${testRunId}`,
    revenue: `TEST-REPORT-REV-${testRunId}`,
    expense: `TEST-REPORT-EXP-${testRunId}`,
    report: `TEST-FINANCIAL-REPORT-${testRunId}`,
    threshold: `TEST-BUDGET-THRESHOLD-${testRunId}`,
  };

  let ledgerCreated = false;

  try {
    await sequelize.authenticate();

    const store = await Store.findOne();

    if (!store) {
      throw new Error("No store exists in the test database.");
    }

    const ledger = await Ledger.create({
      ledgerId: ids.ledger,
      storeId: store.storeId,
      currentBalance: 0,
      periodStartDate: "2026-10-01",
    });

    ledgerCreated = true;

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

    await Report.create({
      reportId: ids.report,
      reportType: "financial",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });

    const financialReport = await FinancialReport.create({
      reportId: ids.report,
      ledgerId: ids.ledger,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });

    const totals = await financialReport.calculateTotals();

    console.log("\nFinancial report calculation test:");
    console.log("Expected revenue: 500 | Actual:", totals.totalRevenue);
    console.log("Expected expenses: 120 | Actual:", totals.totalExpenses);
    console.log("Expected net profit: 380 | Actual:", totals.netProfit);

    const calculationsPassed =
      totals.totalRevenue === 500 &&
      totals.totalExpenses === 120 &&
      totals.netProfit === 380;

    // Test that report totals and parent report status are saved.
    await financialReport.generateReport();

    const savedFinancialReport = await FinancialReport.findByPk(ids.report);
    const savedParentReport = await Report.findByPk(ids.report);

    const savedTotalsPassed =
      Number(savedFinancialReport.totalRevenue) === 500 &&
      Number(savedFinancialReport.totalExpenses) === 120 &&
      Number(savedFinancialReport.netProfit) === 380;

    const reportStatusPassed =
      savedParentReport &&
      savedParentReport.reportStatus === "Generated";

    console.log("\nSaved report test:");
    console.log("Financial report totals saved:", savedTotalsPassed);
    console.log(
      "Parent report marked Generated:",
      reportStatusPassed
    );

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

    if (
      calculationsPassed &&
      savedTotalsPassed &&
      reportStatusPassed &&
      thresholdPassed
    ) {
      console.log("\nAccounting reports verification successful.");
    } else {
      throw new Error("One or more accounting reports tests failed.");
    }
  } catch (error) {
    console.error("\nAccounting reports verification failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    try {
      // Remove only records created by this unique test run.
      await FinancialReport.destroy({
        where: { reportId: ids.report },
      });

      await Report.destroy({
        where: { reportId: ids.report },
      });

      await Transaction.destroy({
        where: {
          transactionId: [ids.revenue, ids.expense],
        },
      });

      if (ledgerCreated) {
        await Ledger.destroy({
          where: { ledgerId: ids.ledger },
        });
      }

      await BudgetThreshold.destroy({
        where: { thresholdId: ids.threshold },
      });
    } catch (cleanupError) {
      console.error("Test cleanup issue:", cleanupError.message);
      process.exitCode = 1;
    }

    await sequelize.close();
  }
}

verifyAccountingReports();
