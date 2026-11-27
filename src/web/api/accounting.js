// Feature 4 — Accounting (Milestone 6 scenario 3: Record Daily Sales Revenue).
// Record Transaction follows the Feature 4 sequence diagram:
//   create Revenue / Expense -> isValid() (4a) -> categorize() (4S.1)
//   -> Ledger.addTransaction(): save, recalculate the balance (4S.2), store (4S.3)
//   -> Ledger.getSummary() for the updated financial summary.

const express = require("express");
const { Ledger, Revenue, Expense } = require("../../models");
const generateId = require("../../utils/generateId");
const { route } = require("./respond");

const router = express.Router();
const STORE_ID = "STORE-001";

async function storeLedger() {
  const ledger = await Ledger.findOne({ where: { storeId: STORE_ID } });
  if (!ledger) {
    throw new Error("The store has no ledger yet.");
  }
  return ledger;
}

async function ledgerView(ledger) {
  const transactions = await ledger.getTransactions();
  return {
    summary: await ledger.getSummary(),
    transactions: transactions
      .map((t) => ({
        transactionId: t.transactionId,
        date: t.date,
        transactionType: t.transactionType,
        category: t.category,
        source: t.source,
        description: t.description,
        amount: Number(t.amount),
      }))
      .reverse(), // newest first
  };
}

// Accounting dashboard.
router.get(
  "/",
  route(async (req, res) => {
    res.json({ ok: true, ...(await ledgerView(await storeLedger())) });
  })
);

// Record a transaction.
router.post(
  "/transactions",
  route(async (req, res) => {
    const { transactionType, amount, category, date, description, source } = req.body;

    // Inline messages for the form (4a). The same rules are checked again by isValid().
    const fieldErrors = {};
    if (!["Revenue", "Expense"].includes(transactionType)) fieldErrors.transactionType = "Choose Revenue or Expense.";
    if (!(Number(amount) > 0)) fieldErrors.amount = "Amount is required and must be greater than $0.00.";
    if (!category || !String(category).trim()) fieldErrors.category = "Select a category.";
    if (!date) fieldErrors.date = "Enter the date.";
    if (Object.keys(fieldErrors).length > 0) {
      const count = Object.keys(fieldErrors).length;
      res.status(400).json({
        ok: false,
        message: `Fix the ${count} highlighted field${count > 1 ? "s" : ""}, then select Save Transaction again. Nothing was added to the ledger.`,
        fieldErrors,
      });
      return;
    }

    const TransactionClass = transactionType === "Revenue" ? Revenue : Expense;
    const aTransaction = TransactionClass.build({
      transactionId: generateId("TXN"),
      transactionType,
      amount: Math.round(Number(amount) * 100) / 100,
      category: String(category).trim(),
      date,
      // The description is optional on the form; the ledger stores the category instead.
      description: description && String(description).trim() ? String(description).trim() : String(category).trim(),
      source: source && String(source).trim() ? String(source).trim() : null,
    });
    if (transactionType === "Revenue") {
      aTransaction.recordSale(); // daily sales total, not linked to one sale
    }
    if (!aTransaction.isValid()) {
      res.status(400).json({ ok: false, message: "The transaction is not valid. Nothing was saved." });
      return;
    }
    aTransaction.categorize(); // 4S.1

    const ledger = await storeLedger();
    await ledger.addTransaction(aTransaction); // 4S.2 + 4S.3
    await ledger.reload();

    res.status(201).json({
      ok: true,
      message: `${transactionType} of $${Number(aTransaction.amount).toFixed(2)} CAD saved (${aTransaction.transactionId}). The profit-and-loss balance was recalculated.`,
      transactionId: aTransaction.transactionId,
      ...(await ledgerView(ledger)),
    });
  })
);

module.exports = router;
