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

  // ----- Shared with Features 3, 4 and 6 -----
  // Customer, ComplaintCase and SaleItem are built by the other teams.
  // These methods are placeholders until those classes exist in the prototype.

  // Find a customer account by id (Customer class: Feature 3).
  searchAccount(id) {
    return null;
  }

  // Help a customer with a question or request (Feature 6).
  assistCustomer() {}

  // Open a new complaint case for a customer (ComplaintCase class: Feature 6).
  createComplaintCase() {
    return null;
  }

  // Add a sold product to the current sale (SaleItem class: shared sales).
  addSoldProduct(item) {}

  // Remove a sold product from the current sale.
  removeSoldProduct(item) {}
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
