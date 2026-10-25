const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// BusinessPartner is the abstract parent of Supplier and Customer.
// It holds the profile fields both share. Each Supplier or Customer row
// points to exactly one BusinessPartner row through partnerId.
//
// partnerName is the AUTHORITATIVE name of a partner. For suppliers,
// Supplier.supplierName is a synchronized copy kept for Feature 1 code:
// whenever a supplier partner is saved, its supplierName is updated to match.

const PARTNER_TYPES = ["Supplier", "Customer"];
const PARTNER_STATUSES = ["Active", "Inactive"];

// Profile fields that updateProfile() is allowed to change.
const EDITABLE_FIELDS = ["partnerName"];

class BusinessPartner extends Model {
  // Update the shared profile fields, then save.
  // Fields that are not editable (e.g. partnerId, partnerType) are ignored.
  // Runs in a transaction so the partner and its Supplier copy of the
  // name are updated together or not at all.
  async updateProfile(changes = {}) {
    for (const field of EDITABLE_FIELDS) {
      if (changes[field] !== undefined) {
        this[field] = changes[field];
      }
    }
    return sequelize.transaction((transaction) => this.save({ transaction }));
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

    // Which subclass this profile belongs to. Fixed once the partner is created,
    // and checked against the linked Supplier or Customer row (see their hooks).
    partnerType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [PARTNER_TYPES] },
    },
  },
  {
    sequelize,
    modelName: "BusinessPartner",
    tableName: "business_partners",
    timestamps: false,
    hooks: {
      // A partner cannot switch between Supplier and Customer after creation,
      // otherwise partnerType would disagree with the linked subtype row.
      beforeUpdate(partner) {
        if (partner.changed("partnerType")) {
          throw new Error(
            `Partner ${partner.partnerId}: partnerType cannot be changed after creation.`
          );
        }
      },

      // Keep Supplier.supplierName equal to the authoritative partnerName.
      async afterSave(partner, options) {
        if (partner.partnerType !== "Supplier") {
          return;
        }
        await sequelize.models.Supplier.update(
          { supplierName: partner.partnerName },
          {
            where: { partnerId: partner.partnerId },
            transaction: options.transaction,
            hooks: false, // this IS the sync; skip the Supplier name check
          }
        );
      },
    },
  }
);

module.exports = BusinessPartner;
