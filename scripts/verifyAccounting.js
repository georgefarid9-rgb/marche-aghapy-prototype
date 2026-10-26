
const sequelize = require("../src/database");

const { Ledger, Transaction } = require("../src/models");

async function verifyAccounting() {
  const ledgerId = "TEST-ACCOUNTING-LEDGER";
  const revenueId = "TEST-ACCOUNTING-REV";
  const expenseId = "TEST-ACCOUNTING-EXP";

  try {
    await sequelize.authenticate();

    // Clean up only records belonging to this test.
    await Transaction.destroy({
      where: { transactionId: [revenueId, expenseId] },
    });

    await Ledger.destroy({
      where: { ledgerId },
    });

const Store = require("../src/models").Store;
const store = await Store.findOne();

if (!store) {
  throw new Error("No store exists in the test database. Cannot test accounting.");
}

const ledger = await Ledger.create({
  ledgerId,
  storeId: store.storeId,
  currentBalance: 0,
  periodStartDate: "2026-10-01",
});

    const revenue = Transaction.build({
      transactionId: revenueId,
      date: "2026-10-10",
      amount: 500,
      category: "Sales",
      description: "Accounting test revenue",
      transactionType: "Revenue",
    });

    await ledger.addTransaction(revenue);

    const expense = Transaction.build({
      transactionId: expenseId,
      date: "2026-10-11",
      amount: 120,
      category: "Supplies",
      description: "Accounting test expense",
      transactionType: "Expense",
    });

    await ledger.addTransaction(expense);

    const summary = await ledger.getSummary();

    console.log("Accounting verification results:");
    console.log("Revenue saved:", revenue.isNewRecord === false);
    console.log("Expense saved:", expense.isNewRecord === false);
    console.log("Expected balance: 380");
    console.log("Actual balance:", ledger.currentBalance);
    console.log("Expected revenue: 500");
    console.log("Actual revenue:", summary.totalRevenue);
    console.log("Expected expenses: 120");
    console.log("Actual expenses:", summary.totalExpenses);
    console.log("Expected transaction count: 2");
    console.log("Actual transaction count:", summary.transactionCount);

    const passed =
      Number(ledger.currentBalance) === 380 &&
      summary.totalRevenue === 500 &&
      summary.totalExpenses === 120 &&
      summary.transactionCount === 2;

    if (!passed) {
  console.error("Accounting verification failed.");
  process.exitCode = 1;
} else {
  console.log("Accounting verification successful.");
}
  } catch (error) {
    console.error("Accounting verification failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Remove only the records created by this test.
    try {
      await Transaction.destroy({
        where: { transactionId: [revenueId, expenseId] },
      });

      await Ledger.destroy({
        where: { ledgerId },
      });
    } catch (cleanupError) {
      console.error("Test cleanup failed:", cleanupError.message);
    }

    await sequelize.close();
  }
}

verifyAccounting();
