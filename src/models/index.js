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

// Feature 4 - Accounting
const Transaction = require("./Transaction");
const Revenue = require("./Revenue");
const Expense = require("./Expense");
const Ledger = require("./Ledger");
const BudgetThreshold = require("./BudgetThreshold");
const FinancialReport = require("./FinancialReport");

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


 // ----- Feature 4 - Accounting -----

// Store maintains its ledger
Store.hasOne(Ledger, {
  foreignKey: "storeId",
  as: "ledger",
});

Ledger.belongsTo(Store, {
  foreignKey: "storeId",
  as: "store",
});


Ledger.hasMany(FinancialReport, {
  foreignKey: "ledgerId",
  as: "financialReports",
});

FinancialReport.belongsTo(Ledger, {
  foreignKey: "ledgerId",
  as: "ledger",
});


// Ledger contains transactions
Ledger.hasMany(Transaction, {
  foreignKey: "ledgerId",
  as: "transactions",
});

Transaction.belongsTo(Ledger, {
  foreignKey: "ledgerId",
  as: "ledger",
});

Transaction.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

Transaction.belongsTo(BudgetThreshold, {
  foreignKey: "budgetThresholdId",
  as: "budgetThreshold",
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


Report.hasOne(FinancialReport, {
  foreignKey: "reportId",
  as: "financialDetails",
});

FinancialReport.belongsTo(Report, {
  foreignKey: "reportId",
  as: "report",
});

Report.hasOne(ExpiryRestockReport, { foreignKey: "reportId", as: "expiryRestockDetails" });
ExpiryRestockReport.belongsTo(Report, { foreignKey: "reportId", as: "report" });

module.exports = {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
  Transaction,
  Revenue,
  Expense,
  Ledger,
  BudgetThreshold,
  StoreOwner,
  Store,
  Employee,
  Schedule,
  EmployeeShift,
  DashboardSummary,
  Report,
  FinancialReport,
  InventoryReport,
  SalesReport,
  ExpiryRestockReport,
  ReportFilter,
  ReportExport,
};