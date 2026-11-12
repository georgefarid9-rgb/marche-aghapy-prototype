
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

// Convert the data string into product information.
function parseProductData(data) {
  if (typeof data !== "string") {
    throw new Error("Product data must be a JSON string.");
  }

  let productData;

  try {
    productData = JSON.parse(data);
  } catch {
    throw new Error("Product data is not valid JSON.");
  }

  if (
    !productData ||
    typeof productData !== "object" ||
    Array.isArray(productData)
  ) {
    throw new Error("Product data must contain an object.");
  }

  return productData;
}

class Product extends Model {
  // Check the current product or proposed changes.
  validateProductInformation(data) {
    let productData = this.get({ plain: true });

    if (data !== undefined) {
      try {
        productData = {
          ...productData,
          ...parseProductData(data),
        };
      } catch {
        return false;
      }
    }

    return (
      typeof productData.productId === "string" &&
      productData.productId.trim().length > 0 &&
      typeof productData.productName === "string" &&
      productData.productName.trim().length > 0 &&
      (productData.description == null ||
        typeof productData.description === "string") &&
      (productData.category == null ||
        typeof productData.category === "string")
    );
  }

  // Save a newly created product.
  async recordNewProduct(data) {
    if (!this.isNewRecord) {
      throw new Error("This product already exists.");
    }

    const productData = parseProductData(data);

    if (!this.validateProductInformation(data)) {
      throw new Error("Invalid product information.");
    }

    const fields = [
      "productId",
      "productName",
      "description",
      "category",
      "supplierId",
    ];

    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(productData, field)) {
        this.set(field, productData[field]);
      }
    }

    await this.save();
  }

  // Update an existing product's information.
  async updateProductInformation(data) {
    if (this.isNewRecord) {
      throw new Error("The product must be saved first.");
    }

    const productData = parseProductData(data);

    if (!this.validateProductInformation(data)) {
      throw new Error("Invalid product information.");
    }

    if (
      Object.prototype.hasOwnProperty.call(productData, "productId") &&
      productData.productId !== this.productId
    ) {
      throw new Error("Product ID cannot be changed.");
    }

    const changes = {};

    const fields = [
      "productName",
      "description",
      "category",
      "supplierId",
    ];

    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(productData, field)) {
        changes[field] = productData[field];
      }
    }

    await this.update(changes);
  }

  // Return the product object.
  getProductInformation() {
    return this;
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
