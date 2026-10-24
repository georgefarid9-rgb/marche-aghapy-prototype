# Marché Aghapy Store Management System — Prototype

**Course:** BTM 495 — Systems Analysis and Design  
**Project:** Marché Aghapy Store Management System  
**Repository:** https://github.com/georgefarid9-rgb/marche-aghapy-prototype

## Overview

This repository contains a Node.js and SQLite prototype for the proposed Marché Aghapy Store Management System. It demonstrates Git/GitHub version control, a relational database, object-oriented domain classes and attributes, associations between classes, and selected optional class methods.

The repository currently includes models for:

- **Feature 1 — Product and Inventory Management:** product records, suppliers, inventory quantities, expiry dates, reorder levels, and restock-alert records.
- **Feature 2 — Dashboard and Reports:** dashboard summaries, reports, report filters, exports, and report-specific data models.
- **Feature 5 — Employee Management / Scheduling:** store owners, stores, employees, schedules, and shifts.
- **Feature 6 — Customer Support:** complaint cases, support requests, return requests and refunds, and the shared sale classes they rely on.

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

The repository contains the following Feature 2 model classes in `src/models/`:

- `DashboardSummary`
- `Report`
- `InventoryReport`
- `SalesReport`
- `ExpiryRestockReport`
- `ReportFilter`
- `ReportExport`

Their Sequelize associations are registered in `src/models/index.js`. These classes provide the structural foundation for dashboard summaries and report data. This README does not claim that report generation, exports, or automated Feature 2 testing is complete.

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

## Feature 6 — Customer Support

### Purpose

Supports the "Provide customer support" use case: a customer contacts an employee, the employee looks up the customer's records, helps them, opens a complaint case if needed, escalates it to the store owner when it cannot be resolved, processes a return and refund, and logs the interaction.

### Domain classes and attributes

#### ComplaintCase (`src/models/ComplaintCase.js`)

- Attributes: `caseId`, `category`, `description`, `status` (`Open`, `Pending Owner Review`, `Resolved`), `dateCreated`, `customerId`
- Operations: `createCase()`, `setStatus(status)`, `escalateToOwner(ownerId)`

#### SupportRequest (`src/models/SupportRequest.js`)

- Attributes: `requestId`, `requestDate`, `subject`, `description`, `requestStatus` (`Open`, `Logged`, `Closed`), `customerId`
- Operations: `logInteraction()`, `addNotes(text)`

#### ReturnRequest (`src/models/ReturnRequest.js`)

- Attributes: `returnId`, `reason`, `amount`, `status` (`Pending`, `Refunded`, `Rejected`), `customerId`
- Operations: `checkEligibility()`, `processRefund()`
- A return is eligible when it is linked to a sale, the amount is above zero, the sale is within **30 days**, and the amount does not exceed what is still refundable on the sale (sale total minus refunds already paid). `processRefund()` marks an eligible return `Refunded` and an ineligible one `Rejected`.

#### Sale and SaleItem (`src/models/Sale.js`, `src/models/SaleItem.js`) — shared sales classes

- `Sale` attributes: `saleId`, `saleDate`, `totalAmount`, `paymentMethod`, `customerId` (optional, so walk-in sales are possible)
- `Sale` operations: `addItem(item)`, `removeItem(item)`, `recalculateTotal()`
- `SaleItem` attributes: `quantity`, `unitPrice` (plus a `saleItemId` key so single lines can be removed)

#### Updated existing classes

- `Employee`: `searchAccount(id)`, `assistCustomer(customerId)`, `createComplaintCase(customerId, details)`, `addSoldProduct(item)` and `removeSoldProduct(item)` are now implemented instead of placeholders.
- `StoreOwner`: `reviewComplaint()` and `resolveCase()` were already present and are used by the escalation flow.

### Class relationships

- One Customer can have zero or many ComplaintCases, SupportRequests, ReturnRequests and Sales.
- One Employee can create ComplaintCases, log SupportRequests, process ReturnRequests and ring up Sales.
- One StoreOwner can review zero or many escalated ComplaintCases.
- One Sale consists of one or more SaleItems, and can have zero or many ReturnRequests.
- Each SaleItem refers to one Product.

### Dependency on Feature 3 (Customer)

The `Customer` model is built in Feature 3 (branch `feature/supplier-customer-profiles`). `src/models/index.js` registers the Customer associations only when `src/models/Customer.js` exists, so Feature 6 works before and after that branch is merged. Until then the `customerId` columns hold plain values, and `Employee.searchAccount()` returns `null`. The seed script uses `CUST-001`, the sample customer that the Feature 3 seed creates.

### Verify Feature 6

After `npm run db:setup` and `npm run db:seed`:

```bash
npm run support:check
```

The script follows the use case: it retrieves a customer's records, handles a missing record (flow 3a), creates and escalates a complaint to the owner (flow 5a), and processes eligible and ineligible refunds. It also exercises the sale methods and logs a support interaction. A successful run prints `Customer support verification successful.` **It modifies sample support data.**

### Feature 6 limitations

- Updating inventory and accounting after a refund (use case step 7) is not implemented, because the Ledger and Transaction classes are not part of the prototype yet.
- `Customer.listPurchaseHistory()` (Feature 3) is still a placeholder; `Employee.assistCustomer()` reads the customer's sales directly.
- The 30-day return window is a prototype rule chosen by this feature, not a requirement from the analysis documents.

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
| Classes and attributes | Feature 1 implemented; additional Feature 2 and Feature 5 models present |
| Optional class methods | Three Feature 1 methods implemented and tested at the method-logic level |
| Feature 6 customer support classes and flow | Implemented; verified with `npm run support:check` |
| Full combined-system testing | Pending |

The project is an educational prototype. Additional business functionality, test coverage, and cross-feature integration may be added in subsequent milestones.
