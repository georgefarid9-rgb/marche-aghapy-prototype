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

## 7. Team Collaboration

The project was developed collaboratively by Group 1.

Each team member was responsible for a specific feature, allowing the team to work on different parts of the system simultaneously.

GitHub was used to organize development through separate branches and pull requests. Changes were reviewed, tested, and integrated into the main project as development progressed.

This approach helped the team coordinate its work and maintain consistency across the system.

## 8. Project Status

The project is currently in the Prototype 2 development stage.

Major improvements have been integrated into the inventory, supplier and customer profiles, accounting, employee scheduling, and customer support features.

The dashboard and reporting functionality is undergoing further development to meet the updated system requirements.

The team continues to review and test the prototype against its revised class diagrams and system specifications.

## 9. Conclusion

The Marché Aghapy Store Management System demonstrates how information technology can support the operations of a small grocery business.

Through the development of the two prototypes, the team has established a foundation for managing important business activities in a more organized and consistent way.

The project also demonstrates the practical application of systems analysis, object-oriented design, database management, software development, and teamwork.

**This project is an academic technical prototype and is not intended to serve as a fully deployed commercial application.**
