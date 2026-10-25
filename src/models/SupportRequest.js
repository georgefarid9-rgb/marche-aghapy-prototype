const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 6 - Customer Support
// A question or request a customer submits. The employee who helps the customer
// logs the interaction against it.

const REQUEST_STATUSES = ["Open", "Logged", "Closed"];

class SupportRequest extends Model {
  // Record the support interaction (use case step 9): the request becomes "Logged".
  async logInteraction() {
    await this.validate();
    this.requestStatus = "Logged";
    return this.save();
  }

  // Append a note to the request, then save it.
  async addNotes(text) {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error(`Support request ${this.requestId}: note text cannot be empty.`);
    }
    this.description = `${this.description}\nNote: ${text.trim()}`;
    return this.save();
  }
}

SupportRequest.init(
  {
    requestId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    requestDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    subject: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { notEmpty: true },
    },

    requestStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Open",
      validate: { isIn: [REQUEST_STATUSES] },
    },

    // customerId and employeeId are added by the associations in models/index.js.
  },
  {
    sequelize,
    modelName: "SupportRequest",
    tableName: "support_requests",
    timestamps: false,
  }
);

SupportRequest.REQUEST_STATUSES = REQUEST_STATUSES;

module.exports = SupportRequest;
