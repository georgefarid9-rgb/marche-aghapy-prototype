const fs = require("fs");
const path = require("path");

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

// Feature 2 - Dashboard and Reports
const DashboardSummary = require("./DashboardSummary");
const Report = require("./Report");
const InventoryReport = require("./InventoryReport");
const SalesReport = require("./SalesReport");
const ExpiryRestockReport = require("./ExpiryRestockReport");
const ReportFilter = require("./ReportFilter");
const ReportExport = require("./ReportExport");

// Feature 6 - Customer Support (and the shared Sale classes it relies on)
const ComplaintCase = require("./ComplaintCase");
const SupportRequest = require("./SupportRequest");
const ReturnRequest = require("./ReturnRequest");
const Sale = require("./Sale");
const SaleItem = require("./SaleItem");

// Customer is built in Feature 3 (branch feature/supplier-customer-profiles).
// Load it only if it is present, so Feature 6 works before and after that merge.
const Customer = fs.existsSync(path.join(__dirname, "Customer.js"))
  ? require("./Customer")
  : null;

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
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

InventoryRecord.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
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

// ----- Feature 2 - Dashboard and Reports -----

// DashboardSummary 1 <>---- 1..* Report (contains, aggregation)
DashboardSummary.hasMany(Report, {
  foreignKey: "summaryId",
  as: "reports",
});

Report.belongsTo(DashboardSummary, {
  foreignKey: "summaryId",
  as: "dashboardSummary",
});

// Report 1 ---- 0..* ReportFilter (narrowed by)
Report.hasMany(ReportFilter, {
  foreignKey: "reportId",
  as: "filters",
});

ReportFilter.belongsTo(Report, {
  foreignKey: "reportId",
  as: "report",
});

// Report 1 ---- 0..* ReportExport (exported as)
Report.hasMany(ReportExport, {
  foreignKey: "reportId",
  as: "reportExports",
});

ReportExport.belongsTo(Report, {
  foreignKey: "reportId",
  as: "report",
});

// Report <|---- InventoryReport, SalesReport, ExpiryRestockReport (generalization)
Report.hasOne(InventoryReport, { foreignKey: "reportId", as: "inventoryDetails" });
InventoryReport.belongsTo(Report, { foreignKey: "reportId", as: "report" });

Report.hasOne(SalesReport, { foreignKey: "reportId", as: "salesDetails" });
SalesReport.belongsTo(Report, { foreignKey: "reportId", as: "report" });

Report.hasOne(ExpiryRestockReport, { foreignKey: "reportId", as: "expiryRestockDetails" });
ExpiryRestockReport.belongsTo(Report, { foreignKey: "reportId", as: "report" });

// ----- Feature 6 - Customer Support -----

// Sale 1 <>---- 1..* SaleItem (consists of, composition)
Sale.hasMany(SaleItem, {
  foreignKey: "saleId",
  as: "items",
  onDelete: "CASCADE",
});

SaleItem.belongsTo(Sale, {
  foreignKey: { name: "saleId", allowNull: false },
  as: "sale",
});

// Product 1 ---- 0..* SaleItem (refers to)
Product.hasMany(SaleItem, {
  foreignKey: "productId",
  as: "saleItems",
});

SaleItem.belongsTo(Product, {
  foreignKey: { name: "productId", allowNull: false },
  as: "product",
});

// Employee 1 ---- 0..* Sale (rings up)
Employee.hasMany(Sale, {
  foreignKey: "employeeId",
  as: "sales",
});

Sale.belongsTo(Employee, {
  foreignKey: "employeeId",
  as: "employee",
});

// Sale 1 ---- 0..* ReturnRequest (refunds)
Sale.hasMany(ReturnRequest, {
  foreignKey: "saleId",
  as: "returnRequests",
});

ReturnRequest.belongsTo(Sale, {
  foreignKey: { name: "saleId", allowNull: false },
  as: "sale",
});

// Employee 1 ---- 0..* ReturnRequest (processes)
Employee.hasMany(ReturnRequest, {
  foreignKey: "employeeId",
  as: "processedReturns",
});

ReturnRequest.belongsTo(Employee, {
  foreignKey: "employeeId",
  as: "employee",
});

// Employee 1 ---- 0..* SupportRequest (logs)
Employee.hasMany(SupportRequest, {
  foreignKey: "employeeId",
  as: "loggedRequests",
});

SupportRequest.belongsTo(Employee, {
  foreignKey: "employeeId",
  as: "employee",
});

// Employee 1 ---- 0..* ComplaintCase (creates)
Employee.hasMany(ComplaintCase, {
  foreignKey: "employeeId",
  as: "createdCases",
});

ComplaintCase.belongsTo(Employee, {
  foreignKey: "employeeId",
  as: "employee",
});

// StoreOwner 1 ---- 0..* ComplaintCase (reviews escalated cases)
StoreOwner.hasMany(ComplaintCase, {
  foreignKey: "ownerId",
  as: "escalatedCases",
});

ComplaintCase.belongsTo(StoreOwner, {
  foreignKey: "ownerId",
  as: "owner",
});

// Customer associations (only when the Feature 3 Customer model exists).
// The customerId columns exist on the Feature 6 tables either way.
if (Customer) {
  // Customer 1 <>---- 0..* ComplaintCase (has case, aggregation)
  Customer.hasMany(ComplaintCase, { foreignKey: "customerId", as: "complaintCases" });
  ComplaintCase.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

  // Customer 1 ---- 0..* SupportRequest (submits)
  Customer.hasMany(SupportRequest, { foreignKey: "customerId", as: "supportRequests" });
  SupportRequest.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

  // Customer 1 <>---- 0..* ReturnRequest (has return, aggregation)
  Customer.hasMany(ReturnRequest, { foreignKey: "customerId", as: "returnRequests" });
  ReturnRequest.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

  // Customer 1 ---- 0..* Sale (makes)
  Customer.hasMany(Sale, { foreignKey: "customerId", as: "sales" });
  Sale.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });
}

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
  DashboardSummary,
  Report,
  InventoryReport,
  SalesReport,
  ExpiryRestockReport,
  ReportFilter,
  ReportExport,
  ComplaintCase,
  SupportRequest,
  ReturnRequest,
  Sale,
  SaleItem,
  // Present only once the Feature 3 Customer model has been merged.
  ...(Customer ? { Customer } : {}),
};