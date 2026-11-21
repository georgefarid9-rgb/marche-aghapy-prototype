
const { Model, DataTypes, Transaction } = require("sequelize");
const sequelize = require("../database");
const { today, daysBetween } = require("../utils/dates");
const { guardMethods } = require("../utils/supportGuard");

const RETURN_STATUSES = ["Pending", "Refunded", "Rejected"];
const RETURN_WINDOW_DAYS = 30;
const REFUND_TRANSACTION_TYPE = "Expense";

const toCents = (amount) => Math.round(amount * 100);

class ReturnRequest extends Model {
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

    if (Boolean(this.saleItemId) !== Boolean(this.quantity)) {
      return "a sale item and a quantity must be given together";
    }

    if (this.saleItemId && this.quantity) {
      const item = await this.getSaleItem({ transaction });

      if (!item || item.saleId !== this.saleId) {
        return `sale item ${this.saleItemId} is not a line of sale ${this.saleId}`;
      }

      if (this.quantity > item.quantity - item.returnedQuantity) {
        return `only ${item.quantity - item.returnedQuantity} unit(s) of sale item ${item.saleItemId} can still be returned`;
      }

      const expectedCents = toCents(item.unitPrice * this.quantity);

      if (toCents(this.amount) !== expectedCents) {
        return `the refund amount must be ${(expectedCents / 100).toFixed(2)} for ${this.quantity} unit(s) of sale item ${item.saleItemId}`;
      }
    }

    const alreadyRefunded =
      (await ReturnRequest.sum("amount", {
        where: { saleId: this.saleId, status: "Refunded" },
        transaction,
      })) || 0;

    if (
      toCents(this.amount) >
      toCents(sale.totalAmount) - toCents(alreadyRefunded)
    ) {
      return `the amount is more than what is still refundable on sale ${sale.saleId}`;
    }

    return null;
  }

  async checkEligibility(options = {}) {
    return (await this.getIneligibilityReason(options)) === null;
  }

  async processRefund() {
    let ledger = null;
    let rejectionReason = null;

    this.rejectionReason = null;
    this.ledgerBalanceUpdated = null;

    const eligible = await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        await this.reload({ transaction });

        if (this.status !== "Pending") {
          throw new Error(`Return ${this.returnId} was already ${this.status}.`);
        }

        const reason = await this.getIneligibilityReason({ transaction });
        const isEligible = reason === null;
        rejectionReason = reason;

        if (isEligible) {
          if (this.saleItemId && this.quantity) {
            const item = await this.getSaleItem({ transaction });
            await item.recordReturn(this.quantity, { transaction });
          }

          ledger = await this.findLedger({ transaction });

          // Record the ledger receiving this refund.
          this.ledgerId = ledger.ledgerId;

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

    this.rejectionReason = rejectionReason;

    // Recalculate only after the database transaction has committed.
    if (ledger) {
      try {
        await ledger.recalculateBalance();
        this.ledgerBalanceUpdated = true;
      } catch (error) {
        this.ledgerBalanceUpdated = false;

        console.error(
          `[Feature 6] Refund ${this.returnId} was saved, but the ledger balance could not be updated yet (${error.message}). It will be corrected on the next recalculation.`
        );
      }
    }

    return eligible;
  }

  async findLedger(options = {}) {
    const employee = this.employeeId ? await this.getEmployee(options) : null;
    const store =
      employee && employee.storeId ? await employee.getStore(options) : null;
    const ledger = store ? await store.getLedger(options) : null;

    if (!ledger) {
      throw new Error(
        `No ledger was found for return ${this.returnId}, so the refund cannot be recorded.`
      );
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

    ledgerId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "ledgers",
        key: "ledgerId",
      },
    },

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1 },
    },

    // customerId, saleId, saleItemId and employeeId are added
    // by the associations in models/index.js.
  },
  {
    sequelize,
    modelName: "ReturnRequest",
    tableName: "return_requests",
    timestamps: false,
    hooks: {
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

guardMethods(ReturnRequest, {
  getIneligibilityReason: { action: "checking the return" },
  checkEligibility: { action: "checking the return" },
  findLedger: { action: "finding the store ledger" },
  processRefund: { action: "processing the refund", retry: true },
});

module.exports = ReturnRequest;
