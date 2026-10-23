const sequelize = require("../src/database");

const {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
  StoreOwner,
  Store,
  Employee,
  Schedule,
  EmployeeShift,
} = require("../src/models");

async function seedDatabase() {
  try {
    await sequelize.authenticate();

    await Supplier.create({
      supplierId: "SUP-001",
      supplierName: "Sample Supplier",
      leadTimeDays: 7,
    });

   await Product.create({
  productId: "PROD-001",
  productName: "Foul Medames",
  description: "Egyptian canned fava beans",
  category: "Canned Foods",
  supplierId: "SUP-001",
});

    await InventoryRecord.create({
      inventoryId: "INV-001",
      quantityOnHand: 20,
      expiryDate: "2027-03-30",
      lastUpdated: new Date(),
      productId: "PROD-001",
    });

    await RestockAlert.create({
      alertId: "ALERT-001",
      reorderInformation: "Reorder from supplier",
      inventoryId: "INV-001",
    });

    // ----- Feature 5 - Employee Management / Scheduling -----

    await StoreOwner.create({
      ownerId: "OWN-001",
      ownerName: "Store Owner",
      phoneNumber: "514-555-0100",
      email: "owner@marcheaghapy.ca",
    });

    await Store.create({
      storeId: "STORE-001",
      storeName: "Marché Aghapy",
      address: "Montréal, QC",
      ownerId: "OWN-001",
    });

    await Employee.bulkCreate([
      {
        employeeId: "EMP-001",
        employeeName: "Cashier One",
        phoneNumber: "514-555-0101",
        email: "cashier1@marcheaghapy.ca",
        role: "Cashier",
        storeId: "STORE-001",
      },
      {
        employeeId: "EMP-002",
        employeeName: "Stock Clerk One",
        phoneNumber: "514-555-0102",
        email: "stock1@marcheaghapy.ca",
        role: "Stock Clerk",
        storeId: "STORE-001",
      },
    ]);

    await Schedule.create({
      scheduleId: "SCH-001",
      startDate: "2026-11-02",
      endDate: "2026-11-08",
      storeId: "STORE-001",
    });

    await EmployeeShift.bulkCreate(
      [
        {
          shiftId: "SHIFT-001",
          shiftDate: "2026-11-02",
          startTime: "08:00:00",
          endTime: "16:00:00",
          shiftStatus: "Draft",
          employeeId: "EMP-001",
          scheduleId: "SCH-001",
        },
        {
          shiftId: "SHIFT-002",
          shiftDate: "2026-11-02",
          startTime: "12:00:00",
          endTime: "20:00:00",
          shiftStatus: "Draft",
          employeeId: "EMP-002",
          scheduleId: "SCH-001",
        },
      ],
      { validate: true }
    );

    console.log("Sample data inserted successfully.");
  } catch (error) {
    console.error("Seeding failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

seedDatabase();