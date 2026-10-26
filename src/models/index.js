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

// Feature 3 - Supplier and Customer Profile Management
const BusinessPartner = require("./BusinessPartner");
const Customer = require("./Customer");
const PerformanceRecord = require("./PerformanceRecord");

// Feature 6 - Customer Support (and the shared Sale classes it relies on)
const ComplaintCase = require("./ComplaintCase");
const SupportRequest = require("./SupportRequest");
const ReturnRequest = require("./ReturnRequest");
const Sale = require("./Sale");
const SaleItem = require("./SaleItem");


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

// ----- Feature 3 - Supplier and Customer Profile Management -----

// BusinessPartner <|---- Supplier, Customer (generalization)
BusinessPartner.hasOne(Supplier, { foreignKey: "partnerId", as: "supplierProfile" });
Supplier.belongsTo(BusinessPartner, { foreignKey: "partnerId", as: "partner" });

BusinessPartner.hasOne(Customer, { foreignKey: "partnerId", as: "customerProfile" });
Customer.belongsTo(BusinessPartner, { foreignKey: "partnerId", as: "partner" });

// Supplier 1 <>---- 0..* PerformanceRecord (accumulates, aggregation)
// Required: a record cannot exist without its Supplier, and a Supplier with
// delivery history cannot be deleted.
Supplier.hasMany(PerformanceRecord, {
  foreignKey: { name: "supplierId", allowNull: false },
  as: "performanceRecords",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

PerformanceRecord.belongsTo(Supplier, {
  foreignKey: { name: "supplierId", allowNull: false },
  as: "supplier",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// Employee 1 ---- 0..* PerformanceRecord (records)
// Required: every record names the Employee who recorded it.
Employee.hasMany(PerformanceRecord, {
  foreignKey: { name: "employeeId", allowNull: false },
  as: "performanceRecords",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

PerformanceRecord.belongsTo(Employee, {
  foreignKey: { name: "employeeId", allowNull: false },
  as: "recordedBy",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});


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

// Customer (Feature 3) associations. A case, request or return always belongs to a
// real Customer; a Sale may have none (walk-in). Customers with records cannot be deleted.

// Customer 1 <>---- 0..* ComplaintCase (has case, aggregation)
Customer.hasMany(ComplaintCase, {
  foreignKey: { name: "customerId", allowNull: false },
  as: "complaintCases",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

ComplaintCase.belongsTo(Customer, {
  foreignKey: { name: "customerId", allowNull: false },
  as: "customer",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// Customer 1 ---- 0..* SupportRequest (submits)
Customer.hasMany(SupportRequest, {
  foreignKey: { name: "customerId", allowNull: false },
  as: "supportRequests",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

SupportRequest.belongsTo(Customer, {
  foreignKey: { name: "customerId", allowNull: false },
  as: "customer",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// Customer 1 <>---- 0..* ReturnRequest (has return, aggregation)
Customer.hasMany(ReturnRequest, {
  foreignKey: { name: "customerId", allowNull: false },
  as: "returnRequests",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

ReturnRequest.belongsTo(Customer, {
  foreignKey: { name: "customerId", allowNull: false },
  as: "customer",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// Customer 1 ---- 0..* Sale (makes). Customer.listPurchaseHistory() (Feature 3)
// reads this association through getSales().
Customer.hasMany(Sale, {
  foreignKey: "customerId",
  as: "sales",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

Sale.belongsTo(Customer, {
  foreignKey: "customerId",
  as: "customer",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

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
  BusinessPartner,
  Customer,
  PerformanceRecord,
  ComplaintCase,
  SupportRequest,
  ReturnRequest,
  Sale,
  SaleItem,
};