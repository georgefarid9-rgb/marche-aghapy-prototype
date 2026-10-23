const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Product extends Model {}

Product.init(
  {
    productId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    productName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    category: {
  type: DataTypes.STRING,
  allowNull: true,
},
  },
  {
    sequelize,
    modelName: "Product",
    tableName: "products",
    timestamps: false,
  }
);

module.exports = Product;