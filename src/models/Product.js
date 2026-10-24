const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");


class Product extends Model {
  validateProductInformation() {
    return (
      typeof this.productId === "string" &&
      this.productId.trim().length > 0 &&
      typeof this.productName === "string" &&
      this.productName.trim().length > 0
    );
  }
}


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