# Marché Aghapy — Store Management System

**Course:** BTM 495 — Systems Analysis and Design  
**Project:** Prototype 2  
**University:** Concordia University — John Molson School of Business  
**Team:** Group 1

## 1. Project Overview

The Marché Aghapy Store Management System is a university project developed to support the daily operations of Marché Aghapy, a local grocery store in Montréal, Quebec.

The purpose of the proposed system is to improve how the store manages its products, inventory, suppliers, customers, employees, and financial information.

By organizing these activities within one system, the project aims to reduce manual work, improve information accuracy, and support better business decisions.

## 2. Project Objectives

The main objectives of the system are to:

- Improve product and inventory tracking.
- Reduce stock shortages and identify products approaching their expiry dates.
- Organize supplier and customer information.
- Support financial tracking and reporting.
- Simplify employee scheduling.
- Improve customer service and complaint handling.

## 3. Main Features

The system is divided into six main features.

### Feature 1 — Product and Inventory Management

Supports the management of product information, inventory quantities, expiry dates, and restocking alerts. It helps the store identify products that need attention and maintain accurate inventory records.

### Feature 2 — Dashboard and Reports

Provides the foundation for organizing sales, inventory, and expiry-related reports. The goal is to give the store owner a clearer view of business performance and important operational information.

### Feature 3 — Supplier and Customer Profile Management

Organizes supplier and customer information, including contact details and supplier performance records. It also supports customer purchase history and the identification of supplier delivery issues.

### Feature 4 — Accounting Management

Supports the recording of revenues and expenses, tracking financial transactions, monitoring account balances, and preparing financial summaries.

### Feature 5 — Employee Management and Scheduling

Allows the store to organize employee information, create work schedules, assign shifts, and manage schedule updates.

### Feature 6 — Customer Support

Supports customer inquiries, complaint management, purchase history retrieval, product returns, refunds, and the escalation of customer concerns to the store owner.

## 4. Prototype Development

### Prototype 1 — Initial Development

The first prototype established the basic structure of the proposed system.

During this phase, the team created the main classes, organized the database, and developed the initial functionality for the six features.

### Prototype 2 — System Improvements

The second prototype focuses on improving the initial implementation and aligning the code with the updated system design.

The improvements include:

- Refining existing classes, attributes, and methods.
- Implementing additional system functionality.
- Improving data validation and error handling.
- Strengthening relationships between different features.
- Expanding testing to verify system behavior and data consistency.

Development and testing continue as the remaining requirements are finalized.

## 5. Technologies Used

The project uses the following technologies:

- **JavaScript and Node.js:** System development and business logic.
- **SQLite:** Database storage.
- **Sequelize:** Database management and interaction.
- **Git and GitHub:** Version control and team collaboration.
- **Visual Studio Code:** Development environment.

## 6. Running the Prototype

To run the project locally:

1. Download or clone the repository.
2. Open the project folder in Visual Studio Code.
3. Install the required dependencies using `npm install`.
4. For a new database, run `npm run db:setup`.
5. Add the sample data using `npm run db:seed`.

To run the overall prototype verification tests, use:

`node scripts/verifyPrototype2Integration.js`

**Note:** Database setup and sample-data commands are intended for a new database. Avoid running them against an existing database containing information you want to preserve.

### Feature 2 — Dashboard and Reports

- `npm run reports:demo` walks through the dashboard and the three reports (inventory, sales, expiry / restock) on a temporary database. Exported PDF and CSV files are saved in the `exports/` folder.
- `npm run reports:check` tests every Feature 2 class and method.
- `npm run reports:migrate` updates a database created before Prototype 2 (it makes a backup first). A new database from `npm run db:setup` does not need it.

## 7. Team Collaboration

The project was developed collaboratively by Group 1.

Each team member was responsible for a specific feature, allowing the team to work on different parts of the system simultaneously.

GitHub was used to organize development through separate branches and pull requests. Changes were reviewed, tested, and integrated into the main project as development progressed.

This approach helped the team coordinate its work and maintain consistency across the system.

## 8. Project Status

The project is currently in the Prototype 2 development stage.

Major improvements have been integrated into the inventory, dashboard and reports, supplier and customer profiles, accounting, employee scheduling, and customer support features.

The team continues to review and test the prototype against its revised class diagrams and system specifications.

## 9. Conclusion

The Marché Aghapy Store Management System demonstrates how information technology can support the operations of a small grocery business.

Through the development of the two prototypes, the team has established a foundation for managing important business activities in a more organized and consistent way.

The project also demonstrates the practical application of systems analysis, object-oriented design, database management, software development, and teamwork.

**This project is an academic technical prototype and is not intended to serve as a fully deployed commercial application.**

## Feature 1: browser inventory prototype

The browser interface uses Node's built-in HTTP server and the existing Sequelize/SQLite models and `InventoryController`. The controller creates and updates product, inventory and alert records in a transaction. Stock and expiry statuses come from `InventoryRecord`; alert recommendations and supplier lead-time rules come from the existing alert logic. No schema changes or new runtime dependencies were introduced. The server listens on localhost only and has no authentication; it is intended for a local academic demonstration.

### Install and run an isolated demonstration (PowerShell)

Use Node.js with npm, then from the project folder run:

```powershell
npm install
$env:SQLITE_PATH = Join-Path $env:TEMP 'aghapy-feature1-demo.sqlite'
node scripts/setupDatabase.js
npm run inventory:demo
npm start
```

Open http://localhost:3000. Keep the terminal open; stop the server with Ctrl+C. `SQLITE_PATH` selects the database for all commands in that terminal. If omitted, the application uses `database/marche-aghapy.sqlite`. Existing databases must already have the Feature 1 Prototype 2 schema; see the existing migration documentation and back up before migrating. Setup refuses to overwrite an existing database. The demo seed only inserts missing demo IDs and skips collisions; it never resets existing rows. To reset the isolated demo, stop the server, delete **only** the exact temporary demo file named above, and repeat setup and seeding. Never point the reset at the normal project database. Use `PORT` to choose another local port.

### Demonstration

1. Search for Foul Medames and choose View to review its details.
2. Choose Edit Inventory, change quantity and expiry, and save. Past dates and blank expiry dates are valid and evaluated by the model.
3. On the edit form enter a negative or fractional quantity; the form highlights the field and does not save. Correct it and submit.
4. Set quantity to 2 with a reorder level of 10. The confirmation displays the low-stock status and pending restock alert. Choose Done Reviewing, then reload to see the saved quantity.
5. Choose Add Product, enter unique product and inventory IDs, name, category, quantity and reorder level, then save and return to Inventory.

### Verification

```powershell
npm run inventory:web-check
npm run inventory:expiry-check
npx playwright install chromium
npm run inventory:browser-check
node scripts/verifyInventoryController.js
node scripts/verifyInventoryPage.js
node scripts/verifyPendingRestockAlerts.js
node scripts/verifyPrototype2Integration.js
```

These checks use isolated temporary databases. The web check exercises HTTP creation, invalid updates, persistence, and alert refresh/resolution. The broader suite includes model, transaction rollback, expiry and unrelated-feature regression checks. The reusable Playwright browser check exercises desktop and mobile workflows using a temporary SQLite database, including load failure and retry, search and filtering, cancellation, validation, creation, duplicate IDs, expiry status, alerts and reload. Install the Playwright Chromium browser once with the command above.

| Criterion | Implementation | Evidence |
| --- | --- | --- |
| AC-01 | Products & Inventory navigation | Browser opened Inventory; navigation is present |
| AC-02 | Inventory API and table | Browser displayed seeded SQLite records; web check lists records |
| AC-03 | View and Edit Inventory | Browser opened details and edit form |
| AC-04 | Form and controller validation | Browser rejected negative quantity; HTTP check rejected invalid numbers and dates |
| AC-05 | Error summary and field messages | Browser displayed a quantity error; web check verified unchanged quantity after invalid requests |
| AC-06 | Transactional controller update | Browser saved; HTTP and controller checks verified persisted values |
| AC-07 | Model-derived stock and expiry status | Browser displayed low stock; existing inventory record checks cover expiry |
| AC-08 | Existing alert evaluation | Browser displayed alert; HTTP and pending-alert checks cover refresh and resolution |
| AC-09 | Confirmation and Done Reviewing | Browser completed review and reloaded persisted record |

### Design and limitations

No local Milestone 6 wireframes were found in the tracked repository, so the interface follows the written layout and screen sequence. Price, storage location, updated-by, recent stock changes, reason and note are omitted because they are not persisted by the existing inventory model. Other modules are labeled Coming soon. Search, category filtering and pagination operate on records retrieved by the API and are suitable for the prototype's small dataset. The interface does not implement authentication, multi-user conflict detection, or persistent review history. On the first inventory list or detail request each UTC day, and on the first request after a server restart, the server reconciles alerts transactionally using the existing business rules. No background timer runs; if the application is never opened, alerts are updated on the next inventory request. Browser reload returns to the inventory list. The inventory table scrolls within its card on narrow screens; the navigation itself wraps without horizontal scrolling. Exact wireframe fidelity cannot be verified without the original designs.

Feature 1 additions are `src/server.js`, `public/index.html`, `public/style.css`, `public/app.js`, `scripts/seedFeature1Demo.js`, and `scripts/verifyInventoryWeb.js`. `package.json` adds run scripts, and `src/controllers/InventoryController.js` checks supplier existence during updates. No other feature's schema was changed.

The browser and expiry checks are in `scripts/verifyInventoryBrowser.js` and `scripts/verifyExpiryReconciliation.js`. Playwright is a development dependency; its browser must be installed separately. Reconciliation uses the project’s existing UTC date convention.
