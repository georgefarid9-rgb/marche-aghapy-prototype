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
  BusinessPartner,
  Customer,
  PerformanceRecord,
  Sale,
  SaleItem,
  ComplaintCase,
  SupportRequest,
  ReturnRequest,
} = require("../src/models");

async function seedDatabase() {
  try {
    await sequelize.authenticate();

    // Feature 3: the supplier's shared BusinessPartner profile must exist
    // before the Supplier row that points to it.
    await BusinessPartner.create({
      partnerId: "BP-001",
      partnerName: "Sample Supplier",
      partnerStatus: "Active",
      partnerType: "Supplier",
    });

    await Supplier.create({
      supplierId: "SUP-001",
      supplierName: "Sample Supplier",
      leadTimeDays: 7,
      contactInformation: "orders@samplesupplier.ca",
      paymentTerms: "Net 30",
      partnerId: "BP-001",
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

    // ----- Feature 3 - Supplier and Customer Profile Management -----

    await BusinessPartner.create({
      partnerId: "BP-002",
      partnerName: "Sample Customer",
      partnerStatus: "Active",
      partnerType: "Customer",
    });

    await Customer.create({
      customerId: "CUST-001",
      phoneNumber: "514-555-0200",
      email: "customer1@example.com",
      createdDate: "2026-10-01",
      partnerId: "BP-002",
    });

    // Two deliveries from SUP-001, recorded by the stock clerk (EMP-002):
    // one complete and on time, one late and short.
    await PerformanceRecord.bulkCreate(
      [
        {
          recordId: "PERF-001",
          expectedDeliveryDate: "2026-10-05",
          deliveryDate: "2026-10-05",
          quantityOrdered: 40,
          quantityReceived: 40,
          conditionRating: "Good",
          supplierId: "SUP-001",
          employeeId: "EMP-002",
        },
        {
          recordId: "PERF-002",
          expectedDeliveryDate: "2026-10-12",
          deliveryDate: "2026-10-15",
          quantityOrdered: 50,
          quantityReceived: 45,
          conditionRating: "Acceptable",
          supplierId: "SUP-001",
          employeeId: "EMP-002",
        },
      ],
      { validate: true }
    );

    // ----- Feature 6 - Customer Support -----
    // The sample customer CUST-001 is created by the Feature 3 seed data above,
    // so it must stay before these rows.

    const { today: todayString } = require("../src/utils/dates");
    const today = todayString();

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