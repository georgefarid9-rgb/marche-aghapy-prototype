const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 6 - Customer Support
// A complaint raised by a customer and opened by an employee.
// If the employee cannot resolve it, it is escalated to the store owner.

const CASE_STATUSES = ["Open", "Pending Owner Review", "Resolved"];

class ComplaintCase extends Model {
  // Open the case: check it, make sure it starts as "Open", then save it.
  async createCase() {
    if (!this.status) {
      this.status = "Open";
    }
    await this.validate();
    return this.save();
  }

  // Change the status of the case, then save it.
  async setStatus(status) {
    if (!CASE_STATUSES.includes(status)) {
      throw new Error(
        `Complaint case ${this.caseId}: status must be one of ${CASE_STATUSES.join(", ")}.`
      );
    }
    this.status = status;
    return this.save();
  }

  // Hand the case to the store owner (use case alternate flow 5a).
  // The case is marked "Pending Owner Review". If no owner id is given, the owner
  // of the store where the creating employee works is used.
  async escalateToOwner(ownerId) {
    if (this.status === "Resolved") {
      throw new Error(`Complaint case ${this.caseId} is already Resolved and cannot be escalated.`);
    }

    let targetOwnerId = ownerId;

    if (!targetOwnerId && this.employeeId) {
      const employee = await this.getEmployee();
      const store = employee ? await employee.getStore() : null;
      targetOwnerId = store ? store.ownerId : null;
    }

    this.ownerId = targetOwnerId || null;
    this.status = "Pending Owner Review";
    return this.save();
  }
}

ComplaintCase.init(
  {
    caseId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    category: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },

    description: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Open",
      validate: { isIn: [CASE_STATUSES] },
    },

    dateCreated: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // customerId, employeeId (and ownerId for cases) are added by the associations in
    // models/index.js.
  },
  {
    sequelize,
    modelName: "ComplaintCase",
    tableName: "complaint_cases",
    timestamps: false,
  }
);

ComplaintCase.CASE_STATUSES = CASE_STATUSES;

module.exports = ComplaintCase;
