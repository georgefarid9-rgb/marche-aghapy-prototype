
const Transaction = require("./Transaction");

class Expense extends Transaction {
  checkThreshold(budgetThreshold) {
    if (!budgetThreshold || typeof budgetThreshold.isExceeded !== "function") {
      throw new Error("A valid budget threshold is required.");
    }

    return budgetThreshold.isExceeded(this.amount);
  }

  flagOverdue(currentDate = new Date()) {
    if (!this.dueDate) {
      return false;
    }

    return new Date(this.dueDate) < new Date(currentDate);
  }
}

module.exports = Expense;
