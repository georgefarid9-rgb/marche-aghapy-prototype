const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Store extends Model {
  // ----- Feature 5 (Employee Management / Scheduling) -----

  // +listEmployees() : Employee[]
  // Return every employee of this store so the owner can pick one (sequence diagram step 1).
  async listEmployees() {
    return this.getEmployees({ order: [["employeeName", "ASC"]] });
  }

  // +findEmployee(employeeId : String) : Employee
  // Find one employee of this store. Returns null when the employee is not found
  // (alternate flow 3a: the system then displays an error message).
  async findEmployee(employeeId) {
    const [employee] = await this.getEmployees({ where: { employeeId } });
    return employee || null;
  }
}

Store.init(
  {
    storeId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    storeName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // -address[1..1] : String
    address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Store",
    tableName: "stores",
    timestamps: false,
  }
);

module.exports = Store;
