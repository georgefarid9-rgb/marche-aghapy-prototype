const Supplier = require("./Supplier");
const Product = require("./Product");
const InventoryRecord = require("./InventoryRecord");
const RestockAlert = require("./RestockAlert");

// Feature 5 - Employee Management / Scheduling
const StoreOwner = require("./StoreOwner");
const Store = require("./Store");
const Employee = require("./Employee");
const Schedule = require("./Schedule");
const EmployeeShift = require("./EmployeeShift");

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

// ----- Feature 5 - Employee Management / Scheduling -----

// StoreOwner 1 ---- 1..* Store (owns)
StoreOwner.hasMany(Store, {
  foreignKey: "ownerId",
  as: "stores",
});

Store.belongsTo(StoreOwner, {
  foreignKey: "ownerId",
  as: "owner",
});

// Store 1 ---- 1..* Employee (employs)
Store.hasMany(Employee, {
  foreignKey: "storeId",
  as: "employees",
});

Employee.belongsTo(Store, {
  foreignKey: "storeId",
  as: "store",
});

// Store 1 ---- 0..* Schedule (has)
Store.hasMany(Schedule, {
  foreignKey: "storeId",
  as: "schedules",
});

Schedule.belongsTo(Store, {
  foreignKey: "storeId",
  as: "store",
});

// Employee 1 ---- 0..* EmployeeShift (works)
Employee.hasMany(EmployeeShift, {
  foreignKey: "employeeId",
  as: "shifts",
});

EmployeeShift.belongsTo(Employee, {
  foreignKey: "employeeId",
  as: "employee",
});

// Schedule 1 <>---- 0..* EmployeeShift (contains, aggregation)
Schedule.hasMany(EmployeeShift, {
  foreignKey: "scheduleId",
  as: "shifts",
});

EmployeeShift.belongsTo(Schedule, {
  foreignKey: "scheduleId",
  as: "schedule",
});

module.exports = {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
  StoreOwner,
  Store,
  Employee,
  Schedule,
  EmployeeShift,
};