# Marché Aghapy Store Management System Prototype

**BTM 495 Prototype**

## Overview

This repository contains a prototype of the Marché Aghapy Store Management System, built with Node.js, Sequelize, and SQLite.

The prototype includes Product and Inventory Management, Scheduling, and Accounting functionality.

## Technologies

- Node.js
- Sequelize
- SQLite
- Git / GitHub

## Current Domain Classes

### Product and Inventory Management

- **Supplier** — supplier details and lead time
- **Product** — product information
- **InventoryRecord** — inventory quantities, expiry dates, and update information
- **RestockAlert** — restocking information

### Scheduling

The scheduling subsystem supports stores, owners, employees, and employee shifts, including shift creation, editing, validation, and schedule viewing.

### Accounting

- **Ledger** — maintains a store's ledger and calculates its balance and transaction summary
- **Transaction** — records revenue and expenses with transaction details
- **FinancialReport** — calculates revenue, expenses, and net profit for a ledger and reporting period
- **BudgetThreshold** — checks whether an amount exceeds a configured budget limit

## Installation

Install project dependencies:

```bash
npm install
```

## Database Commands

Test the database connection:

```bash
npm run db:test
```

Create database tables:

```bash
npm run db:setup
```

**Warning:** The setup script recreates database tables and may delete existing data. Use only when it is safe to reset the database.

Insert sample data:

```bash
npm run db:seed
```

## Verification Commands

Verify the prototype:

```bash
npm run prototype:check
```

Verify scheduling:

```bash
npm run scheduling:check
```

Verify accounting:

```bash
npm run accounting:check
```

Verify accounting reports and budget thresholds:

```bash
npm run accounting-reports:check
```

The accounting verification scripts test ledger transactions, balance calculations, financial report totals, and budget threshold checks.

## Database

The project uses SQLite. The default database file is:

```text
database/marche-aghapy.sqlite
```

Database files are excluded from Git version control. Verification scripts should be run against an appropriately prepared database.

## Git Workflow

Development is performed using feature branches. Make sure your changes are committed to the correct feature branch before submitting or merging them.