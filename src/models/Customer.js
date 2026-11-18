const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Feature 3 - Supplier and Customer Profile Management
// Customer is a kind of BusinessPartner (linked through partnerId).

class Customer extends Model {
  // Find the customer profile with this phone number (class-scope operation,
  // used by alternate flows 2a and 5a). Returns the Customer, or null.
  static async findProfile(phoneNumber) {
    if (phoneNumber === undefined || phoneNumber === null || String(phoneNumber).trim() === "") {
      return null;
    }
    return Customer.findOne({ where: { phoneNumber: String(phoneNumber).trim() } });
  }

  // Inherited from BusinessPartner: the customer's profile as readable text.
  async retrieveInfo() {
    const partner = await this.getPartner();
    return partner ? partner.retrieveInfo() : null;
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

  // Customer reaches out to store staff with a question (Feature 6 - Customer
  // Support, use case 6 step 1). The question is handed over to the employee;
  // Feature 6 records the interaction as a SupportRequest.
  contactEmployee(question) {
    if (question === undefined || question === null || String(question).trim() === "") {
      throw new Error(`Customer ${this.customerId}: a question is required.`);
    }
    return { customerId: this.customerId, question: String(question).trim() };
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
