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

  // ----- Feature 3 (Supplier & Customer Profile Management) -----

  // Tell the owner that a delivery has a discrepancy (alternate flow 6a):
  // short, over, damaged or expired. Returns the notification.
  async notifyDiscrepancy(recordId) {
    const record = await sequelize.models.PerformanceRecord.findByPk(recordId);
    if (!record) {
      throw new Error(`Performance record ${recordId} does not exist.`);
    }
    if (!record.flagDiscrepancy()) {
      throw new Error(`Performance record ${recordId} has no discrepancy to report.`);
    }
    return {
      ownerId: this.ownerId,
      recordId,
      supplierId: record.supplierId,
      type: "Discrepancy",
      message:
        `Delivery ${recordId} from supplier ${record.supplierId}: received ` +
        `${record.quantityReceived} of ${record.quantityOrdered ?? "-"}, condition ${record.conditionRating}.`,
    };
  }

  // Tell the owner that a delivery arrived without a purchase order
  // (alternate flow 6b). Returns the notification.
  async notifyUnplannedDelivery(recordId) {
    const record = await sequelize.models.PerformanceRecord.findByPk(recordId);
    if (!record) {
      throw new Error(`Performance record ${recordId} does not exist.`);
    }
    if (!record.isUnplanned) {
      throw new Error(`Performance record ${recordId} is not an unplanned delivery.`);
    }
    return {
      ownerId: this.ownerId,
      recordId,
      supplierId: record.supplierId,
      type: "Unplanned delivery",
      message:
        `Delivery ${recordId} from supplier ${record.supplierId} had no purchase order: ` +
        `${record.quantityReceived} received, condition ${record.conditionRating}.`,
    };
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
