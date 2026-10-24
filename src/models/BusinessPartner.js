const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// BusinessPartner is the abstract parent of Supplier and Customer.
// It holds the profile fields both share. Each Supplier or Customer row
// points to exactly one BusinessPartner row through partnerId.

const PARTNER_TYPES = ["Supplier", "Customer"];
const PARTNER_STATUSES = ["Active", "Inactive"];

// Profile fields that updateProfile() is allowed to change.
const EDITABLE_FIELDS = ["partnerName"];

class BusinessPartner extends Model {
  // Update the shared profile fields, then save.
  // Fields that are not editable (e.g. partnerId) are ignored.
  async updateProfile(changes = {}) {
    for (const field of EDITABLE_FIELDS) {
      if (changes[field] !== undefined) {
        this[field] = changes[field];
      }
    }
    return this.save();
  }

  // Switch the partner between Active and Inactive, then save.
  async changeStatus(newStatus) {
    if (!PARTNER_STATUSES.includes(newStatus)) {
      throw new Error(
        `Partner ${this.partnerId}: status must be one of ${PARTNER_STATUSES.join(", ")}.`
      );
    }
    this.partnerStatus = newStatus;
    return this.save();
  }
}

BusinessPartner.init(
  {
    partnerId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    partnerName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },

    partnerStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Active",
      validate: { isIn: [PARTNER_STATUSES] },
    },

    partnerType: {
      type: DataTypes.STRING, // "Supplier" or "Customer"
      allowNull: false,
      validate: { isIn: [PARTNER_TYPES] },
    },
  },
  {
    sequelize,
    modelName: "BusinessPartner",
    tableName: "business_partners",
    timestamps: false,
  }
);

module.exports = BusinessPartner;
