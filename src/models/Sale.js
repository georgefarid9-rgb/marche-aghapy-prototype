const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Shared sales classes (used by Feature 6 - Customer Support for returns and refunds).
// A Sale is made up of one or more SaleItems (composition).

class Sale extends Model {
  // Add a line to this sale, then recalculate the total.
  // item: { productId, quantity, unitPrice }
  async addItem(item) {
    const SaleItem = sequelize.models.SaleItem;

    const saleItem = await SaleItem.create({
      saleId: this.saleId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    });

    await this.recalculateTotal();
    return saleItem;
  }

  // Remove a line from this sale (by saleItemId or productId), then recalculate.
  // Returns the number of lines removed.
  async removeItem(item) {
    const SaleItem = sequelize.models.SaleItem;

    const where = { saleId: this.saleId };
    if (item.saleItemId !== undefined) {
      where.saleItemId = item.saleItemId;
    } else {
      where.productId = item.productId;
    }

    const removed = await SaleItem.destroy({ where });
    await this.recalculateTotal();
    return removed;
  }

  // Set totalAmount to the sum of quantity x unitPrice over every line, then save.
  async recalculateTotal() {
    const items = await this.getItems();
    const total = items.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0
    );

    // Round to cents to avoid floating point drift such as 10.299999999.
    this.totalAmount = Math.round(total * 100) / 100;
    return this.save();
  }
}

Sale.init(
  {
    saleId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    saleDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    totalAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Cash",
    },

    // The customer on the sale. Optional so a walk-in sale without an account can
    // still be rung up. Declared here so the column exists even before the
    // Feature 3 Customer model is merged (see models/index.js).
    customerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Sale",
    tableName: "sales",
    timestamps: false,
  }
);

module.exports = Sale;
