const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const RestockAlert = require("./RestockAlert");
const { guardMethods } = require("../utils/supportGuard");

// Feature 3: shared by notifyDiscrepancy() and notifyUnplannedDelivery().
// Saves one notification per delivery and type in the owner's inbox.
async function storeDeliveryNotification(owner, record, notificationType, message) {
  const suffix = notificationType === "Discrepancy" ? "DISCREPANCY" : "UNPLANNED";
  const [notification] = await sequelize.models.Notification.findOrCreate({
    where: { notificationId: `NTF-${record.recordId}-${suffix}` },
    defaults: {
      notificationType,
      message,
      ownerId: owner.ownerId,
      recordId: record.recordId,
    },
  });
  return notification;
}

class StoreOwner extends Model {
  // ----- Shared with Feature 6 (Customer Support) -----
  // ComplaintCase is built by the Feature 6 team; these work on any complaint object.

  // Review a complaint case escalated to the owner.
  reviewComplaint(complaint) {
    return complaint;
  }

  // Close a complaint case as resolved and save it.
  async resolveCase(complaint) {
    return complaint.setStatus("Resolved");
  }

  // Cases escalated to this owner that are waiting for review, oldest first.
  async listPendingCases() {
    const { ComplaintCase } = require("./index");
    return ComplaintCase.findAll({
      where: { status: "Pending Owner Review", ownerId: this.ownerId },
      order: [["dateCreated", "ASC"], ["caseId", "ASC"]],
    });
  }

  // Open "Missing record" flags raised by employees, oldest first.
  async listMissingRecordFlags() {
    const { SupportRequest } = require("./index");
    return SupportRequest.findAll({
      where: { subject: "Missing record", requestStatus: "Open" },
      order: [["requestDate", "ASC"], ["requestId", "ASC"]],
    });
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

  // Notify the owner that a delivery has a discrepancy (alternate flow 6a):
  // short, over, damaged or expired. Stores the notification in the owner's
  // inbox and returns it. Notifying twice for the same delivery returns the
  // notification already stored.
  async notifyDiscrepancy(recordId) {
    const record = await sequelize.models.PerformanceRecord.findByPk(recordId);
    if (!record) {
      throw new Error(`Performance record ${recordId} does not exist.`);
    }
    if (!record.flagDiscrepancy()) {
      throw new Error(`Performance record ${recordId} has no discrepancy to report.`);
    }
    return storeDeliveryNotification(
      this,
      record,
      "Discrepancy",
      `Delivery ${recordId} from supplier ${record.supplierId}: received ` +
        `${record.quantityReceived} of ${record.quantityOrdered ?? "-"}, condition ${record.conditionRating}.`
    );
  }

  // Notify the owner that a delivery arrived without a purchase order
  // (alternate flow 6b). Stores the notification and returns it.
  async notifyUnplannedDelivery(recordId) {
    const record = await sequelize.models.PerformanceRecord.findByPk(recordId);
    if (!record) {
      throw new Error(`Performance record ${recordId} does not exist.`);
    }
    if (!record.isUnplanned) {
      throw new Error(`Performance record ${recordId} is not an unplanned delivery.`);
    }
    return storeDeliveryNotification(
      this,
      record,
      "Unplanned delivery",
      `Delivery ${recordId} from supplier ${record.supplierId} had no purchase order: ` +
        `${record.quantityReceived} received, condition ${record.conditionRating}.`
    );
  }

  // The owner's unread delivery notifications, oldest first.
  async reviewNotifications() {
    return sequelize.models.Notification.findAll({
      where: { ownerId: this.ownerId, status: "Unread" },
      order: [
        ["sentDate", "ASC"],
        ["notificationId", "ASC"],
      ],
    });
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

guardMethods(StoreOwner, {
  resolveCase: { action: "resolving the complaint case" },
  listPendingCases: { action: "loading the pending cases", retry: true },
  listMissingRecordFlags: { action: "loading the missing-record flags", retry: true },
});

module.exports = StoreOwner;
