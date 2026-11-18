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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// True when the value is missing or only spaces.
function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

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

  // Check submitted profile details before they are saved (method contract C3-04,
  // method specification MS3-04; use case 3: 3a Validate profile information,
  // subflow 2S.3, alternate flow 5a). Returns true when the details can be saved.
  // It never saves anything: the stored profile is left unchanged.
  // Works for a saved partner (update) and for an unsaved one built with
  // BusinessPartner.build({ partnerType }) (new profile).
  async validateProfile(changes) {
    if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
      return false;
    }
    const has = (field) => Object.prototype.hasOwnProperty.call(changes, field);

    if (has("partnerName") && isBlank(changes.partnerName)) {
      return false;
    }
    if (has("partnerType") && changes.partnerType !== this.partnerType) {
      return false;
    }
    if (has("partnerStatus") && !PARTNER_STATUSES.includes(changes.partnerStatus)) {
      return false;
    }

    let existingProfile = null;

    if (this.partnerType === "Supplier") {
      if (
        has("leadTimeDays") &&
        changes.leadTimeDays !== null &&
        !(Number.isInteger(changes.leadTimeDays) && changes.leadTimeDays >= 0)
      ) {
        return false;
      }
      if (has("partnerName")) {
        existingProfile = await sequelize.models.Supplier.findProfile(changes.partnerName);
      }
    } else {
      if (has("email") && !isBlank(changes.email) && !EMAIL_PATTERN.test(changes.email)) {
        return false;
      }
      if (has("phoneNumber") && isBlank(changes.phoneNumber)) {
        return false;
      }
      if (has("phoneNumber")) {
        existingProfile = await sequelize.models.Customer.findProfile(changes.phoneNumber);
      }
    }

    // 5a: the same supplier name or customer phone number cannot belong to two profiles.
    if (existingProfile && existingProfile.partnerId !== this.partnerId) {
      return false;
    }
    return true;
  }

  // Return the partner's profile as readable text: the shared fields plus the
  // fields of its Supplier or Customer profile. Moved up from Customer so that
  // both Supplier and Customer use it (class diagram: +retrieveInfo(): String).
  async retrieveInfo() {
    const lines = [
      `Partner ID: ${this.partnerId}`,
      `Name: ${this.partnerName}`,
      `Type: ${this.partnerType}`,
      `Status: ${this.partnerStatus}`,
    ];

    if (this.partnerType === "Supplier") {
      const supplier = await this.getSupplierProfile();
      if (supplier) {
        lines.push(
          `Supplier ID: ${supplier.supplierId}`,
          `Contact information: ${supplier.contactInformation ?? "-"}`,
          `Lead time (days): ${supplier.leadTimeDays ?? "-"}`,
          `Payment terms: ${supplier.paymentTerms ?? "-"}`
        );
      }
    } else {
      const customer = await this.getCustomerProfile();
      if (customer) {
        lines.push(
          `Customer ID: ${customer.customerId}`,
          `Phone number: ${customer.phoneNumber ?? "-"}`,
          `Email: ${customer.email ?? "-"}`,
          `Created: ${customer.createdDate}`
        );
      }
    }
    return lines.join("\n");
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
