const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// Customer is a kind of BusinessPartner (linked through partnerId).

class Customer extends Model {
  // Return the customer's full profile: shared BusinessPartner fields
  // plus the Customer-specific fields.
  async retrieveInfo() {
    const partner = await this.getPartner();
    return {
      customerId: this.customerId,
      partnerId: this.partnerId,
      name: partner ? partner.partnerName : null,
      status: partner ? partner.partnerStatus : null,
      phoneNumber: this.phoneNumber,
      email: this.email,
      createdDate: this.createdDate,
    };
  }

  // ----- Placeholders until the shared Sale class exists -----

  // /purchaseHistory is derived from the customer's Sales.
  // Returns an empty list until the Sale class is added to the prototype.
  async listPurchaseHistory() {
    return [];
  }

  // Customer reaches out to store staff (Feature 6 - Customer Support).
  contactEmployee() {
    return null;
  }
}

Customer.init(
  {
    customerId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isEmail: true },
    },

    createdDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // Link to the shared BusinessPartner profile (generalization).
    partnerId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      references: { model: "business_partners", key: "partnerId" },
    },
  },
  {
    sequelize,
    modelName: "Customer",
    tableName: "customers",
    timestamps: false,
  }
);

module.exports = Customer;
