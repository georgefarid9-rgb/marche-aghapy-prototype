# Marché Aghapy Store Management System Prototype

BTM 495 Prototype

## Overview

This repository contains the prototype implementation for the Marché Aghapy Store Management System.

The current prototype includes the Product and Inventory Management subsystem.

## Technologies

- Node.js
- Sequelize
- SQLite
- Git / GitHub

## Current Domain Classes

### Supplier
- supplierId
- supplierName
- leadTimeDays

### Product
- productId
- productName
- description

### InventoryRecord
- inventoryId
- quantityOnHand
- expiryDate
- lastUpdated

### RestockAlert
- alertId
- reorderInformation

## Class Relationships

- One Supplier can supply zero or many Products.
- Each Product has one InventoryRecord.
- One InventoryRecord can generate zero or many RestockAlerts.

## Installation

Install project dependencies:

```bash
npm install
```

## Test Database Connection

```bash
npm run db:test
```

## Create Database Tables

```bash
npm run db:setup
```

## Insert Sample Data

```bash
npm run db:seed
```

## Verify Prototype

```bash
npm run prototype:check
```

The verification script retrieves a Product together with its related Supplier, InventoryRecord, and RestockAlert.

## Database

The project uses SQLite.

The generated database file is created locally at:

```text
database/marche-aghapy.sqlite
```

The SQLite database file is excluded from Git version control and can be recreated using the database setup and seed scripts.

## Git Workflow

Development is performed using feature branches.

Current inventory development branch:

```text
feature/inventory
```

## Feature 5 – Employee Management / Scheduling

Branch: `feature/employee-scheduling`

### Domain Classes

#### StoreOwner
- ownerId, ownerName, phoneNumber, email
- reviewComplaint(complaint), resolveCase(complaint), reviewRestockAlert(), editShift(shift, startTime, endTime), publishSchedule(schedule)

#### Store
- storeId, storeName, address

#### Employee
- employeeId, employeeName, phoneNumber, email, role
- viewSchedule(), searchAccount(id), assistCustomer(), createComplaintCase(), addSoldProduct(item), removeSoldProduct(item)

#### Schedule
- scheduleId, startDate, endDate
- addShift(shift), displayShifts(), save()

#### EmployeeShift
- shiftId, shiftDate, startTime, endTime, shiftStatus
- validate(), updateShift(startTime, endTime)

### Class Relationships

- One StoreOwner owns one or many Stores.
- One Store employs one or many Employees.
- One Store has zero or many Schedules.
- One Employee works zero or many EmployeeShifts.
- One Schedule contains zero or many EmployeeShifts (aggregation).

### Verify Feature 5

```bash
npm run db:setup
npm run db:seed
npm run scheduling:check
```

Methods that depend on other features' classes (Customer, ComplaintCase, SaleItem) are placeholders until those teams add their classes.

The script adds a shift, shows an invalid shift being rejected, edits a shift as the store owner, publishes the schedule, and shows one employee's own schedule.
