
const Transaction = require("./Transaction");

class Revenue extends Transaction {
  recordSale() {
    this.transactionType = "Revenue";
    return this;
  }
}

module.exports = Revenue;
