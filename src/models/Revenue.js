
const Transaction = require("./Transaction");

class Revenue extends Transaction {
  // Mark this transaction as revenue and associate it with a sale.
  recordSale(sale) {
    this.transactionType = "Revenue";

    if (sale !== undefined && sale !== null) {
      if (!sale.saleId) {
        throw new Error("A valid sale with a saleId is required.");
      }

      // Keep the Sale ID for Ledger.addTransaction().
      this._saleId = sale.saleId;
    }

    return this;
  }

  // Boolean validation required by the accounting contract.
  isValid() {
    return (
      super.isValid() &&
      this.transactionType === "Revenue"
    );
  }
}

module.exports = Revenue;
