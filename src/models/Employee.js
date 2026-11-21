const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { guardMethods } = require("../utils/supportGuard");

class Employee extends Model {
  // ----- Feature 5 (Employee Management / Scheduling) -----

  // +viewSchedule() : EmployeeShift[]
  // Return this employee's shifts, ordered by date and start time.
  async viewSchedule() {
    return this.getShifts({
      order: [
        ["shiftDate", "ASC"],
        ["startTime", "ASC"],
      ],
    });
  }

  // ----- Shared with Features 3 and 6 (Customer Support) -----
  // The methods below work with Customer (Feature 3) and the Feature 6 / sales classes.
  // They load the models when called, which avoids a circular import with models/index.js.

  // Find a customer account by id. Returns null when the account does not exist.
  async searchAccount(id) {
    const { Customer } = require("./index");
    return Customer.findByPk(id);
  }

  // Help a customer with a question or request: look up the account and gather what
  // the employee needs to review (purchases, returns, complaints, support requests).
  // If the account cannot be found, missingRecord is true so the employee can note the
  // gap and flag it for the owner (use case alternate flow 3a).
  async assistCustomer(customerId) {
    const { Sale, ReturnRequest, ComplaintCase, SupportRequest } = require("./index");

    const customer = await this.searchAccount(customerId);
    const where = { customerId };

    // Employee.customers: remember that this employee has assisted this customer.
    if (customer) {
      await this.addCustomer(customer);
    }

    return {
      customer,
      missingRecord: customer === null,
      purchaseHistory: await Sale.findAll({
        where,
        include: [{ association: "items" }],
        order: [["saleDate", "DESC"]],
      }),
      returnRequests: await ReturnRequest.findAll({ where }),
      complaintCases: await ComplaintCase.findAll({ where }),
      supportRequests: await SupportRequest.findAll({ where }),
    };
  }

  // Open a new complaint case for a customer and save it.
  // details: { category, description, caseId (optional) }
  async createComplaintCase(customerId, details) {
    const { ComplaintCase } = require("./index");
    const generateId = require("../utils/generateId");

    if (!(await this.searchAccount(customerId))) {
      throw new Error(`Customer ${customerId} was not found, so no complaint case was created.`);
    }

    const complaint = ComplaintCase.build({
      caseId: details.caseId || generateId("CASE"),
      category: details.category,
      description: details.description,
      customerId,
      employeeId: this.employeeId,
    });

    return complaint.createCase();
  }

  // Look up a complaint case so the employee can review it. Throws if it does not exist.
  async reviewIssue(caseId) {
    const { ComplaintCase } = require("./index");

    const complaint = await ComplaintCase.findByPk(caseId);
    if (!complaint) {
      throw new Error(`Complaint case ${caseId} was not found.`);
    }
    return complaint;
  }

  // Create a return for `quantity` units of one sale line and decide it straight away.
  // amount = quantity x unit price of the line.
  // Returns { refunded, status, reason, returnId, amount, balanceUpdated }:
  //   refunded       true when the refund was processed, false when it was rejected,
  //   reason         why it was rejected (null when refunded), to show the customer,
  //   balanceUpdated false only when the refund is saved but the ledger balance could not
  //                  be recalculated yet (it is corrected on the next recalculation).
  // Unexpected failures are thrown as a SupportError and nothing is left behind.
  async requestReturn(customerId, saleId, saleItemId, quantity, reason = "Customer return") {
    const { SaleItem, ReturnRequest } = require("./index");
    const generateId = require("../utils/generateId");

    const item = await SaleItem.findByPk(saleItemId);
    if (!item || item.saleId !== saleId) {
      throw new Error(`Sale item ${saleItemId} was not found on sale ${saleId}.`);
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Returned quantity must be a whole number of at least 1.");
    }

    const returnRequest = await ReturnRequest.create({
      returnId: generateId("RET"),
      reason,
      amount: Math.round(quantity * item.unitPrice * 100) / 100,
      status: "Pending",
      quantity,
      saleItemId,
      saleId,
      customerId,
      employeeId: this.employeeId,
    });

    try {
      const refunded = await returnRequest.processRefund();
      return {
        refunded,
        status: returnRequest.status,
        reason: refunded ? null : returnRequest.rejectionReason,
        returnId: returnRequest.returnId,
        amount: returnRequest.amount,
        balanceUpdated: refunded ? returnRequest.ledgerBalanceUpdated !== false : null,
      };
    } catch (error) {
      // The refund failed and was rolled back. Remove the Pending request that was just
      // created so that trying again does not leave a duplicate behind.
      try {
        await returnRequest.reload();
        if (returnRequest.status === "Pending") {
          await returnRequest.destroy();
        }
      } catch (cleanupError) {
        // Best effort only: the original error is the one to report.
      }
      throw error;
    }
  }

  // Hand a complaint case to the store owner (use case alternate flow 5a).
  async escalateComplaint(caseId, ownerId) {
    const complaint = await this.reviewIssue(caseId);
    return complaint.escalateToOwner(ownerId);
  }

  // Flag a missing customer record for the owner (use case alternate flow 3a).
  // The request is saved without a customer when the customer does not exist.
  async flagMissingRecord(customerId, note) {
    const { SupportRequest } = require("./index");
    const generateId = require("../utils/generateId");

    if (typeof note !== "string" || note.trim().length === 0) {
      throw new Error("A note is required to flag a missing record.");
    }

    const customer = await this.searchAccount(customerId);
    return SupportRequest.create({
      requestId: generateId("REQ"),
      subject: "Missing record",
      description: `Missing record for ${customerId}: ${note.trim()}`,
      requestStatus: "Open",
      customerId: customer ? customerId : null,
      employeeId: this.employeeId,
    });
  }

  // Open a new support request for a customer.
  async openSupportRequest(customerId, subject, description) {
    const { SupportRequest } = require("./index");
    const generateId = require("../utils/generateId");

    if (!(await this.searchAccount(customerId))) {
      throw new Error(`Customer ${customerId} was not found, so no support request was created.`);
    }

    return SupportRequest.create({
      requestId: generateId("REQ"),
      subject,
      description,
      requestStatus: "Open",
      customerId,
      employeeId: this.employeeId,
    });
  }

  // Add a note to a support request and log the interaction (use case steps 8-9).
  async addNotes(requestId, text) {
    const { SupportRequest } = require("./index");

    const request = await SupportRequest.findByPk(requestId);
    if (!request) {
      throw new Error(`Support request ${requestId} was not found.`);
    }
    await request.addNotes(text);
    return request.logInteraction();
  }

  // Add a sold product to a sale. item: { saleId, productId, quantity, unitPrice }
  async addSoldProduct(item) {
    const { Sale } = require("./index");

    const sale = await Sale.findByPk(item.saleId);
    if (!sale) {
      throw new Error(`Sale ${item.saleId} was not found.`);
    }
    return sale.addItem(item);
  }

  // Remove a sold product from a sale. item: { saleId, saleItemId or productId }
  async removeSoldProduct(item) {
    const { Sale } = require("./index");

    const sale = await Sale.findByPk(item.saleId);
    if (!sale) {
      throw new Error(`Sale ${item.saleId} was not found.`);
    }
    return sale.removeItem(item);
  }
}

Employee.init(
  {
    employeeId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    employeeName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // -phoneNumber[1..1] : String
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Employee",
    tableName: "employees",
    timestamps: false,
  }
);

// retry: only read-only methods are retried automatically when the database is busy.
guardMethods(Employee, {
  searchAccount: { action: "looking up the customer account", retry: true },
  assistCustomer: { action: "loading the customer records", retry: true },
  createComplaintCase: { action: "creating the complaint case" },
  reviewIssue: { action: "loading the complaint case", retry: true },
  requestReturn: { action: "processing the return" },
  escalateComplaint: { action: "escalating the complaint" },
  flagMissingRecord: { action: "flagging the missing record" },
  openSupportRequest: { action: "opening the support request" },
  addNotes: { action: "adding the note to the support request" },
  addSoldProduct: { action: "adding the sold product" },
  removeSoldProduct: { action: "removing the sold product" },
});

module.exports = Employee;
