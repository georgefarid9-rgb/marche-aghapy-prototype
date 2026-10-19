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