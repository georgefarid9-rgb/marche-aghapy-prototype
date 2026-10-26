# Marché Aghapy — Store Management System

**Course:** BTM 495 — Systems Analysis and Design  
**Project:** Prototype 1  
**Project Name:** Marché Aghapy Store Management System

## 1. Project Overview

Our project proposes a store management system for Marché Aghapy, a local grocery store in Montréal.

The goal is to help the store manage its daily activities more efficiently by organizing information related to products, inventory, suppliers, customers, employees, sales, and accounting.

For Prototype 1, our team developed the basic structure of the proposed system using JavaScript, Node.js, Sequelize, and SQLite.

The prototype demonstrates how the system's main components are organized, how information is stored in a database, and how different features can work together.

**This is a functional technical prototype, not a complete website or application with a user interface.**

## 2. Features Developed

Our system includes six main features.

### Feature 1 — Product and Inventory Management

- Store product information.
- Track product quantities and expiry dates.
- Identify products with low inventory.
- Record restocking alerts.
- Connect products to suppliers.

### Feature 2 — Dashboard and Reports

- Organize inventory and sales reports.
- Store report information and filters.
- Track report export details.
- Calculate basic sales information.

### Feature 3 — Supplier and Customer Profiles

- Store supplier and customer information.
- Update business partner profiles.
- Record supplier delivery performance.
- Evaluate supplier delivery accuracy.
- Retrieve customer purchase history.

### Feature 4 — Accounting

- Record revenue and expenses.
- Maintain a store ledger.
- Calculate account balances.
- Generate basic financial summaries.
- Compare expenses against budget limits.

### Feature 5 — Employee Management and Scheduling

- Store employee and store information.
- Create employee schedules.
- Add and edit work shifts.
- Validate shift information.
- Publish and view employee schedules.

### Feature 6 — Customer Support

- Retrieve customer information and purchase history.
- Create and manage customer complaints.
- Escalate complaints to the store owner.
- Process simulated returns and refunds.
- Record customer support interactions.

## 3. Technologies Used

| Technology | Purpose |
|---|---|
| JavaScript / Node.js | Develop the system's features and business logic |
| SQLite | Store the system's information |
| Sequelize | Connect the system's classes to the database |
| Git | Track changes to our work |
| GitHub | Share code and collaborate as a team |
| Visual Studio Code | Develop and test the prototype |

## 4. How to Run the Prototype

### Step 1 — Install the project

Download or clone the GitHub repository and open the project folder in Visual Studio Code.

Open the terminal and run:

```bash
npm install
```

### Step 2 — Create a database

The system uses a local SQLite database.

For a new database, run:

```bash
npm run db:setup
```

**Important:** The setup command does not delete an existing database. It stops if the selected database file already exists.

To test using a separate database in Windows PowerShell, run:

```powershell
$env:SQLITE_PATH = "database\prototype-test.sqlite"
Test-Path $env:SQLITE_PATH
```

Continue only if the result is `False`. Then run:

```powershell
npm run db:setup
```

### Step 3 — Add sample information

Run:

```bash
npm run db:seed
```

This adds sample records for products, suppliers, customers, employees, schedules, sales, and customer support.

Only run this command on a newly initialized database.

## 5. Team Collaboration

Our team used Git and GitHub to collaborate throughout the development process.

Each team member worked on their assigned feature using a separate branch.

Once a feature was completed, it was reviewed and merged into the main project.

This approach allowed team members to work independently while bringing all six features together into one shared prototype.


## 6. Conclusion

For Prototype 1, our team successfully created and combined the six main features of the proposed Marché Aghapy Store Management System.

We established a shared database, implemented the system's main classes and relationships, and tested key operations.

All seven verification suites passed during our final integration testing.

This prototype provides the foundation for further development and improvements in Prototype 2.
