# Marché Aghapy Store Management System — Prototype

**Course:** BTM 495 — Systems Analysis and Design
**Project:** Marché Aghapy Store Management System
**Repository:** [marche-aghapy-prototype](https://github.com/georgefarid9-rgb/marche-aghapy-prototype)

## Overview

This repository contains a Node.js and SQLite prototype for the proposed Marché Aghapy Store Management System. It demonstrates Git/GitHub version control, a relational database, object-oriented domain classes and attributes, associations between classes, and selected class methods.

The repository includes models for the following features:

- **Feature 1 — Product and Inventory Management:** Product records, suppliers, inventory quantities, expiry dates, reorder levels, and restock-alert records.
- **Feature 2 — Dashboard and Reports:** Dashboard summaries, inventory and sales reports, report filters, exports, and report-specific data models.
- **Feature 3 — Supplier and Customer Profile Management:** Shared business-partner profiles, supplier and customer profiles, and supplier delivery-performance records.
- **Feature 4 — Accounting:** Revenue and expense records, financial transactions, ledger balances, budget thresholds, and financial reports.
- **Feature 5 — Employee Management / Scheduling:** Store owners, stores, employees, schedules, and shifts.
- **Feature 6 — Customer Support:** Complaint cases, support requests, return requests and refunds, and the shared sales classes they rely on.

These are **prototype models**, not a complete production-ready store application. Each feature has a different level of implementation and verification. Full cross-feature integration must be confirmed through testing.

## Technologies

- **Node.js / JavaScript** — application and model code
- **Sequelize v6** — object-relational mapping (ORM) and model associations
- **SQLite** — local relational database
- **Git / GitHub** — source control and collaboration

## Getting Started

From the repository root, install the dependencies:

```bash
npm install
```

Test the database connection:

```bash
npm run db:test
```

### Initial setup — only for a new or disposable database

**Warning:** `npm run db:setup` executes `sequelize.sync({ force: true })`. It drops and recreates existing tables, deleting records already stored in those tables. **Do not run it against a database containing information you want to keep.**

For a brand-new or intentionally reset disposable local database:

```bash
npm run db:setup
npm run db:seed
```

The seed script creates fixed sample identifiers. Running `npm run db:seed` repeatedly against the same populated database can fail with duplicate-key errors.

### Existing database — preserve your data

If your local SQLite database already contains inventory data, do not rerun `npm run db:setup` or the full seed script just to update the inventory schema. Back up the database first and verify which columns and constraints are already present before running relevant inventory migration scripts:

```bash
node scripts/addProductCategory.js
node scripts/addUniqueInventoryProductIndex.js
node scripts/enforceInventoryProductNotNull.js
node scripts/addInventoryReorderLevel.js
```

These scripts were added for upgrading an older Feature 1 database. They are not required after a fresh setup using the current models. The `enforceInventoryProductNotNull.js` script rebuilds the inventory table and creates a database backup; use it cautiously, particularly on shared or populated databases.

For existing databases that need Feature 3 or Feature 6 schema changes, see the corresponding migration instructions below.

## Feature 1 — Product and Inventory Management

### Purpose

The subsystem records products, manages inventory quantities and expiry dates, identifies low-stock conditions using a reorder threshold, and maintains associations with suppliers and restock alerts.

### Domain classes and attributes

#### Supplier (`src/models/Supplier.js`)

- `supplierId` — primary key
- `supplierName` — supplier name
- `leadTimeDays` — supplier lead time in days (optional)

Feature 3 adds `contactInformation`, `paymentTerms`, and `partnerId` to Supplier. See the Feature 3 section.

#### Product (`src/models/Product.js`)

- `productId` — primary key
- `productName` — required product name
- `description` — optional description
- `category` — optional product category
- `supplierId` — supplier foreign key established through the Sequelize association

#### InventoryRecord (`src/models/InventoryRecord.js`)

- `inventoryId` — primary key
- `productId` — required, unique foreign key to Product
- `quantityOnHand` — current inventory quantity; defaults to `0`
- `reorderLevel` — reorder threshold; defaults to `0`
- `expiryDate` — optional expiration date
- `lastUpdated` — last recorded update timestamp

#### RestockAlert (`src/models/RestockAlert.js`)

- `alertId` — primary key
- `reorderInformation` — restocking message
- `inventoryId` — inventory-record foreign key established through the Sequelize association

### Class relationships

- One Supplier can be associated with zero or many Products.
- A Product can reference a Supplier.
- Each InventoryRecord must reference one Product.
- Each Product can have **at most one** InventoryRecord, enforced by a unique `productId` foreign key.
- One InventoryRecord can be associated with zero or many RestockAlerts.

The Product–InventoryRecord foreign key uses `ON DELETE RESTRICT` and `ON UPDATE CASCADE`. The database constraints were verified against the local inventory database during Feature 1 development.

### Implemented optional class methods

**`Product.validateProductInformation()`**

- Returns `true` if `productId` and `productName` are nonempty strings; otherwise returns `false`.
- Runs when explicitly called; it is not automatically attached to Sequelize's save lifecycle.

**`InventoryRecord.evaluateInventoryStatus()`**

- Returns `OUT_OF_STOCK` when `quantityOnHand` is `0`.
- Returns `LOW_STOCK` when quantity is above zero but less than or equal to `reorderLevel`.
- Returns `IN_STOCK` otherwise.
- Evaluates the current model instance; it does not create alerts automatically.

**`InventoryRecord.updateQuantity(newQuantity)`**

- Rejects negative, fractional, or unsafe-integer quantities.
- Uses the model's update operation to set `quantityOnHand` and `lastUpdated`.
- Business logic has been tested with simulated persistence; a full database write-and-read test remains pending.

### Sample inventory data

The seed script defines the following example:

| Item | Sample value |
|---|---|
| Product ID | `PROD-001` |
| Product | Foul Medames |
| Category | Canned Foods |
| Supplier | Sample Supplier (`SUP-001`) |
| Inventory record | `INV-001` |
| Quantity on hand | 20 |
| Reorder level | 15 |
| Expiry date | 2027-03-30 |

With these sample values, `evaluateInventoryStatus()` returns `IN_STOCK`.

The seed script also inserts `ALERT-001` as a **manual sample restock alert**. Its presence does not mean the current stock level triggered an alert.

### Verify Feature 1

```bash
npm run prototype:check
```

This script retrieves `PROD-001` together with its Supplier, InventoryRecord, and RestockAlert associations. A successful run prints:

```text
Prototype verification successful.
```

It is a prototype retrieval check, not a comprehensive automated test suite.

### Feature 1 limitations

- Restock alerts are modeled and can be stored, but automatic alert generation has not been implemented.
- Stock status is evaluated on demand and is not automatically persisted as a separate status field.
- Only selected optional methods have been implemented; not every operation shown in the broader UML design is included.
- Full database persistence testing of `updateQuantity()` remains pending.

## Feature 2 — Dashboard and Reports

### Purpose

The subsystem gives the store owner a dashboard summary of sales, low stock, near-expiry products, and restocking. It also supports inventory, sales, and expiry/restock report models, report filters, and export records.

### Domain classes and attributes

- **DashboardSummary** — `summaryId`, `summaryDate`, `lastRefreshed`, `totalSalesToday`, `lowStockCount`, `nearExpiryCount`, `pendingRestockCount`, `dataStatus` (defaults to `Available`)
- **Report** (abstract) — `reportId`, `reportType` (`inventory`, `sales`, or `expiry-restock`), `generatedDate` (set automatically), `periodStart`, `periodEnd`, `reportStatus` (defaults to `Generated`), `summaryId`
- **InventoryReport** — `reportId`, `totalProducts`, `totalQuantityOnHand`, `lowStockCount`
- **SalesReport** — `reportId`, `totalSalesAmount`, `numberOfSales`, `averageSaleAmount` (derived: calculated on read, not stored)
- **ExpiryRestockReport** — `reportId`, `expiryWindowDays` (defaults to 7), `nearExpiryCount`, `restockCount`
- **ReportFilter** — `filterId`, `reportId`, `startDate`, `endDate`, `productId`, `category`
- **ReportExport** — `exportId`, `reportId`, `exportDate` (set automatically), `exportFormat`, `fileName`

### Class relationships

- One DashboardSummary contains one or many Reports (aggregation through `reports.summaryId`).
- Report is the generalization of InventoryReport, SalesReport, and ExpiryRestockReport. It is implemented as a parent table: each subclass row shares its `reportId` with one Report row, and `reportType` records which kind of report it is.
- One Report can have zero or many ReportFilters.
- One Report can have zero or many ReportExports.

### Verify Feature 2

The check creates its own test records (IDs starting with `VR-`) and deletes them afterward, so it does not need seed data and can be run more than once. Run it against a fresh test database so it matches the current models.

For a Bash-compatible shell:

```bash
SQLITE_PATH=database/reports-test.sqlite npm run db:setup
SQLITE_PATH=database/reports-test.sqlite npm run reports:check
```

For PowerShell, set the environment variable separately:

```powershell
$env:SQLITE_PATH = "database\reports-test.sqlite"
npm.cmd run db:setup
npm.cmd run reports:check
```

**Important:** Confirm that the selected test database file does not already exist before running database setup. The setup script can drop and recreate tables in the selected database.

The verification script checks the following:

1. Foreign keys exist in the SQLite schema, and foreign-key enforcement is enabled.
2. A DashboardSummary, all three report types, a ReportFilter, and a ReportExport can be created.
3. Records can be read back with the expected default values.
4. Associations work in both directions: summary ↔ reports, report ↔ filters, report ↔ exports, and report ↔ subclass details.
5. The derived `averageSaleAmount` is correct, including when there are no sales.
6. Invalid data is rejected, including records that reference missing reports or summaries and records with missing required fields.

Any failed check prints `Report verification FAILED` and ends with exit code `1`. A successful run is expected to end with:

```text
Report verification successful (24 checks passed).
```

The reported check count should be confirmed against the actual script version.

### Feature 2 limitations — methods not yet implemented

The class attributes and associations are present. The following operations from the Feature 2 class diagram are optional for this prototype and have not been implemented yet:

| Class | Operations not yet implemented |
|---|---|
| Report | `generateReport()`, `retrieveReportData()`, `applyFilter(filter)`, `hasData()`, `exportReport(format)` |
| InventoryReport | `retrieveReportData()`, `identifyLowStock()` |
| SalesReport | `retrieveReportData()`, `summarizeSales(start, end)` |
| ExpiryRestockReport | `retrieveReportData()`, `identifyNearExpiry()`, `identifyRestockNeeds()` |
| DashboardSummary | `refreshSummary()`, `flagUnavailableData()`, `getAvailableReportTypes()` |
| ReportFilter | `validateCriteria()` |
| ReportExport | `createExportFile()` |

As a result:

- Report figures (totals and counts) are stored values; they are not yet calculated automatically from inventory and sales records.
- The dashboard's derived counts are stored values and are not refreshed automatically.
- Exports are recorded (format, file name, date), but no actual PDF, Excel, or CSV file is produced.
- SalesReport requires the shared Sale model and integration with real sales data to report actual sales.
- The implemented derived logic includes the `SalesReport.averageSaleAmount` attribute.

## Feature 3 — Supplier and Customer Profile Management

### Purpose

The subsystem keeps one shared profile for every business partner of the store (suppliers and customers), stores the details specific to each kind of partner, and records supplier delivery performance so the owner can compare suppliers.

### Domain classes and attributes

#### BusinessPartner (abstract) (`src/models/BusinessPartner.js`)

- `partnerId` — primary key
- `partnerName` — required, non-empty name; the **authoritative** name of the partner
- `partnerStatus` — `Active` (default) or `Inactive`
- `partnerType` — `Supplier` or `Customer`; fixed after creation

#### Supplier (`src/models/Supplier.js`) — fields added by Feature 3

- `contactInformation` — optional supplier contact details
- `paymentTerms` — optional payment terms (for example, `Net 30`)
- `partnerId` — unique foreign key to BusinessPartner; nullable so supplier rows created before Feature 3 still work (the migration below links them)

The Feature 1 fields (`supplierId`, `supplierName`, `leadTimeDays`) are retained. For a supplier linked to a BusinessPartner, `supplierName` is a synchronized copy of `partnerName`.

#### Customer (`src/models/Customer.js`)

- `customerId` — primary key
- `phoneNumber` — optional
- `email` — optional, validated as an email address
- `createdDate` — date the profile was created; defaults to today
- `partnerId` — required, unique foreign key to BusinessPartner

#### PerformanceRecord (`src/models/PerformanceRecord.js`)

- `recordId` — primary key
- `deliveryDate` — date the delivery actually arrived
- `expectedDeliveryDate` — date the delivery was due; needed to calculate the delivery delay
- `quantityOrdered` — at least 1
- `quantityReceived` — 0 or more
- `conditionRating` — `Good` (default), `Acceptable`, or `Poor`
- `deliveryDelay` and `fillRate` — derived attributes, computed on read and not stored
- `supplierId` — required foreign key to Supplier
- `employeeId` — required foreign key to Employee who recorded the delivery

### Class relationships

- BusinessPartner is the generalization of Supplier and Customer. It is implemented as a parent table: each Supplier or Customer row points to one BusinessPartner row through a unique `partnerId`, following the same pattern as Report and its report subclasses.
- One Supplier accumulates zero or many PerformanceRecords. Every record must have a Supplier; a Supplier with records cannot be deleted (`ON DELETE RESTRICT`).
- One Employee records zero or many PerformanceRecords. Every record must name an Employee (`ON DELETE RESTRICT`).
- One Customer makes zero or many Sales. This association is registered by Feature 6, which provides the shared Sale model.

### Business rules enforced in the models

| Rule | Where it is enforced |
|---|---|
| `partnerName` is the one authoritative name. Saving a supplier partner copies its name to `Supplier.supplierName`; a new supplier takes its name from its partner. | `BusinessPartner` `afterSave` hook, `Supplier` `beforeValidate` hook |
| `supplierName` cannot be set to a different name directly; use `BusinessPartner.updateProfile()`. | `Supplier` `beforeValidate` hook |
| A Supplier must link to a partner of type `Supplier`, and a Customer to a partner of type `Customer`. | `Supplier` and `Customer` `beforeValidate` hooks |
| `partnerType` cannot change after the partner is created. | `BusinessPartner` `beforeUpdate` hook |
| A PerformanceRecord needs an existing Supplier and Employee. | `allowNull: false` and foreign-key constraints |

### Implemented class methods

**`BusinessPartner.updateProfile(changes)`**

- Updates the editable profile field (`partnerName`) and saves, in a transaction that also updates the linked Supplier's `supplierName`.
- Fields that are not editable, such as `partnerId` and `partnerType`, are ignored.

**`BusinessPartner.changeStatus(newStatus)`**

- Sets the status to `Active` or `Inactive` and saves.
- Any other value is rejected with an error.

**`Supplier.evaluatePerformance()`**

- Returns the supplier's average fill rate (0–100) across all its PerformanceRecords, or `null` when it has none.

**`Customer.retrieveInfo()`**

- Returns the customer's full profile: the shared BusinessPartner fields (name, status) plus the Customer fields.

**`Customer.listPurchaseHistory()`**

- Returns the customer's Sales, newest first.
- It uses the shared Sale model from Feature 6.

**`PerformanceRecord.calculateDeliveryDelay()`**

- Returns the days between `expectedDeliveryDate` and `deliveryDate`: positive when late, `0` when on time, and negative when early.

**`PerformanceRecord.calculateFillRate()`**

- Returns the share of the order that was filled, from 0 to 100, rounded to one decimal.
- Over-delivery counts as 100%: the order was fully met, and the extra units are not credited. `flagDiscrepancy()` reports the over-delivery.

**`PerformanceRecord.flagDiscrepancy()`**

- Returns `true` when the quantity received differs from the quantity ordered (short or over), or when the condition is `Poor`.

### Sample profile data

| Item | Sample value |
|---|---|
| Supplier profile | `BP-001` → `SUP-001` Sample Supplier, Net 30 |
| Customer profile | `BP-002` → `CUST-001` Sample Customer |
| Delivery `PERF-001` | 40 of 40 received, on time, Good |
| Delivery `PERF-002` | 45 of 50 received, 3 days late, Acceptable |
| Recorded by | `EMP-002` Stock Clerk One |

### Verify Feature 3

After running `npm run db:setup` and `npm run db:seed` on a disposable database:

```bash
npm run profiles:check
```

The script checks the seeded supplier and its deliveries, Feature 3 methods, over-delivery, required Supplier and Employee references, partner-type consistency, name synchronization, and invalid status values. Any failed check prints `Profile verification FAILED` and ends with exit code `1`. A successful run is expected to print:

```text
Profile verification successful (17 checks passed).
```

Confirm the actual check count against the current script.

### Existing database — add Feature 3 without losing data

For a database created before Feature 3, do not rerun `npm run db:setup`. Instead, back up the database and run:

```bash
npm run profiles:migrate
```

The migration is designed to preserve existing data and be safe to run more than once. It:

1. Backs up the database to a file such as `database/marche-aghapy-before-feature3-<time>.sqlite` (ignored by Git).
2. Creates the `business_partners`, `customers`, and `performance_records` tables if they are missing.
3. Adds `contactInformation`, `paymentTerms`, and `partnerId` (with a unique index) to `suppliers` if they are missing.
4. Gives every existing supplier without a profile a BusinessPartner named after its `supplierName`.

It does not insert the Feature 3 sample customer or deliveries, so `npm run profiles:check` is intended for a freshly seeded database.

### Feature 3 limitations

- `Customer.contactEmployee()` is a placeholder; the class diagram has no Customer–Employee contact record.
- The Employee *accesses* Customer association from the class diagram is not implemented.
- `Supplier.partnerId` remains nullable for Feature 1 suppliers created without a profile; run the migration to link them.

## Feature 4 — Accounting

### Purpose

The accounting subsystem provides a basic structure for recording financial transactions, tracking revenue and expenses, maintaining ledger information, checking configured budget thresholds, and producing financial reports.

The current implementation focuses on the accounting domain models, their associations, and verification of accounting-related behavior. It should be treated as a prototype rather than a complete accounting or bookkeeping application.

### Domain classes and attributes

The accounting subsystem includes the following models:

- **Transaction (`src/models/Transaction.js`)** — represents a financial transaction and stores its transaction details, such as its identifier, amount, date, type, description, and associated records as defined by the model.
- **Revenue (`src/models/Revenue.js`)** — represents revenue-related financial records.
- **Expense (`src/models/Expense.js`)** — represents expense-related financial records.
- **Ledger (`src/models/Ledger.js`)** — represents ledger information used to organize and summarize financial activity.
- **BudgetThreshold (`src/models/BudgetThreshold.js`)** — represents a configured budget threshold used when checking transaction amounts.
- **FinancialReport (`src/models/FinancialReport.js`)** — represents a financial report and its reporting information.

The precise attributes, validation rules, and association aliases are defined in the corresponding model files. Refer to the implementation when checking exact field names or required values.

### Class relationships

The accounting models are registered through `src/models/index.js`, where their associations are configured alongside the other feature models.

The accounting implementation includes relationships involving financial transactions, revenue and expenses, ledger information, budget thresholds, and financial reports. The `Transaction` associations include the relevant supplier and budget-threshold aliases.

The existence of these models and associations does not, by itself, mean that every financial workflow is automated or that every transaction from another feature is automatically posted to the accounting subsystem.

### Verify Feature 4

Run the accounting verification script:

```bash
npm run accounting:check
```

Run the financial-report and budget-threshold verification script:

```bash
npm run accounting-reports:check
```

For PowerShell, use `npm.cmd` if the shell blocks the `npm` PowerShell script:

```powershell
npm.cmd run accounting:check
npm.cmd run accounting-reports:check
```

Run these checks against an appropriately initialized test database. Before using any database setup script, confirm that the selected database is disposable and does not contain information you need to keep.

### Feature 4 limitations

- The accounting subsystem is a prototype; it is not a replacement for production accounting software.
- Automated posting of refunds from Feature 6 into the accounting records must not be assumed unless an implemented and tested integration explicitly performs it.
- Integration with sales, inventory movements, refunds, and other financial workflows must be verified separately.
- The verification scripts check the behavior they explicitly exercise; passing them does not establish that every accounting use case is implemented.

## Feature 5 — Employee Management / Scheduling

The repository also includes Feature 5 models and a scheduling verification script.

### Domain classes

#### StoreOwner

- Attributes: `ownerId`, `ownerName`, `phoneNumber`, `email`
- Documented operations: `reviewComplaint(complaint)`, `resolveCase(complaint)`, `reviewRestockAlert()`, `editShift(shift, startTime, endTime)`, `publishSchedule(schedule)`

#### Store

- Attributes: `storeId`, `storeName`, `address`

#### Employee

- Attributes: `employeeId`, `employeeName`, `phoneNumber`, `email`, `role`
- Documented operations: `viewSchedule()`, `searchAccount(id)`, `assistCustomer()`, `createComplaintCase()`, `addSoldProduct(item)`, `removeSoldProduct(item)`

#### Schedule

- Attributes: `scheduleId`, `startDate`, `endDate`
- Documented operations: `addShift(shift)`, `displayShifts()`, `save()`

#### EmployeeShift

- Attributes: `shiftId`, `shiftDate`, `startTime`, `endTime`, `shiftStatus`
- Documented operations: `validate()`, `updateShift(startTime, endTime)`

### Class relationships

- One StoreOwner can be associated with multiple Stores.
- One Store can be associated with multiple Employees and Schedules.
- One Employee can have multiple EmployeeShifts.
- One Schedule can contain multiple EmployeeShifts.

### Verify Feature 5

Once the scheduling tables and sample records exist in the local database:

```bash
npm run scheduling:check
```

The scheduling verification script exercises adding, validating, editing, publishing, and viewing shifts. **It modifies sample scheduling data.**

**Known local setup limitation:** An inventory-only SQLite database used during Feature 1 development may contain the `suppliers`, `products`, `inventory_records`, and `restock_alerts` tables but not the scheduling tables. Running the scheduling check against that database can produce `SQLITE_ERROR: no such table: stores`. This does not mean the inventory retrieval check failed. Full combined-system verification requires a separately initialized test database or coordinated team setup.

Some Feature 5 operations that depend on classes from other features may remain placeholders. Consult the implementation before assuming that every documented operation is complete.

## Feature 6 — Customer Support

### Purpose

This subsystem supports the customer-support use case: a customer contacts an employee, the employee looks up the customer's records and helps them, opens a complaint case if needed, escalates it to the store owner when it cannot be resolved, processes a return and refund, and logs the interaction.

### Domain classes and attributes

#### ComplaintCase (`src/models/ComplaintCase.js`)

- Attributes: `caseId`, `category`, `description`, `status` (`Open`, `Pending Owner Review`, `Resolved`), and `dateCreated`
- Links to a Customer (required), the creating Employee, and, once escalated, a StoreOwner
- Operations: `createCase()`, `setStatus(status)`, `escalateToOwner(ownerId)`; a `Resolved` case cannot be escalated

#### SupportRequest (`src/models/SupportRequest.js`)

- Attributes: `requestId`, `requestDate`, `subject`, `description`, and `requestStatus` (`Open`, `Logged`, `Closed`)
- Links to a Customer (required) and an Employee
- Operations: `logInteraction()`, `addNotes(text)`

#### ReturnRequest (`src/models/ReturnRequest.js`)

- Attributes: `returnId`, `reason`, `amount`, and `status` (`Pending`, `Refunded`, `Rejected`)
- Links to a Customer (required), a Sale (required), and an Employee
- Operations: `checkEligibility()`, `getIneligibilityReason()`, `processRefund()`

A return is eligible only when all of the following conditions hold:

1. It is still `Pending`.
2. The amount is above zero.
3. It is linked to an existing sale.
4. The sale belongs to the same customer as the return. A walk-in sale with no customer is never refundable.
5. The sale is not dated in the future.
6. The sale is within 30 days (`RETURN_WINDOW_DAYS`), a prototype rule chosen by this feature.
7. The amount does not exceed what is still refundable on the sale (sale total minus refunds already paid), compared in whole cents.

`processRefund()` marks an eligible return `Refunded` and an ineligible one `Rejected`. **`Refunded` and `Rejected` are final states:** processing a decided return throws an error, and the model also blocks any later change of status.

`processRefund()` runs in a single `IMMEDIATE` SQLite transaction and re-reads the return first, so two refunds on the same sale cannot both use the same remaining amount.

#### Sale and SaleItem (`src/models/Sale.js`, `src/models/SaleItem.js`) — shared sales classes

- `Sale` attributes: `saleId`, `saleDate` (cannot be in the future), `totalAmount`, and `paymentMethod`; the customer is optional so walk-in sales are possible
- `Sale` operations: `addItem(item)`, `removeItem(item)`, `recalculateTotal()`
- `SaleItem` attributes: `quantity`, `unitPrice`, and a `saleItemId` key so individual lines can be removed

#### Updated existing classes

- **Employee:** `searchAccount(id)`, `assistCustomer(customerId)`, `createComplaintCase(customerId, details)` (refused for an unknown customer), `addSoldProduct(item)`, and `removeSoldProduct(item)` are implemented instead of placeholders.
- **StoreOwner:** `reviewComplaint()` and `resolveCase()` were already present and are used by the escalation flow.

### Class relationships

- One Customer can have zero or many ComplaintCases, SupportRequests, ReturnRequests, and Sales. Customers with records cannot be deleted (`ON DELETE RESTRICT`).
- One Employee can create ComplaintCases, log SupportRequests, process ReturnRequests, and ring up Sales.
- One StoreOwner can review zero or many escalated ComplaintCases.
- One Sale consists of one or more SaleItems and can have zero or many ReturnRequests.
- Each SaleItem refers to one Product.

### Dependency on Feature 3 (Customer)

Feature 6 requires the `Customer` model from Feature 3. Customer associations are registered centrally in `src/models/index.js`; there is no conditional import. `Customer.listPurchaseHistory()` from Feature 3 reads the Customer–Sale association defined here.

The Feature 6 seed rows use `CUST-001`, which the Feature 3 seed creates, so the Feature 3 seed data must remain above the Feature 6 rows in `scripts/seedDatabase.js`.

### Verify Feature 6

After setting up and seeding a **new or disposable database**:

```bash
npm run support:check
```

The script needs the real `CUST-001` Customer record and follows the use case: it retrieves the customer's records, handles a missing record (flow 3a), creates and escalates a complaint to the owner (flow 5a), and processes eligible and ineligible refunds, including wrong-customer, future-dated-sale, expired-window, excessive-amount, repeat-processing, and simultaneous-refund scenarios.

Every result is an assertion. A failure prints `FAILED` and the script exits with code `1`. A successful run prints:

```text
Customer support verification successful.
```

The script creates temporary records (IDs containing `VERIFY`) and changes a few sample records. These records are removed or restored when the script finishes, including after a failure, so it can be run repeatedly.

### Existing database — add Feature 6 without losing data

For a database created before Feature 6 and already upgraded with `npm run profiles:migrate`, back up the database and run:

```bash
npm run support:migrate
```

The migration backs up the database to a file such as `database/marche-aghapy-before-feature6-<time>.sqlite`, preserves existing data, creates missing Feature 6 tables, and is designed to be rerun.

For a brand-new database, use `npm run db:setup` only when the target database file does not already exist. The `SQLITE_PATH` environment variable can be used to select a new database file.

### Feature 6 limitations

- **Refunds are simulated.** `processRefund()` records the decision on the return. Automatic posting of a refund into Accounting and automatic stock return to Inventory must not be assumed unless those integrations are implemented and tested.
- Concurrent refund protection relies on SQLite's write lock. It suits this single-file prototype, not a multi-server database.
- The 30-day return window is a prototype rule chosen by this feature, not a requirement from the analysis documents.
- Feature 6 must be tested against the complete integrated database as part of final integration testing.

## Database Storage

The default local SQLite file is located at:

```text
database/marche-aghapy.sqlite
```

SQLite files within `database/` are ignored by Git. Each collaborator needs to initialize their own local database; pulling code from GitHub does not update an existing SQLite file's schema or data.

The application can select an alternate database through the `SQLITE_PATH` environment variable. This is useful for testing, provided the selected database is separate from any data that must be preserved.

Keep backups before changing a populated database. Do not commit local database files or backups into the repository.

## Verification Scripts

The repository includes the following verification commands:

| Feature / purpose | Command |
|---|---|
| Database connection | `npm run db:test` |
| Product and inventory prototype | `npm run prototype:check` |
| Scheduling | `npm run scheduling:check` |
| Accounting | `npm run accounting:check` |
| Accounting reports and budget thresholds | `npm run accounting-reports:check` |
| Supplier and customer profiles | `npm run profiles:check` |
| Dashboard and reports | `npm run reports:check` |
| Customer support | `npm run support:check` |

The verification scripts cover specific behaviors, not necessarily every operation in the UML diagrams. Check each script's output and exit code rather than assuming the full application is verified merely because one script passes.

For safe integration testing, use a separate, disposable SQLite database and initialize it only after confirming that the file does not already exist. Never use destructive setup commands on a database containing information you want to keep.

## Git and Collaboration Workflow

- `main` is the shared integration branch.
- Contributors use separate branches for changes, then open Pull Requests for review and merging.
- Feature branches should be tested against the latest integration branch before being merged.
- Database files and backups should remain local and should not be committed to Git.

Useful commands:

```bash
git status
git switch main
git pull origin main
git switch -c docs/update-prototype-readme
```

When working on an existing feature branch, do not create a new branch unless you intend to start a separate piece of work. Check `git status` first and ensure that changes are committed or safely preserved before switching branches.

## Current Prototype Status

| Requirement | Implementation status |
|---|---|
| Version control with Git/GitHub | Set up and used for feature branches and Pull Requests |
| Database service | SQLite configured with Sequelize models and setup scripts |
| Feature 1 — Product and Inventory | Models, associations, selected methods, and prototype verification script present |
| Feature 2 — Dashboard and Reports | Dashboard and report models, associations, and report verification script present |
| Feature 3 — Supplier and Customer Profiles | Business-partner models, delivery-performance records, migration, and verification script present |
| Feature 4 — Accounting | Accounting models, associations, and accounting verification scripts present |
| Feature 5 — Employee Management / Scheduling | Scheduling models and verification script present |
| Feature 6 — Customer Support | Customer-support models, return/refund logic, migration, and verification script present |
| Full combined-system testing | Pending confirmation through integration testing |

The project is an educational prototype. Additional business functionality, test coverage, and cross-feature integration may be added in subsequent milestones.
