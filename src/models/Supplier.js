const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Supplier extends Model {}

Supplier.init(
  {
    supplierId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    supplierName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    leadTimeDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Supplier",
    tableName: "suppliers",
    timestamps: false,
  }
);

module.exports = Supplier;