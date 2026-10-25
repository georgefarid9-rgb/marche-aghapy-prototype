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

  // /purchaseHistory: the customer's Sales, newest first.
  // Uses the shared Sale model (Customer 1 ---- 0..* Sale, "makes"), which is
  // registered by Feature 6. Until that model is in the prototype, the
  // association does not exist and this returns an empty list.
  async listPurchaseHistory() {
    if (typeof this.getSales !== "function") {
      return [];
    }
    return this.getSales({
      order: [
        ["saleDate", "DESC"],
        ["saleId", "DESC"],
      ],
    });
  }

  // Customer reaches out to store staff (Feature 6 - Customer Support).
  // Placeholder: the class diagram has no Customer-Employee contact record.
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
    hooks: {
      // The linked partner must exist and be a Customer.
      async beforeValidate(customer, options) {
        if (!customer.partnerId) {
          return; // the notNull check on partnerId reports this
        }

        const partner = await sequelize.models.BusinessPartner.findByPk(
          customer.partnerId,
          { transaction: options.transaction }
        );

        if (!partner) {
          throw new Error(
            `Customer ${customer.customerId}: BusinessPartner ${customer.partnerId} does not exist.`
          );
        }
        if (partner.partnerType !== "Customer") {
          throw new Error(
            `Customer ${customer.customerId}: BusinessPartner ${partner.partnerId} has partnerType ` +
              `"${partner.partnerType}", expected "Customer".`
          );
        }
      },
    },
  }
);

module.exports = Customer;
