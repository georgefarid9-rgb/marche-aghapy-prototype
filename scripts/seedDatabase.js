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
  Sale,
  SaleItem,
  ComplaintCase,
  SupportRequest,
  ReturnRequest,
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
      reorderLevel: 15,
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

    // ----- Feature 6 - Customer Support -----
    // The sample customer CUST-001 is created by the Feature 3 seed data
    // (branch feature/supplier-customer-profiles). Until that is merged, the
    // customerId below is only a plain value and no Customer row exists.

    const today = new Date().toISOString().slice(0, 10);

    await Sale.create({
      saleId: "SALE-001",
      saleDate: today,
      totalAmount: 0,
      paymentMethod: "Debit",
      customerId: "CUST-001",
      employeeId: "EMP-001",
    });

    // addItem() also recalculates the sale total: 3 x 2.50 = 7.50.
    const sale = await Sale.findByPk("SALE-001");
    await sale.addItem({ productId: "PROD-001", quantity: 3, unitPrice: 2.5 });

    await SupportRequest.create({
      requestId: "REQ-001",
      requestDate: today,
      subject: "Question about an order",
      description: "Customer asked whether the last order was charged correctly.",
      requestStatus: "Open",
      customerId: "CUST-001",
      employeeId: "EMP-001",
    });

    await ComplaintCase.create({
      caseId: "CASE-001",
      category: "Product quality",
      description: "A can of Foul Medames was dented when purchased.",
      status: "Open",
      dateCreated: today,
      customerId: "CUST-001",
      employeeId: "EMP-001",
    });

    await ReturnRequest.create({
      returnId: "RET-001",
      reason: "Damaged product",
      amount: 2.5,
      status: "Pending",
      customerId: "CUST-001",
      saleId: "SALE-001",
      employeeId: "EMP-001",
    });

    console.log("Sample data inserted successfully.");
  } catch (error) {
    console.error("Seeding failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

seedDatabase();