const { Model, DataTypes, Transaction } = require("sequelize");
const sequelize = require("../database");
const { today, daysBetween } = require("../utils/dates");

// Feature 6 - Customer Support
// A customer's request to return a sale (in whole or in part) and be refunded.
//
// Status rules: a request starts as "Pending" and is decided exactly once. "Refunded"
// and "Rejected" are final, so a decided request can never be processed again.

const RETURN_STATUSES = ["Pending", "Refunded", "Rejected"];

// A sale can be returned for this many days after the sale date (prototype rule).
const RETURN_WINDOW_DAYS = 30;

// How a refund is stored in the Feature 4 ledger (see processRefund).
const REFUND_TRANSACTION_TYPE = "Expense";

// Work in whole cents so amounts such as 0.1 + 0.2 compare correctly.
const toCents = (amount) => Math.round(amount * 100);

class ReturnRequest extends Model {
  // Explain why this return cannot be refunded, or return null when it can.
  // Rules, checked in this order:
  //   1. the request is still Pending (a decided request is final),
  //   2. the amount is greater than zero,
  //   3. the request is linked to an existing sale,
  //   4. the sale belongs to the same customer as the request,
  //   5. the sale date is not in the future,
  //   6. the sale is inside the return window,
  //   7. quantity (when given) does not exceed the units still returnable on the sale line,
  //   8. the amount does not exceed what is still refundable on the sale
  //      (sale total minus refunds already paid out).
  // Pass { transaction } to run the reads inside a transaction.
  async getIneligibilityReason(options = {}) {
    const { transaction } = options;

    if (this.status !== "Pending") {
      return `return ${this.returnId} is already ${this.status}`;
    }

    if (typeof this.amount !== "number" || !(this.amount > 0)) {
      return "the amount must be greater than zero";
    }

    const sale = await this.getSale({ transaction });
    if (!sale) {
      return "the sale was not found";
    }

    if (!sale.customerId || sale.customerId !== this.customerId) {
      return `sale ${sale.saleId} does not belong to customer ${this.customerId}`;
    }

    const daysSinceSale = daysBetween(sale.saleDate, today());
    if (daysSinceSale < 0) {
      return `sale ${sale.saleId} is dated in the future (${sale.saleDate})`;
    }
    if (daysSinceSale > RETURN_WINDOW_DAYS) {
      return `sale ${sale.saleId} is outside the ${RETURN_WINDOW_DAYS}-day return window`;
    }

    // When the return names a sale line and a quantity, that many units must still be returnable.
    if (this.saleItemId && this.quantity) {
      const item = await this.getSaleItem({ transaction });
      if (!item || item.saleId !== this.saleId) {
        return `sale item ${this.saleItemId} is not a line of sale ${this.saleId}`;
      }
      if (this.quantity > item.quantity - item.returnedQuantity) {
        return `only ${item.quantity - item.returnedQuantity} unit(s) of sale item ${item.saleItemId} can still be returned`;
      }
    }

    const alreadyRefunded =
      (await ReturnRequest.sum("amount", {
        where: { saleId: this.saleId, status: "Refunded" },
        transaction,
      })) || 0;

    if (toCents(this.amount) > toCents(sale.totalAmount) - toCents(alreadyRefunded)) {
      return `the amount is more than what is still refundable on sale ${sale.saleId}`;
    }

    return null;
  }

  // True when the return can be refunded, false otherwise.
  async checkEligibility(options = {}) {
    return (await this.getIneligibilityReason(options)) === null;
  }

  // Decide a Pending return: refund it if eligible, otherwise reject it.
  // Returns true when the refund was processed, false when it was rejected.
  // Throws if the request was already decided.
  //
  // The whole decision runs in one IMMEDIATE transaction. SQLite takes the write lock
  // before the eligibility reads, so two refunds on the same sale cannot both see the
  // same remaining amount and together exceed it.
  //
  // When eligible, the refund is also recorded (no stock is returned):
  //   - the sale line's returnedQuantity goes up (items sold goes down),
  //   - a Feature 4 "Refund" entry is added to the store's ledger (revenue goes down).
  // If anything fails, everything is undone and the request stays Pending.
  //
  // Prototype note: the refund entry is saved as an Expense with category "Refund" because
  // Feature 4's Transaction only accepts "Revenue" or "Expense". The balance falls by the
  // refund amount either way. Change REFUND_TRANSACTION_TYPE if Feature 4 adds "Refund".
  // The ledger balance is recalculated after the commit, because Ledger.addTransaction()
  // does not take a database transaction and would wait on the lock held here.
  async processRefund() {
    let ledger = null;

    const eligible = await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        // Re-read inside the transaction so a decision made elsewhere is not overwritten.
        await this.reload({ transaction });

        if (this.status !== "Pending") {
          throw new Error(`Return ${this.returnId} was already ${this.status}.`);
        }

        const isEligible = await this.checkEligibility({ transaction });

        if (isEligible) {
          if (this.saleItemId && this.quantity) {
            const item = await this.getSaleItem({ transaction });
            await item.recordReturn(this.quantity, { transaction });
          }

          ledger = await this.findLedger({ transaction });
          const refund = sequelize.models.Transaction.build({
            transactionId: `REF-${this.returnId}`,
            ledgerId: ledger.ledgerId,
            transactionType: REFUND_TRANSACTION_TYPE,
            category: "Refund",
            amount: this.amount,
            date: today(),
            description: `Refund for return ${this.returnId} on sale ${this.saleId}`,
          });
          refund.validateTransaction();
          await refund.save({ transaction });
        }

        this.status = isEligible ? "Refunded" : "Rejected";
        await this.save({ transaction });
        return isEligible;
      }
    );

    if (ledger) {
      await ledger.recalculateBalance();
    }
    return eligible;
  }

  // The ledger of the store where the processing employee works (Feature 4).
  async findLedger(options = {}) {
    const employee = this.employeeId ? await this.getEmployee(options) : null;
    const store = employee && employee.storeId ? await employee.getStore(options) : null;
    const ledger = store ? await store.getLedger(options) : null;
    if (!ledger) {
      throw new Error(`No ledger was found for return ${this.returnId}, so the refund cannot be recorded.`);
    }
    return ledger;
  }
}

ReturnRequest.init(
  {
    returnId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reason: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },

    amount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Pending",
      validate: { isIn: [RETURN_STATUSES] },
    },

    // Which sale line is returned and how many units. Optional so a whole-amount
    // return (such as RET-001) still works.
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1 },
    },

    // customerId, saleId, saleItemId and employeeId are added by the associations in models/index.js.
  },
  {
    sequelize,
    modelName: "ReturnRequest",
    tableName: "return_requests",
    timestamps: false,
    hooks: {
      // Refunded and Rejected are final: block any later change of status.
      beforeUpdate(returnRequest) {
        const before = returnRequest.previous("status");
        if (before && before !== "Pending" && returnRequest.status !== before) {
          throw new Error(
            `Return ${returnRequest.returnId} is ${before} and its status cannot be changed.`
          );
        }
      },
    },
  }
);

ReturnRequest.RETURN_STATUSES = RETURN_STATUSES;
ReturnRequest.RETURN_WINDOW_DAYS = RETURN_WINDOW_DAYS;
ReturnRequest.REFUND_TRANSACTION_TYPE = REFUND_TRANSACTION_TYPE;

module.exports = ReturnRequest;
