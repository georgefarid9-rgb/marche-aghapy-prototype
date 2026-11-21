
const Transaction = require("./Transaction");

class Revenue extends Transaction {
  // Mark this transaction as revenue from a sale.
  recordSale() {
    this.transactionType = "Revenue";
    return this;
  }

  // UML requirement: validate() returns a Boolean.
  validate() {
    try {
      this.validateTransaction();

      if (this.transactionType !== "Revenue") {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = Revenue;
