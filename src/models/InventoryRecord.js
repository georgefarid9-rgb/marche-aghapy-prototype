const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");


class InventoryRecord extends Model {
  evaluateInventoryStatus() {
    if (this.quantityOnHand === 0) {
      return "OUT_OF_STOCK";
    }

    if (this.quantityOnHand <= this.reorderLevel) {
      return "LOW_STOCK";
    }

    return "IN_STOCK";
  }

async updateQuantity(newQuantity) {
  if (!Number.isSafeInteger(newQuantity) || newQuantity < 0) {
    throw new Error("Quantity must be a non-negative integer.");
  }

  await this.update({
    quantityOnHand: newQuantity,
    lastUpdated: new Date(),
  });
}

}


InventoryRecord.init(
  {
    inventoryId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    productId: {
  type: DataTypes.STRING,
  allowNull: false,
  unique: true,
},

    quantityOnHand: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

reorderLevel: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 0,
  validate: {
    min: 0,
  },
},


    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "InventoryRecord",
    tableName: "inventory_records",
    timestamps: false,
  }
);

module.exports = InventoryRecord;
