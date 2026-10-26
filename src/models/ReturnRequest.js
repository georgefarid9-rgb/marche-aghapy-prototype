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
  //   7. the amount does not exceed what is still refundable on the sale
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
  // This is a simulated refund: it only records the decision on this request. It does
  // not yet post to Accounting or return stock to Inventory (see the README).
  async processRefund() {
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        // Re-read inside the transaction so a decision made elsewhere is not overwritten.
        await this.reload({ transaction });

        if (this.status !== "Pending") {
          throw new Error(`Return ${this.returnId} was already ${this.status}.`);
        }

        const eligible = await this.checkEligibility({ transaction });
        this.status = eligible ? "Refunded" : "Rejected";
        await this.save({ transaction });
        return eligible;
      }
    );
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

    // customerId, saleId and employeeId are added by the associations in models/index.js.
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

module.exports = ReturnRequest;
