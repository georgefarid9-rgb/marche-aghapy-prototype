// Extra sample data for the web demo (npm run demo:reset).
//
// Runs AFTER scripts/seedDatabase.js and only on the demo database. It adds a few
// realistic grocery products, suppliers, customers, deliveries, sales, accounting
// transactions and shifts so every screen has something to show. Everything is created
// through the team's own classes (InventoryController, Ledger.addTransaction,
// ScheduleController, ...), so the same validation rules apply as in the app.

const sequelize = require("../src/database");
const {
  BusinessPartner,
  Supplier,
  Customer,
  PerformanceRecord,
  Employee,
  Sale,
  Ledger,
  Revenue,
  Expense,
} = require("../src/models");
const InventoryController = require("../src/controllers/InventoryController");
const ScheduleController = require("../src/controllers/ScheduleController");
const { today } = require("../src/utils/dates");

// "YYYY-MM-DD" a number of days from today (negative = in the past).
function daysFromToday(days) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The Monday of the current week.
function mondayThisWeek() {
  const date = new Date(`${today()}T00:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createSupplier({ partnerId, supplierId, name, contact, leadTimeDays, paymentTerms }) {
  await sequelize.transaction(async (transaction) => {
    await BusinessPartner.create(
      { partnerId, partnerName: name, partnerType: "Supplier", partnerStatus: "Active" },
      { transaction }
    );
    await Supplier.create(
      { supplierId, partnerId, contactInformation: contact, leadTimeDays, paymentTerms },
      { transaction }
    );
  });
}

async function createCustomer({ partnerId, customerId, name, phoneNumber, email, createdDate }) {
  await sequelize.transaction(async (transaction) => {
    await BusinessPartner.create(
      { partnerId, partnerName: name, partnerType: "Customer", partnerStatus: "Active" },
      { transaction }
    );
    await Customer.create({ customerId, partnerId, phoneNumber, email, createdDate }, { transaction });
  });
}

async function createProduct(controller, details) {
  await controller.submitNewProduct(JSON.stringify(details));
  if (controller.lastError) {
    throw new Error(`Product ${details.productId}: ${controller.lastError}`);
  }
}

async function seedDemoData() {
  try {
    await sequelize.authenticate();

    if (await Supplier.findByPk("SUP-002")) {
      console.log("Demo data already added.");
      return;
    }

    // ----- Feature 3: suppliers and customers (names from the Milestone 6 wireframes) -----
    await createSupplier({
      partnerId: "BP-003",
      supplierId: "SUP-002",
      name: "Hellenic Foods Inc.",
      contact: "orders@hellenicfoods.ca · 514-555-0420",
      leadTimeDays: 7,
      paymentTerms: "Net 30",
    });
    await createSupplier({
      partnerId: "BP-004",
      supplierId: "SUP-003",
      name: "Montréal Fresh Bakery",
      contact: "sales@mtlfreshbakery.ca · 438-555-0177",
      leadTimeDays: 2,
      paymentTerms: "Net 15",
    });
    await createSupplier({
      partnerId: "BP-007",
      supplierId: "SUP-004",
      name: "Nile Valley Imports",
      contact: "orders@nilevalley.ca · 514-555-0488",
      leadTimeDays: 10,
      paymentTerms: "Net 30",
    });
    await createCustomer({
      partnerId: "BP-005",
      customerId: "CUST-002",
      name: "Mariam Hanna",
      phoneNumber: "514-555-0311",
      email: "mariam.hanna@example.com",
      createdDate: daysFromToday(-40),
    });
    await createCustomer({
      partnerId: "BP-006",
      customerId: "CUST-003",
      name: "Youssef Girgis",
      phoneNumber: "438-555-0142",
      email: "youssef.g@example.com",
      createdDate: daysFromToday(-12),
    });

    // ----- Feature 1: products and inventory (the products in wireframes 1.1 and 2.3) -----
    const inventory = new InventoryController();
    const products = [
      // id, name, description, category, supplier, qty, reorder, expiry (days from today, or null)
      ["PROD-002", "Feta Cheese 400g", "Barrel-aged feta", "Dairy", "SUP-002", 12, 10, 42],
      ["PROD-003", "Kalamata Olives 500g", "In brine", "Pantry", "SUP-002", 34, 15, 263],
      ["PROD-004", "Pita Bread (6 pk)", "Baked daily", "Bakery", "SUP-003", 8, 12, 4],
      ["PROD-005", "Greek Yogurt 1kg", "10% M.F.", "Dairy", "SUP-002", 20, 10, 9],
      ["PROD-006", "Extra Virgin Olive Oil 1L", "Cold pressed", "Pantry", "SUP-002", 5, 8, 490],
      ["PROD-007", "Halloumi 250g", "Grilling cheese", "Dairy", "SUP-002", 0, 6, null],
      ["PROD-008", "Tahini 450g", "Sesame paste", "Pantry", "SUP-004", 27, 10, 200],
      ["PROD-009", "Labneh 500g", "Strained yogurt", "Dairy", "SUP-002", 9, 8, 20],
      ["PROD-010", "Kefir 1L", "Cultured milk", "Dairy", "SUP-002", 14, 10, 14],
      ["PROD-011", "Kasseri Cheese 300g", "Sheep's milk cheese", "Dairy", "SUP-002", 11, 6, 60],
      ["PROD-012", "Butter 454g", "Salted", "Dairy", "SUP-002", 22, 12, 45],
      ["PROD-013", "Basmati Rice 2kg", "Long grain", "Grains", "SUP-004", 40, 12, 365],
      ["PROD-014", "Pomegranate Molasses 300ml", "Tangy syrup", "Pantry", "SUP-004", 15, 5, 300],
    ];
    for (const [productId, productName, description, category, supplierId, quantityOnHand, reorderLevel, expiry] of products) {
      await createProduct(inventory, {
        productId,
        productName,
        description,
        category,
        supplierId,
        inventoryId: productId.replace("PROD", "INV"),
        quantityOnHand,
        reorderLevel,
        ...(expiry === null ? {} : { expiryDate: daysFromToday(expiry) }),
      });
    }

    // ----- Feature 3: delivery history for the new suppliers -----
    await PerformanceRecord.bulkCreate([
      {
        recordId: "PERF-004",
        deliveryDate: daysFromToday(-30),
        expectedDeliveryDate: daysFromToday(-30),
        quantityOrdered: 60,
        quantityReceived: 60,
        conditionRating: "Good",
        supplierId: "SUP-002",
        employeeId: "EMP-002",
      },
      {
        recordId: "PERF-005",
        deliveryDate: daysFromToday(-14),
        expectedDeliveryDate: daysFromToday(-16),
        quantityOrdered: 48,
        quantityReceived: 48,
        conditionRating: "Good",
        supplierId: "SUP-002",
        employeeId: "EMP-002",
      },
      {
        recordId: "PERF-006",
        deliveryDate: daysFromToday(-2),
        expectedDeliveryDate: daysFromToday(-2),
        quantityOrdered: 30,
        quantityReceived: 30,
        conditionRating: "Good",
        supplierId: "SUP-003",
        employeeId: "EMP-002",
      },
      {
        recordId: "PERF-007",
        deliveryDate: daysFromToday(-9),
        expectedDeliveryDate: daysFromToday(-10),
        quantityOrdered: 40,
        quantityReceived: 40,
        conditionRating: "Good",
        supplierId: "SUP-004",
        employeeId: "EMP-002",
      },
    ]);

    // ----- Feature 5: a third employee and this week's schedule -----
    await Employee.create({
      employeeId: "EMP-003",
      employeeName: "Mina Boutros",
      phoneNumber: "514-555-0103",
      email: "mina@marcheaghapy.ca",
      role: "Store Associate",
      storeId: "STORE-001",
    });
    const scheduling = new ScheduleController();
    const monday = mondayThisWeek();
    const schedule = await scheduling.createSchedule({
      scheduleId: "SCH-002",
      startDate: monday,
      endDate: addDays(monday, 6),
    });
    if (!schedule) {
      throw new Error(`Schedule: ${scheduling.lastError}`);
    }
    const shifts = [
      ["SHIFT-101", "EMP-001", 0, "08:00", "16:00", "Cashier"],
      ["SHIFT-102", "EMP-002", 0, "12:00", "20:00", "Stock Clerk"],
      ["SHIFT-103", "EMP-003", 1, "09:00", "17:00", "Store Associate"],
      ["SHIFT-104", "EMP-001", 2, "08:00", "16:00", "Cashier"],
      ["SHIFT-105", "EMP-003", 3, "12:00", "20:00", "Store Associate"],
    ];
    for (const [shiftId, employeeId, day, startTime, endTime, role] of shifts) {
      const shift = await scheduling.assignShift(schedule, {
        shiftId,
        employeeId,
        shiftDate: addDays(monday, day),
        startTime,
        endTime,
        role,
      });
      if (!shift) {
        throw new Error(`Shift ${shiftId}: ${scheduling.lastError}`);
      }
    }

    // ----- Sales (Feature 2 dashboard, Feature 6 purchase history) -----
    await Sale.create({
      saleId: "SALE-002",
      saleDate: today(),
      totalAmount: 0,
      paymentMethod: "Credit",
      customerId: "CUST-002",
      employeeId: "EMP-001",
    });
    const sale = await Sale.findByPk("SALE-002");
    await sale.addItem({ productId: "PROD-002", quantity: 2, unitPrice: 8.99 });
    await sale.addItem({ productId: "PROD-008", quantity: 1, unitPrice: 6.49 });

    // ----- Feature 4: a few days of accounting -----
    const ledger = await Ledger.findOne({ where: { storeId: "STORE-001" } });
    const weekday = (days) =>
      new Date(`${daysFromToday(days)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const dailySales = [3120.4, 2705.15, 1930.6, 2012.85, 2214.3, 2612.3]; // 6 days ago .. yesterday
    const entries = dailySales.map((amount, i) => {
      const day = i - 6;
      return [Revenue, `TXN-DEMO-${String(i + 1).padStart(3, "0")}`, day, amount, "Daily sales", "Register", `${weekday(day)} register total`];
    });
    entries.push(
      [Expense, "TXN-DEMO-101", -5, 2100.0, "Rent", "Landlord", "Store rent – November"],
      [Expense, "TXN-DEMO-102", -2, 214.6, "Utilities", "Hydro-Québec", "Electricity – November"],
      [Expense, "TXN-DEMO-103", -1, 1180.0, "Supplier payment", "Hellenic Foods Inc.", "Hellenic Foods invoice #4471"]
    );
    for (const [TransactionClass, transactionId, day, amount, category, source, description] of entries) {
      const entry = TransactionClass.build({
        transactionId,
        date: daysFromToday(day),
        amount,
        category,
        source,
        description,
        transactionType: TransactionClass === Revenue ? "Revenue" : "Expense",
      });
      entry.categorize();
      await ledger.addTransaction(entry);
    }

    console.log("Demo data added.");
  } catch (error) {
    console.error("Adding demo data failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

seedDemoData();
