const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Employee extends Model {
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

  // Find a customer account by id. Returns null when the account does not exist,
  // or when the Customer model (Feature 3) has not been merged yet.
  async searchAccount(id) {
    const { Customer } = require("./index");
    if (!Customer) {
      return null;
    }
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

    const complaint = ComplaintCase.build({
      caseId: details.caseId || generateId("CASE"),
      category: details.category,
      description: details.description,
      customerId,
      employeeId: this.employeeId,
    });

    return complaint.createCase();
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

    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
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

module.exports = Employee;
