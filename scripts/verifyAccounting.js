
const { randomUUID } = require("crypto");
const sequelize = require("../src/database");
const { Ledger, Transaction, Store } = require("../src/models");

async function verifyAccounting() {
  const testRunId = randomUUID();

  const ledgerId = `TEST-LEDGER-${testRunId}`;
  const revenueId = `TEST-REV-${testRunId}`;
  const expenseId = `TEST-EXP-${testRunId}`;
  const rollbackId = `TEST-ROLLBACK-${testRunId}`;

  let ledgerCreated = false;

  try {
    await sequelize.authenticate();

    const store = await Store.findOne();

    if (!store) {
      throw new Error(
        "No store exists in the test database. Cannot test accounting."
      );
    }

    const ledger = await Ledger.create({
      ledgerId,
      storeId: store.storeId,
      currentBalance: 0,
      periodStartDate: "2026-10-01",
    });

    ledgerCreated = true;

    const revenue = Transaction.build({
      transactionId: revenueId,
      date: "2026-10-10",
      amount: 500,
      category: "Sales",
      description: "Accounting test revenue",
      transactionType: "Revenue",
    });

    const revenueResult = await ledger.addTransaction(revenue);

    const expense = Transaction.build({
      transactionId: expenseId,
      date: "2026-10-11",
      amount: 120,
      category: "Supplies",
      description: "Accounting test expense",
      transactionType: "Expense",
    });

    const expenseResult = await ledger.addTransaction(expense);

    let summary = await ledger.getSummary();

    const normalAccountingPassed =
      revenue.isNewRecord === false &&
      expense.isNewRecord === false &&
      revenueResult === undefined &&
      expenseResult === undefined &&
      Number(ledger.currentBalance) === 380 &&
      summary.totalRevenue === 500 &&
      summary.totalExpenses === 120 &&
      summary.transactionCount === 2;

    console.log("\nNormal accounting test:");
    console.log("Revenue saved:", revenue.isNewRecord === false);
    console.log("Expense saved:", expense.isNewRecord === false);
    console.log(
      "addTransaction returns undefined:",
      revenueResult === undefined && expenseResult === undefined
    );
    console.log("Expected balance: 380");
    console.log("Actual balance:", ledger.currentBalance);
    console.log("Expected revenue: 500");
    console.log("Actual revenue:", summary.totalRevenue);
    console.log("Expected expenses: 120");
    console.log("Actual expenses:", summary.totalExpenses);
    console.log("Expected transaction count: 2");
    console.log("Actual transaction count:", summary.transactionCount);

    let duplicateRejected = false;

    try {
      const duplicate = Transaction.build({
        transactionId: revenueId,
        date: "2026-10-12",
        amount: 50,
        category: "Sales",
        description: "Duplicate accounting test",
        transactionType: "Revenue",
      });

      await ledger.addTransaction(duplicate);
    } catch (error) {
      duplicateRejected = true;
      console.log("\nDuplicate rejection:", error.message);
    }

    summary = await ledger.getSummary();

    const duplicateProtectionPassed =
      duplicateRejected &&
      summary.transactionCount === 2 &&
      Number(ledger.currentBalance) === 380;

    console.log("\nDuplicate transaction test:");
    console.log("Duplicate rejected:", duplicateRejected);
    console.log("Transaction count remains 2:", summary.transactionCount === 2);
    console.log("Balance remains 380:", Number(ledger.currentBalance) === 380);

    let rollbackRejected = false;

    try {
      const invalidTransaction = Transaction.build({
        transactionId: rollbackId,
        date: "2026-10-13",
        amount: 75,
        category: "Supplies",
        transactionType: "Expense",
      });

      await ledger.addTransaction(invalidTransaction);
    } catch (error) {
      rollbackRejected = true;
      console.log("\nFailed-save rejection:", error.message);
    }

    summary = await ledger.getSummary();

    const rollbackTransaction = await Transaction.findByPk(rollbackId);

    const rollbackPassed =
      rollbackRejected &&
      !rollbackTransaction &&
      summary.transactionCount === 2 &&
      Number(ledger.currentBalance) === 380;

    console.log("\nRollback test:");
    console.log("Invalid save rejected:", rollbackRejected);
    console.log("Failed transaction was not saved:", !rollbackTransaction);
    console.log("Transaction count remains 2:", summary.transactionCount === 2);
    console.log("Balance remains 380:", Number(ledger.currentBalance) === 380);

    if (
      !normalAccountingPassed ||
      !duplicateProtectionPassed ||
      !rollbackPassed
    ) {
      throw new Error("One or more accounting verification tests failed.");
    }

    console.log("\nAll accounting verification tests passed.");
  } catch (error) {
    console.error("\nAccounting verification failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    try {
      await Transaction.destroy({
        where: {
          transactionId: [revenueId, expenseId, rollbackId],
        },
      });

      if (ledgerCreated) {
        await Ledger.destroy({
          where: { ledgerId },
        });
      }
    } catch (cleanupError) {
      console.error("Test cleanup failed:", cleanupError.message);
      process.exitCode = 1;
    }

    await sequelize.close();
  }
}

verifyAccounting();
