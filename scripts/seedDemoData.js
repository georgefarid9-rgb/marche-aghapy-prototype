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
  SaleItem,
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


// ----- Feature 2: sales that match each day's register total -----
//
// The Dashboard tile, the "Sales – last 7 days" chart and the Sales Report read Sale
// records, while Accounting holds each day's register total ("Daily sales" revenue).
// For every such day, seedSalesForDay() creates 15 to 40 realistic sales whose totals add
// up to that register total to the cent, so every screen shows the same figures.
// Rows are inserted directly (bulkCreate): seeding history must not change stock levels.

// Shelf prices in CAD. PROD-001, PROD-002 and PROD-008 use the unit prices already on
// SALE-001 and SALE-002.
const UNIT_PRICES = {
  "PROD-001": 2.5, "PROD-002": 8.99, "PROD-003": 6.99, "PROD-004": 3.49, "PROD-005": 7.49,
  "PROD-006": 16.99, "PROD-007": 7.99, "PROD-008": 6.49, "PROD-009": 6.29, "PROD-010": 4.99,
  "PROD-011": 9.49, "PROD-012": 6.79, "PROD-013": 8.49, "PROD-014": 5.99,
};
const PRODUCT_IDS = Object.keys(UNIT_PRICES);
const PAYMENT_METHODS = ["Debit", "Debit", "Credit", "Credit", "Cash"];
const CASHIERS = ["EMP-001", "EMP-001", "EMP-003"];
const KNOWN_CUSTOMERS = ["CUST-001", "CUST-002", "CUST-003"];

// Small repeatable random generator, so every demo reset builds the same sales.
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// The fewest items (product, quantity) whose prices add up to exactly `cents`, or null.
function exactBasket(cents) {
  const prices = PRODUCT_IDS.map((id) => Math.round(UNIT_PRICES[id] * 100));
  const best = new Array(cents + 1).fill(Infinity);
  const choice = new Array(cents + 1).fill(-1);
  best[0] = 0;
  for (let amount = 1; amount <= cents; amount += 1) {
    prices.forEach((price, index) => {
      if (price <= amount && best[amount - price] + 1 < best[amount]) {
        best[amount] = best[amount - price] + 1;
        choice[amount] = index;
      }
    });
  }
  if (best[cents] === Infinity) return null;
  const counts = {};
  for (let amount = cents; amount > 0; amount -= prices[choice[amount]]) {
    const id = PRODUCT_IDS[choice[amount]];
    counts[id] = (counts[id] || 0) + 1;
  }
  return Object.entries(counts).map(([productId, quantity]) => ({ productId, quantity }));
}

function basketCents(items) {
  return items.reduce((sum, item) => sum + item.quantity * Math.round(UNIT_PRICES[item.productId] * 100), 0);
}

// Baskets for one day: random baskets until a little is left, then one last basket
// that matches the remainder exactly.
function basketsForDay(totalCents, random) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const baskets = [];
    let remaining = totalCents;
    while (remaining > 16000) {
      const lines = 2 + Math.floor(random() * 6);
      const items = [];
      for (const productId of [...PRODUCT_IDS].sort(() => random() - 0.5).slice(0, lines)) {
        items.push({ productId, quantity: 1 + Math.floor(random() * 3) });
      }
      const cents = basketCents(items);
      if (cents <= remaining - 4000) {
        baskets.push(items);
        remaining -= cents;
      } else if (cents > remaining) {
        continue;
      } else {
        break;
      }
    }
    const last = exactBasket(remaining);
    if (last) {
      baskets.push(last);
      if (baskets.length >= 15 && baskets.length <= 40) return baskets;
    }
  }
  throw new Error(`Could not build sales for a register total of ${totalCents / 100}.`);
}

async function seedSalesForDay(date, registerTotal, { customerFor } = {}) {
  const totalCents = Math.round(registerTotal * 100);
  const random = randomGenerator(Number(date.replace(/-/g, "")));
  const baskets = basketsForDay(totalCents, random);
  const sales = [];
  const items = [];
  baskets.forEach((basket, index) => {
    const saleId = `SALE-${date.replace(/-/g, "")}-${String(index + 1).padStart(2, "0")}`;
    const forced = customerFor ? customerFor(index) : undefined;
    sales.push({
      saleId,
      saleDate: date,
      totalAmount: basketCents(basket) / 100,
      paymentMethod: PAYMENT_METHODS[Math.floor(random() * PAYMENT_METHODS.length)],
      customerId: forced !== undefined ? forced : random() < 0.08 ? KNOWN_CUSTOMERS[Math.floor(random() * KNOWN_CUSTOMERS.length)] : null,
      employeeId: CASHIERS[Math.floor(random() * CASHIERS.length)],
    });
    for (const item of basket) {
      items.push({ saleId, productId: item.productId, quantity: item.quantity, unitPrice: UNIT_PRICES[item.productId] });
    }
  });
  const check = sales.reduce((sum, sale) => sum + Math.round(sale.totalAmount * 100), 0);
  if (check !== totalCents) {
    throw new Error(`Sales for ${date} add up to ${check / 100}, not ${registerTotal}.`);
  }
  await Sale.bulkCreate(sales);
  await SaleItem.bulkCreate(items);
  return sales;
}

async function seedDemoData() {
  try {
    // Demo data is only for the demo database, never the team's main database.
    if (/marche-aghapy\.sqlite$/.test(String(sequelize.options.storage))) {
      throw new Error("Demo data is only added to a demo or test database (run npm run demo:reset).");
    }
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

    // Feature 6 rejection path: a customer with no phone number (look-up by ID only).
    await createCustomer({
      partnerId: "BP-008",
      customerId: "CUST-004",
      name: "Rania Saleh",
      phoneNumber: null,
      email: "rania.saleh@example.com",
      createdDate: daysFromToday(-60),
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
    // Feature 6 rejection path: a sale older than the 30-day return window. Its day also
    // gets a register total, so (as Feature 2 requires) every day with sales has one.
    entries.push([Revenue, "TXN-DEMO-045", -45, 1874.25, "Daily sales", "Register", `${weekday(-45)} register total`]);
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

    // ----- Feature 2: sales for every "Daily sales" register total in Accounting -----
    for (const [TransactionClass, , day, amount, category] of entries) {
      if (TransactionClass !== Revenue || category !== "Daily sales") continue;
      await seedSalesForDay(daysFromToday(day), amount, {
        // Feature 6 demo: the first sale 45 days ago is Mariam Hanna's (CUST-002), so her
        // return is refused (outside the 30-day window); the first sale 2 days ago is
        // Youssef Girgis's (CUST-003), and one of its items is fully returned below.
        customerFor: { [-45]: "CUST-002", [-2]: "CUST-003" }[day]
          ? (index) => (index === 0 ? { [-45]: "CUST-002", [-2]: "CUST-003" }[day] : undefined)
          : undefined,
      });
    }

    // ----- Feature 6 rejection path: an item that was already fully returned -----
    const firstSale = await Sale.findOne({
      where: { customerId: "CUST-003", saleDate: daysFromToday(-2) },
      include: [{ association: "items" }],
      order: [["saleId", "ASC"]],
    });
    const fullyReturned = firstSale ? firstSale.items[0] : null;
    if (!fullyReturned) {
      throw new Error("The demo sale for the fully returned item was not created.");
    }
    {
      const clerk = await Employee.findByPk("EMP-001");
      const result = await clerk.requestReturn(
        "CUST-003",
        firstSale.saleId,
        fullyReturned.saleItemId,
        fullyReturned.quantity,
        "Damaged product"
      );
      if (!result.refunded) {
        throw new Error(`Demo return was not refunded: ${result.reason}`);
      }
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
