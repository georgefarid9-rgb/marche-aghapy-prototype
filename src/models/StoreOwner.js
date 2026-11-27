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

  // Close a complaint case as resolved and save it. Only a case escalated to the owner
  // ("Pending Owner Review") can be resolved; the case is re-read first so a decision
  // made in another window is not overwritten.
  async resolveCase(complaint) {
    if (!complaint.isNewRecord) {
      await complaint.reload();
    }
    if (complaint.status !== "Pending Owner Review") {
      throw new Error(
        `Complaint case ${complaint.caseId} is ${complaint.status}, not escalated to the owner, so it cannot be resolved.`
      );
    }
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

  // +editShift(shift : EmployeeShift) : Boolean
  // Sequence diagram: editShift(aShift) -> aShift.updateShift(startTime, endTime)
  // -> validate() -> isValid. The owner sets the new start and/or end time on the
  // shift (in the edit form), then calls editShift(shift). Returns isValid: true when
  // saved, false when the times are invalid (sub-flow 8a: the owner corrects the
  // shift and calls editShift again).
  async editShift(shift) {
    return shift.updateShift(shift.startTime, shift.endTime);
  }

  // +publishSchedule(schedule : Schedule) : void
  // Publish a schedule so employees can see their shifts. Every shift is checked
  // first; if any shift is invalid, nothing is published. Cancelled and completed
  // shifts keep their status.
  async publishSchedule(schedule) {
    const shifts = (await schedule.displayShifts()).filter(
      (shift) => shift.shiftStatus === "Draft" || shift.shiftStatus === "Published"
    );

    for (const shift of shifts) {
      await shift.validate();
    }

    await sequelize.transaction(async (transaction) => {
      for (const shift of shifts) {
        shift.shiftStatus = "Published";
        await shift.save({ transaction });
      }
    });
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
