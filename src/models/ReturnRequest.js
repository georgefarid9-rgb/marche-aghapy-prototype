const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 6 - Customer Support
// A customer's request to return a sale (in whole or in part) and be refunded.

const RETURN_STATUSES = ["Pending", "Refunded", "Rejected"];

// A sale can be returned for this many days after the sale date (prototype rule).
const RETURN_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

class ReturnRequest extends Model {
  // Check whether the return can be refunded. Returns true or false.
  // The request is eligible when:
  //   - it is linked to an existing sale,
  //   - the amount is greater than zero,
  //   - the sale is inside the return window,
  //   - the amount does not exceed what is still refundable on that sale
  //     (sale total minus refunds already paid out).
  async checkEligibility() {
    if (typeof this.amount !== "number" || !(this.amount > 0)) {
      return false;
    }

    const sale = await this.getSale();
    if (!sale) {
      return false;
    }

    const saleTime = new Date(`${sale.saleDate}T00:00:00`).getTime();
    const daysSinceSale = (Date.now() - saleTime) / MS_PER_DAY;
    if (daysSinceSale > RETURN_WINDOW_DAYS) {
      return false;
    }

    const alreadyRefunded =
      (await ReturnRequest.sum("amount", {
        where: { saleId: this.saleId, status: "Refunded" },
      })) || 0;
    const stillRefundable = sale.totalAmount - alreadyRefunded;

    return this.amount <= stillRefundable;
  }

  // Refund the customer if the return is eligible; otherwise reject the request.
  // Returns true when the refund was processed, false when it was rejected.
  // Updating inventory and accounting after a refund (use case step 7) is not
  // done here yet: the Ledger and Transaction classes are not in the prototype.
  async processRefund() {
    if (this.status === "Refunded") {
      throw new Error(`Return ${this.returnId} has already been refunded.`);
    }

    const eligible = await this.checkEligibility();
    this.status = eligible ? "Refunded" : "Rejected";
    await this.save();
    return eligible;
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

    // The customer making the return. Declared here so the column exists even
    // before the Feature 3 Customer model is merged (see models/index.js).
    customerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "ReturnRequest",
    tableName: "return_requests",
    timestamps: false,
  }
);

ReturnRequest.RETURN_STATUSES = RETURN_STATUSES;
ReturnRequest.RETURN_WINDOW_DAYS = RETURN_WINDOW_DAYS;

module.exports = ReturnRequest;
