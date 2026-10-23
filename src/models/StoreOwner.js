const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const RestockAlert = require("./RestockAlert");

class StoreOwner extends Model {
  // ----- Shared with Feature 6 (Customer Support) -----
  // ComplaintCase is built by the Feature 6 team; these work on any complaint object.

  // Review a complaint case escalated to the owner.
  reviewComplaint(complaint) {
    return complaint;
  }

  // Close a complaint case as resolved.
  resolveCase(complaint) {
    complaint.status = "Resolved";
    return complaint;
  }

  // ----- Shared with Feature 1 (Product & Inventory) -----

  // Review the restock alerts raised by the inventory.
  async reviewRestockAlert() {
    return RestockAlert.findAll();
  }

  // ----- Feature 5 (Employee Management / Scheduling) -----

  // Change the start and end time of an existing shift.
  async editShift(shift, startTime, endTime) {
    return shift.updateShift(startTime, endTime);
  }

  // Publish a schedule so employees can see their shifts.
  async publishSchedule(schedule) {
    const shifts = await schedule.displayShifts();

    for (const shift of shifts) {
      await shift.validate();
      shift.shiftStatus = "Published";
      await shift.save();
    }

    return shifts;
  }
}

StoreOwner.init(
  {
    ownerId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    ownerName: {
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
  },
  {
    sequelize,
    modelName: "StoreOwner",
    tableName: "store_owners",
    timestamps: false,
  }
);

module.exports = StoreOwner;
