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
- Validate profile details before saving, and prevent duplicate supplier names and customer phone numbers (also enforced by the database).
- Find and update business partner profiles: name, status, and supplier or customer contact details, lead time and payment terms.
- Record supplier delivery performance, including unplanned deliveries without a purchase order.
- Flag delivery discrepancies and unplanned deliveries, and store a notification in the store owner's inbox.
- Supplier performance report: average lead time, on-time delivery rate and average fill rate.
- Retrieve customer purchase history.

To check Feature 3, run `npm run profiles:check` on a newly seeded database. To upgrade an existing database without losing data, run `npm run profiles:migrate` (it backs up the database first).

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

**Prototype 2 update (matches the combined class diagram, the Milestone 4 Feature 5 sequence diagrams and the Milestone 5 implementation class diagram):**

| Class | Attributes | Methods |
|---|---|---|
| Schedule | scheduleId, startDate, endDate `{startDate <= endDate}`, store [1..1], shifts [0..*] | addShift(shift) : void, displayShifts() : EmployeeShift[], findShift(shiftId) : EmployeeShift, save() : void |
| EmployeeShift | shiftId, shiftDate, startTime, endTime `{startTime < endTime}`, role [0..1], shiftStatus, schedule [1..1], employee [1..1] | validate() : Boolean, updateShift(startTime, endTime) : Boolean, cancelShift() : Boolean |
| Employee | employeeId, employeeName, phoneNumber (required), email [0..1], role, shifts [0..*] | viewSchedule() : EmployeeShift[] |
| StoreOwner | (Feature 5 methods) | editShift(shift) : Boolean, publishSchedule(schedule) : void |
| Store | storeId, storeName, address (required), employees, schedules | listEmployees() : Employee[], findEmployee(employeeId) : Employee |

- `Store.listEmployees()` and `Store.findEmployee()` added (sequence diagram steps 1-3); `findEmployee()` returns `null` for alternate flow 3a.
- `findShift()` added; returns `null` when the shift is not in that schedule (alternate flow 5a).
- A schedule whose start date is after its end date is rejected.
- `editShift(aShift)` now takes only the shift (with its new times already set) and returns `isValid` from `updateShift()`: `true` when saved, `false` when the times are invalid (sub-flow 8a). On `false` the old times are kept and the reason is in `shift.validationMessage`.
- `publishSchedule()` checks every shift first and publishes all of them in one transaction, or none.
- A shift must have an employee and a schedule, a schedule must have a store, and an employee must have a phone number, and a store must have an address.
- Run `npm run scheduling:check` on a newly set-up database to verify all of the above.

**Feature 5 is fully functional through `SchedulePage` (boundary) and `ScheduleController` (controller):**

| Use case 05 step | SchedulePage method | Controller → domain calls (sequence diagram order) |
|---|---|---|
| 1-2 Open the scheduling dashboard | `openSchedulingDashboard()` | `Store.listEmployees()`, store schedules |
| 3 Select an employee (3a: not found → error) | `selectEmployee(employeeId)` | `Store.findEmployee(employeeId)` |
| 4 View Schedule (include) | `displayEmployeeSchedule()` | `Employee.viewSchedule()` |
| 5 Select a shift (5a: none → prompt) | `selectShift(shiftId)` | `Schedule.findShift(shiftId)` |
| 6 Show shift details | `displayShiftDetails()` | – |
| 7 Enter start/end time and role | `enterShiftInformation(data)` | – |
| 8-10 Validate, save, confirm (6a missing fields, 8a invalid → correct and resubmit) | `submitShiftChanges()` | `StoreOwner.editShift(aShift)` → `updateShift()` → `validate()` → `isValid` → `Schedule.save()` |
| Build the schedule | `buildSchedule(data)`, `assignShift(data)` | new `Schedule`, `Schedule.addShift(shift)` |
| Publish | `publishSchedule()` | `StoreOwner.publishSchedule(schedule)` |
| Cancel a shift | `cancelSelectedShift()` | `EmployeeShift.cancelShift()` |
| Employee views own schedule (published shifts only) | `viewMySchedule(employeeId)` | `Store.findEmployee()`, `Employee.viewSchedule()` |

Extra checks: dates must be `YYYY-MM-DD`, times `HH:MM` (24-hour); an employee cannot have two overlapping shifts on the same day; cancelled shifts cannot be edited and stay cancelled when the schedule is published again.

Feature 5 commands:

```
npm run scheduling:demo         # prints every screen of the use case (uses a temporary database)
npm run scheduling-page:check   # tests the page and controller, all alternate flows (temporary database)
npm run scheduling:check        # tests the domain classes (needs db:setup + db:seed)
npm run scheduling:migrate      # adds the new EmployeeShift.role column to an existing database
```

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
