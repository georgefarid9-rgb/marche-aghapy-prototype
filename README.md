# Marché Aghapy Store Management System — Prototype

**Course:** BTM 495 — Systems Analysis and Design  
**Project:** Marché Aghapy Store Management System  
**Repository:** https://github.com/georgefarid9-rgb/marche-aghapy-prototype

## Overview

This repository contains a Node.js and SQLite prototype for the proposed Marché Aghapy Store Management System. It demonstrates Git/GitHub version control, a relational database, object-oriented domain classes and attributes, associations between classes, and selected optional class methods.

The repository currently includes models for:

- **Feature 1 — Product and Inventory Management:** product records, suppliers, inventory quantities, expiry dates, reorder levels, and restock-alert records.
- **Feature 2 — Dashboard and Reports:** dashboard summaries, reports, report filters, exports, and report-specific data models.
- **Feature 3 — Supplier and Customer Profile Management:** shared business-partner profiles, supplier and customer profiles, and supplier delivery performance records.
- **Feature 5 — Employee Management / Scheduling:** store owners, stores, employees, schedules, and shifts.

These are **prototype models**, not a complete production-ready store application. Each feature has a different level of implementation and verification.

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

**Warning:** `npm run db:setup` executes `sequelize.sync({ force: true })`. It **drops and recreates existing tables**, deleting any records already stored in them. Do **not** run it against a database containing information you want to keep.

For a brand-new or intentionally reset **disposable** local database:

```bash
npm run db:setup
npm run db:seed
```

The seed script creates fixed sample identifiers. Running `npm run db:seed` repeatedly against the same populated database can fail with duplicate-key errors.

### Existing database — preserve your data

If your local SQLite database already contains inventory data, **do not rerun** `npm run db:setup` or the full seed script just to update the inventory schema. Use the relevant inventory migration script(s) only after making a backup and verifying which columns and constraints are already present:

```bash
node scripts/addProductCategory.js
node scripts/addUniqueInventoryProductIndex.js
node scripts/enforceInventoryProductNotNull.js
node scripts/addInventoryReorderLevel.js
```

These scripts were added for upgrading an older Feature 1 database. They are **not required after a fresh setup** using the current models. The `enforceInventoryProductNotNull.js` script rebuilds the inventory table and creates a database backup; use it cautiously, particularly on shared or populated databases.

## Feature 1 — Product and Inventory Management

### Purpose

The subsystem records products, manages inventory quantities and expiry dates, identifies low-stock conditions using a reorder threshold, and maintains associations with suppliers and restock alerts.

### Domain classes and attributes

#### Supplier (`src/models/Supplier.js`)

- `supplierId` — primary key
- `supplierName` — supplier name
- `leadTimeDays` — supplier lead time in days (optional)

Feature 3 adds `contactInformation`, `paymentTerms`, and `partnerId` to Supplier; see the Feature 3 section.

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
- `inventoryId` — inventory record foreign key established through the Sequelize association

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
| --- | --- |
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

The subsystem gives the store owner one dashboard summary of sales, low stock, near-expiry and restocking, and lets the owner generate inventory, sales and expiry/restock reports, narrow them with filters, and export them.

### Domain classes and attributes

- **DashboardSummary** — `summaryId`, `summaryDate`, `lastRefreshed`, `totalSalesToday`, `lowStockCount`, `nearExpiryCount`, `pendingRestockCount`, `dataStatus` (defaults to `Available`)
- **Report** {abstract} — `reportId`, `reportType` (`inventory`, `sales` or `expiry-restock`), `generatedDate` (set automatically), `periodStart`, `periodEnd`, `reportStatus` (defaults to `Generated`), `summaryId`
- **InventoryReport** — `reportId`, `totalProducts`, `totalQuantityOnHand`, `lowStockCount`
- **SalesReport** — `reportId`, `totalSalesAmount`, `numberOfSales`, `averageSaleAmount` (derived: calculated on read, not stored)
- **ExpiryRestockReport** — `reportId`, `expiryWindowDays` (defaults to 7), `nearExpiryCount`, `restockCount`
- **ReportFilter** — `filterId`, `reportId`, `startDate`, `endDate`, `productId`, `category`
- **ReportExport** — `exportId`, `reportId`, `exportDate` (set automatically), `exportFormat`, `fileName`

### Class relationships

- One DashboardSummary contains one or many Reports (aggregation, `reports.summaryId`).
- Report is the generalization of InventoryReport, SalesReport and ExpiryRestockReport. It is implemented as a parent table: each subclass row shares its `reportId` with one Report row, and `reportType` records which kind of report it is.
- One Report is narrowed by zero or many ReportFilters.
- One Report is exported as zero or many ReportExports.

### Verify Feature 2

The check creates its own test records (IDs starting with `VR-`) and deletes them afterwards, so it does not need seed data and can be run more than once. Run it against a fresh test database so it matches the current models:

```bash
SQLITE_PATH=database/reports-test.sqlite npm run db:setup
SQLITE_PATH=database/reports-test.sqlite npm run reports:check
```

The script checks every result with an assertion:

1. The foreign keys exist in the SQLite schema itself, and foreign key enforcement is on.
2. A DashboardSummary, all three report types, a ReportFilter and a ReportExport can be created.
3. They can be read back, with the expected default values.
4. Every association works in both directions (summary ↔ reports, report ↔ filters, report ↔ exports, report ↔ subclass details).
5. The derived `averageSaleAmount` is correct, including when there are no sales.
6. Invalid data is rejected: filters, exports and report details that point to a missing report, a report that points to a missing summary, and missing required fields.

Any failed check prints `Report verification FAILED` and ends with exit code `1`. A successful run ends with:

```text
Report verification successful (24 checks passed).
```

### Feature 2 limitations — methods not yet implemented

The class attributes and associations are complete. The following operations from the Feature 2 class diagram are **optional for this prototype and are not implemented yet**:

| Class | Operations not yet implemented |
| --- | --- |
| Report | `generateReport()`, `retrieveReportData()`, `applyFilter(filter)`, `hasData()`, `exportReport(format)` |
| InventoryReport | `retrieveReportData()`, `identifyLowStock()` |
| SalesReport | `retrieveReportData()`, `summarizeSales(start, end)` |
| ExpiryRestockReport | `retrieveReportData()`, `identifyNearExpiry()`, `identifyRestockNeeds()` |
| DashboardSummary | `refreshSummary()`, `flagUnavailableData()`, `getAvailableReportTypes()` |
| ReportFilter | `validateCriteria()` |
| ReportExport | `createExportFile()` |

As a result:

- Report figures (totals and counts) are stored values; they are not yet calculated from the inventory and sales records.
- The dashboard's derived counts are stored values and are not refreshed automatically.
- Exports are recorded (format, file name, date), but no actual PDF, Excel or CSV file is produced.
- SalesReport cannot read real sales until the shared Sale model (Feature 6) is added.
- The only implemented logic is the derived attribute `SalesReport.averageSaleAmount`.

## Feature 3 — Supplier and Customer Profile Management

### Purpose

The subsystem keeps one shared profile for every business partner of the store (suppliers and customers), stores the details specific to each kind of partner, and records how well each supplier delivers so the owner can compare suppliers.

### Domain classes and attributes

#### BusinessPartner {abstract} (`src/models/BusinessPartner.js`)

- `partnerId` — primary key
- `partnerName` — required, non-empty name; the **authoritative** name of the partner
- `partnerStatus` — `Active` (default) or `Inactive`
- `partnerType` — `Supplier` or `Customer`; fixed after creation

#### Supplier (`src/models/Supplier.js`) — fields added by Feature 3

- `contactInformation` — optional supplier contact details
- `paymentTerms` — optional payment terms (for example, `Net 30`)
- `partnerId` — unique foreign key to BusinessPartner; nullable so supplier rows created before Feature 3 still work (the migration below links them)

The Feature 1 fields (`supplierId`, `supplierName`, `leadTimeDays`) are kept. For a supplier linked to a BusinessPartner, `supplierName` is a synchronized copy of `partnerName` (see Business rules).

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
- `supplierId` — **required** foreign key to Supplier
- `employeeId` — **required** foreign key to Employee (who recorded the delivery)

### Class relationships

- BusinessPartner is the generalization of Supplier and Customer. It is implemented as a parent table: each Supplier or Customer row points to one BusinessPartner row through a unique `partnerId`, following the same pattern as Report and its report subclasses.
- One Supplier accumulates zero or many PerformanceRecords (aggregation). Every record must have a Supplier; a Supplier with records cannot be deleted (`ON DELETE RESTRICT`).
- One Employee records zero or many PerformanceRecords. Every record must name an Employee (`ON DELETE RESTRICT`).
- One Customer makes zero or many Sales. This association is registered by Feature 6, which provides the shared Sale model.

### Business rules enforced in the models

| Rule | Where it is enforced |
| --- | --- |
| `partnerName` is the one authoritative name. Saving a supplier partner copies its name to `Supplier.supplierName`; a new supplier takes its name from its partner. | `BusinessPartner` `afterSave` hook, `Supplier` `beforeValidate` hook |
| `supplierName` cannot be set to a different name directly; use `BusinessPartner.updateProfile()`. | `Supplier` `beforeValidate` hook |
| A Supplier must link to a partner of type `Supplier`, a Customer to a partner of type `Customer`. | `Supplier` and `Customer` `beforeValidate` hooks |
| `partnerType` cannot change after the partner is created. | `BusinessPartner` `beforeUpdate` hook |
| A PerformanceRecord needs an existing Supplier and Employee. | `allowNull: false` + foreign key constraints |

### Implemented class methods

**`BusinessPartner.updateProfile(changes)`**

- Updates the editable profile field (`partnerName`) and saves, in a transaction that also updates the linked Supplier's `supplierName`. Fields that are not editable, such as `partnerId` and `partnerType`, are ignored.

**`BusinessPartner.changeStatus(newStatus)`**

- Sets the status to `Active` or `Inactive` and saves. Any other value is rejected with an error.

**`Supplier.evaluatePerformance()`**

- Returns the supplier's average fill rate (0–100) across all its PerformanceRecords, or `null` when it has none.

**`Customer.retrieveInfo()`**

- Returns the customer's full profile: the shared BusinessPartner fields (name, status) plus the Customer fields.

**`Customer.listPurchaseHistory()`**

- Returns the customer's Sales, newest first (the derived `/purchaseHistory`). It uses the shared Sale model from Feature 6; while that model is not in the prototype, it returns an empty list.

**`PerformanceRecord.calculateDeliveryDelay()`**

- Returns the days between `expectedDeliveryDate` and `deliveryDate`: positive when late, `0` when on time, negative when early.

**`PerformanceRecord.calculateFillRate()`**

- Returns the share of the order that was filled, from 0 to 100, rounded to one decimal.
- **Over-delivery** (more received than ordered) counts as 100%: the order was fully met, and the extra units are not credited. `flagDiscrepancy()` reports the over-delivery.

**`PerformanceRecord.flagDiscrepancy()`**

- Returns `true` when the quantity received differs from the quantity ordered (short or over), or when the condition is `Poor`.

### Sample profile data

| Item | Sample value |
| --- | --- |
| Supplier profile | `BP-001` → `SUP-001` Sample Supplier, Net 30 |
| Customer profile | `BP-002` → `CUST-001` Sample Customer |
| Delivery `PERF-001` | 40 of 40 received, on time, Good |
| Delivery `PERF-002` | 45 of 50 received, 3 days late, Acceptable |
| Recorded by | `EMP-002` Stock Clerk One |

### Verify Feature 3

After `npm run db:setup` and `npm run db:seed` on a disposable database:

```bash
npm run profiles:check
```

The script checks every result with an assertion: the seeded supplier and its deliveries, every Feature 3 method, over-delivery, the required Supplier and Employee references, partnerType consistency, name synchronization, and invalid status values. Any failed check prints `Profile verification FAILED` and ends with exit code `1`. It restores the sample data afterwards, so it can be run more than once. A successful run ends with:

```text
Profile verification successful (17 checks passed).
```

### Existing database — add Feature 3 without losing data

For a database created **before** Feature 3, do not rerun `npm run db:setup`. Instead run:

```bash
npm run profiles:migrate
```

The migration keeps all existing data and is safe to run more than once. It:

1. Backs up the database to `database/marche-aghapy-before-feature3-<time>.sqlite` (ignored by Git).
2. Creates the `business_partners`, `customers`, and `performance_records` tables if they are missing.
3. Adds `contactInformation`, `paymentTerms`, and `partnerId` (with a unique index) to `suppliers` if they are missing.
4. Gives every existing supplier without a profile a BusinessPartner (`BP-<supplierId>`, named after its `supplierName`).

It does not insert the Feature 3 sample customer or deliveries, so `npm run profiles:check` is meant for a freshly seeded database.

### Feature 3 limitations

- `Customer.contactEmployee()` is a placeholder; the class diagram has no Customer–Employee contact record.
- The Employee *accesses* Customer association from the class diagram is not implemented.
- `Supplier.partnerId` stays nullable for Feature 1 suppliers created without a profile; run the migration to link them.

## Feature 5 — Employee Management / Scheduling

The repository also includes Feature 5 models and its scheduling verification script.

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

**Known local setup limitation:** The inventory-only SQLite database used during Feature 1 development has the `suppliers`, `products`, `inventory_records`, and `restock_alerts` tables but not the scheduling tables. Running the scheduling check against that database produces `SQLITE_ERROR: no such table: stores`. This does not mean the inventory retrieval check failed. Full combined-system verification requires a separately initialized test database or coordinated team setup.

Some Feature 5 operations that depend on classes from other features are still documented as placeholders until those components are available.

## Database Storage

The local SQLite file is located at:

```text
database/marche-aghapy.sqlite
```

SQLite files within `database/` are ignored by Git. Each collaborator needs to initialize their own local database; pulling code from GitHub does not update an existing SQLite file's schema or data.

Keep backups before changing a populated database. Do not commit local database backups into the repository.

## Git and Collaboration Workflow

- `main` is the shared integration branch.
- Contributors use separate branches for changes, then open Pull Requests for review and merging.
- Feature 1 model alignment, database constraints, and selected methods were merged through [Pull Request #3](https://github.com/georgefarid9-rgb/marche-aghapy-prototype/pull/3).
- Documentation updates can be made on a separate branch (for example, `docs/inventory-prototype-readme`) before opening another Pull Request.

Useful commands:

```bash
git status
git switch main
git pull origin main
git switch -c docs/inventory-prototype-readme
```

## Current Prototype Status

| Requirement | Implementation status |
| --- | --- |
| Version control with Git/GitHub | Set up and used for feature branches and Pull Requests |
| Database service | SQLite configured with Sequelize models and setup scripts |
| Classes and attributes | Feature 1 implemented; additional Feature 2, Feature 3 and Feature 5 models present |
| Optional class methods | Three Feature 1 methods implemented and tested at the method-logic level |
| Full combined-system testing | Pending |

The project is an educational prototype. Additional business functionality, test coverage, and cross-feature integration may be added in subsequent milestones.
