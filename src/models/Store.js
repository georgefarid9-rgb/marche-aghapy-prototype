const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Store extends Model {}

Store.init(
  {
    storeId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    storeName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Store",
    tableName: "stores",
    timestamps: false,
  }
);

module.exports = Store;
