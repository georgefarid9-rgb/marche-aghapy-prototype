const Supplier = require("./Supplier");
const Product = require("./Product");
const InventoryRecord = require("./InventoryRecord");
const RestockAlert = require("./RestockAlert");

// Supplier 1 ---- 0..* Product
Supplier.hasMany(Product, {
  foreignKey: "supplierId",
  as: "products",
});

Product.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

// Product 1 ---- 1 InventoryRecord
Product.hasOne(InventoryRecord, {
  foreignKey: "productId",
  as: "inventoryRecord",
});

InventoryRecord.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});

// InventoryRecord 1 ---- 0..* RestockAlert
InventoryRecord.hasMany(RestockAlert, {
  foreignKey: "inventoryId",
  as: "restockAlerts",
});

RestockAlert.belongsTo(InventoryRecord, {
  foreignKey: "inventoryId",
  as: "inventoryRecord",
});

module.exports = {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
};