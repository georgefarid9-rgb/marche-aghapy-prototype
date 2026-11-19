const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// A notification sent to the store owner about a supplier delivery:
//   - "Discrepancy": short, over, damaged or expired delivery (alternate flow 6a)
//   - "Unplanned delivery": a delivery with no purchase order (alternate flow 6b)
// It is stored, so it stays in the owner's inbox until the owner reads it
// (StoreOwner.reviewNotifications(), Notification.markAsRead()).
// One notification per delivery and type: notifying twice returns the same one.

const NOTIFICATION_TYPES = ["Discrepancy", "Unplanned delivery"];
const NOTIFICATION_STATUSES = ["Unread", "Read"];

class Notification extends Model {
  // The owner has read the notification.
  async markAsRead() {
    this.status = "Read";
    return this.save();
  }
}

Notification.init(
  {
    notificationId: {
      type: DataTypes.STRING, // e.g. "NTF-PERF-002-DISCREPANCY"
      primaryKey: true,
      allowNull: false,
    },

    notificationType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [NOTIFICATION_TYPES] },
    },

    message: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },

    sentDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Unread",
      validate: { isIn: [NOTIFICATION_STATUSES] },
    },

    // ownerId (StoreOwner) and recordId (PerformanceRecord) are added by the
    // associations in models/index.js.
  },
  {
    sequelize,
    modelName: "Notification",
    tableName: "notifications",
    timestamps: false,
  }
);

module.exports = Notification;
