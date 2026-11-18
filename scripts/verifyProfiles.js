const assert = require("node:assert/strict");
const sequelize = require("../src/database");

const {
  BusinessPartner,
  Supplier,
  Customer,
  PerformanceRecord,
  Employee,
  StoreOwner,
} = require("../src/models");

// Feature 3 verification. Every step is checked with an assertion.
// Any failed check stops the script with exit code 1, so it cannot
// report success when something is wrong.

let passed = 0;

function pass(message) {
  passed += 1;
  console.log(`  PASS  ${message}`);
}

// Run fn and confirm it is rejected (throws or rejects).
async function expectRejected(fn, message) {
  let rejected = false;
  try {
    await fn();
  } catch (err) {
    rejected = true;
    console.log(`  PASS  ${message} -> rejected: ${err.message.split("\n")[0]}`);
  }
  assert.ok(rejected, `${message}: expected the operation to be rejected, but it succeeded`);
  passed += 1;
}

async function verifyProfiles() {
  // Values changed during the checks, restored at the end.
  let supplierPartner;
  let customerPartner;
  let originalSupplierName;
  let originalCustomerName;

  try {
    await sequelize.authenticate();

    // ----- 1. Seeded supplier, its profile and its deliveries -----
    console.log("\n1. Supplier profile and performance records");

    const supplier = await Supplier.findOne({
      where: { supplierId: "SUP-001" },
      include: [
        { model: BusinessPartner, as: "partner" },
        {
          model: PerformanceRecord,
          as: "performanceRecords",
          include: [{ model: Employee, as: "recordedBy" }],
        },
      ],
      order: [[{ model: PerformanceRecord, as: "performanceRecords" }, "recordId", "ASC"]],
    });

    assert.ok(supplier, "SUP-001 not found. Run npm run db:setup and npm run db:seed first.");
    assert.ok(supplier.partner, "SUP-001 has no BusinessPartner profile.");
    assert.equal(supplier.partner.partnerType, "Supplier");
    assert.equal(supplier.supplierName, supplier.partner.partnerName);
    pass(`SUP-001 is linked to ${supplier.partnerId} (${supplier.partner.partnerName}), names match`);

    const records = supplier.performanceRecords;
    assert.equal(records.length, 3, "Expected 3 seeded performance records.");
    const [perf1, perf2, perf3] = records;

    assert.equal(perf1.calculateFillRate(), 100);
    assert.equal(perf1.calculateDeliveryDelay(), 0);
    assert.equal(perf1.flagDiscrepancy(), false);
    assert.equal(perf1.recordedBy.employeeId, "EMP-002");
    pass("PERF-001: fill rate 100%, on time, no discrepancy, recorded by EMP-002");

    assert.equal(perf2.calculateFillRate(), 90);
    assert.equal(perf2.calculateDeliveryDelay(), 3);
    assert.equal(perf2.flagDiscrepancy(), true);
    assert.equal(perf2.fillRate, 90, "derived /fillRate should match calculateFillRate()");
    assert.equal(perf2.deliveryDelay, 3, "derived /deliveryDelay should match calculateDeliveryDelay()");
    pass("PERF-002: fill rate 90%, 3 days late, discrepancy flagged, derived attributes match");

    assert.equal(await supplier.evaluatePerformance(), 95);
    pass("evaluatePerformance() returns 95: average of the planned deliveries (100 and 90), unplanned PERF-003 left out");

    assert.equal(supplier.getSupplierLeadTime(), 7);
    pass("getSupplierLeadTime() returns 7 days");

    // ----- 1b. Unplanned delivery (alternate flow 6b) -----
    console.log("\n1b. Unplanned delivery");

    assert.equal(perf3.recordId, "PERF-003");
    assert.equal(perf3.isUnplanned, true);
    assert.equal(perf3.quantityOrdered, null);
    assert.equal(perf3.calculateFillRate(), 0);
    assert.equal(perf3.calculateDeliveryDelay(), null);
    assert.equal(perf3.flagDiscrepancy(), false);
    pass("PERF-003 is unplanned: fill rate 0, no delay, no discrepancy in Good condition");

    const poorUnplanned = PerformanceRecord.build({
      recordId: "PERF-UNPLANNED-POOR",
      deliveryDate: "2026-10-21",
      quantityReceived: 5,
      conditionRating: "Poor",
      isUnplanned: true,
      supplierId: "SUP-001",
      employeeId: "EMP-002",
    });
    assert.equal(poorUnplanned.flagDiscrepancy(), true);
    pass("an unplanned delivery in Poor condition is flagged");

    await expectRejected(
      () => PerformanceRecord.create({
        recordId: "PERF-PLANNED-NO-ORDER",
        deliveryDate: "2026-10-21",
        quantityReceived: 5,
        supplierId: "SUP-001",
        employeeId: "EMP-002",
      }),
      "a planned delivery without quantityOrdered and expectedDeliveryDate"
    );

    // ----- 1c. StoreOwner notifications (6a, 6b) -----
    console.log("\n1c. Store owner notifications");

    const owner = await StoreOwner.findByPk("OWN-001");
    assert.ok(owner, "OWN-001 not found.");
    const discrepancyNotice = await owner.notifyDiscrepancy("PERF-002");
    assert.equal(discrepancyNotice.type, "Discrepancy");
    assert.equal(discrepancyNotice.supplierId, "SUP-001");
    pass(`notifyDiscrepancy("PERF-002") -> ${discrepancyNotice.message}`);

    const unplannedNotice = await owner.notifyUnplannedDelivery("PERF-003");
    assert.equal(unplannedNotice.type, "Unplanned delivery");
    pass(`notifyUnplannedDelivery("PERF-003") -> ${unplannedNotice.message}`);

    await expectRejected(
      () => owner.notifyDiscrepancy("PERF-001"),
      'notifyDiscrepancy("PERF-001"), a delivery with no discrepancy'
    );
    await expectRejected(
      () => owner.notifyUnplannedDelivery("PERF-001"),
      'notifyUnplannedDelivery("PERF-001"), a planned delivery'
    );

    // ----- 2. Over-delivery -----
    console.log("\n2. Over-delivery");

    const over = PerformanceRecord.build({
      recordId: "PERF-OVER",
      expectedDeliveryDate: "2026-10-20",
      deliveryDate: "2026-10-19",
      quantityOrdered: 40,
      quantityReceived: 48,
      conditionRating: "Good",
      supplierId: "SUP-001",
      employeeId: "EMP-002",
    });
    assert.equal(over.calculateFillRate(), 100);
    assert.equal(over.flagDiscrepancy(), true);
    assert.equal(over.calculateDeliveryDelay(), -1);
    pass("48 received of 40 ordered: fill rate capped at 100%, discrepancy flagged, 1 day early");

    // ----- 3. Required references -----
    console.log("\n3. Required Supplier and Employee references");

    await expectRejected(
      () => PerformanceRecord.create({
        recordId: "PERF-NO-SUP",
        expectedDeliveryDate: "2026-10-20",
        deliveryDate: "2026-10-20",
        quantityOrdered: 10,
        quantityReceived: 10,
        employeeId: "EMP-002",
      }),
      "PerformanceRecord without a supplierId"
    );

    await expectRejected(
      () => PerformanceRecord.create({
        recordId: "PERF-NO-EMP",
        expectedDeliveryDate: "2026-10-20",
        deliveryDate: "2026-10-20",
        quantityOrdered: 10,
        quantityReceived: 10,
        supplierId: "SUP-001",
      }),
      "PerformanceRecord without an employeeId"
    );

    await expectRejected(
      () => PerformanceRecord.create({
        recordId: "PERF-BAD-SUP",
        expectedDeliveryDate: "2026-10-20",
        deliveryDate: "2026-10-20",
        quantityOrdered: 10,
        quantityReceived: 10,
        supplierId: "SUP-DOES-NOT-EXIST",
        employeeId: "EMP-002",
      }),
      "PerformanceRecord pointing to a supplier that does not exist"
    );

    // ----- 4. partnerType consistency -----
    console.log("\n4. partnerType matches the linked subtype");

    await expectRejected(
      () => Customer.create({ customerId: "CUST-BAD", partnerId: "BP-001" }),
      "Customer linked to a Supplier partner (BP-001)"
    );

    await expectRejected(
      () => Supplier.create({ supplierId: "SUP-BAD", partnerId: "BP-002" }),
      "Supplier linked to a Customer partner (BP-002)"
    );

    supplierPartner = await BusinessPartner.findByPk("BP-001");
    await expectRejected(
      async () => {
        supplierPartner.partnerType = "Customer";
        await supplierPartner.save();
      },
      "Changing BP-001's partnerType from Supplier to Customer"
    );
    await supplierPartner.reload();
    assert.equal(supplierPartner.partnerType, "Supplier");

    // ----- 5. One authoritative supplier name -----
    console.log("\n5. Supplier name stays consistent");

    originalSupplierName = supplierPartner.partnerName;
    await supplierPartner.updateProfile({ partnerName: "Cairo Imports" });
    const renamed = await Supplier.findByPk("SUP-001");
    assert.equal(renamed.supplierName, "Cairo Imports");
    pass("updateProfile() on BP-001 also renames SUP-001's supplierName");

    await expectRejected(
      async () => {
        renamed.supplierName = "A Different Name";
        await renamed.save();
      },
      "Setting supplierName directly to a different name"
    );

    // Put the original name back now, so the checks below see the seeded data.
    await supplierPartner.reload();
    await supplierPartner.updateProfile({ partnerName: originalSupplierName });

    // ----- 6. Customer profile -----
    console.log("\n6. Customer profile");

    const customer = await Customer.findByPk("CUST-001");
    assert.ok(customer, "CUST-001 not found.");
    const info = await customer.retrieveInfo();
    assert.equal(typeof info, "string", "retrieveInfo() should return a String");
    for (const expected of [
      "Partner ID: BP-002",
      "Name: Sample Customer",
      "Type: Customer",
      "Status: Active",
      "Customer ID: CUST-001",
      "Email: customer1@example.com",
    ]) {
      assert.ok(info.includes(expected), `retrieveInfo() is missing "${expected}"`);
    }
    pass("Customer.retrieveInfo() returns the shared profile and the customer fields as a String");

    const supplierInfo = await (await Supplier.findByPk("SUP-001")).retrieveInfo();
    assert.ok(supplierInfo.includes("Type: Supplier"));
    assert.ok(supplierInfo.includes("Supplier ID: SUP-001"));
    assert.ok(supplierInfo.includes("Payment terms: Net 30"));
    pass("Supplier.retrieveInfo() works too (moved up to BusinessPartner)");

    assert.deepEqual(customer.contactEmployee("  Where is my order?  "), {
      customerId: "CUST-001",
      question: "Where is my order?",
    });
    await expectRejected(async () => customer.contactEmployee(""), "contactEmployee() without a question");

    const history = await customer.listPurchaseHistory();
    assert.ok(Array.isArray(history), "listPurchaseHistory() should return a list");
    if (typeof customer.getSales === "function") {
      pass(`listPurchaseHistory() reads the Sale model: ${history.length} sale(s) for CUST-001`);
    } else {
      assert.equal(history.length, 0);
      pass("listPurchaseHistory() returns [] (Sale model not in the prototype yet)");
    }

    // ----- 6b. findProfile() (alternate flows 2a, 5a) -----
    console.log("\n6b. findProfile()");

    assert.equal((await Customer.findProfile("514-555-0200")).customerId, "CUST-001");
    assert.equal(await Customer.findProfile("000-000-0000"), null);
    pass("Customer.findProfile(phoneNumber) finds CUST-001, returns null for an unknown number (2a)");

    assert.equal((await Supplier.findProfile("Sample Supplier")).supplierId, "SUP-001");
    assert.equal(await Supplier.findProfile("No Such Supplier"), null);
    pass("Supplier.findProfile(partnerName) finds SUP-001, returns null for an unknown name");

    // ----- 6c. validateProfile() (3a, 2S.3, 5a) -----
    console.log("\n6c. validateProfile()");

    const bp1 = await BusinessPartner.findByPk("BP-001");
    const bp2 = await BusinessPartner.findByPk("BP-002");
    const newSupplier = BusinessPartner.build({ partnerType: "Supplier" });
    const newCustomer = BusinessPartner.build({ partnerType: "Customer" });

    const cases = [
      [newSupplier, { partnerName: "Nile Foods", leadTimeDays: 14 }, true, "new supplier with valid details"],
      [newSupplier, { partnerName: "Sample Supplier" }, false, "new supplier duplicating an existing name (5a)"],
      [newSupplier, { partnerName: "  " }, false, "blank name"],
      [newSupplier, { partnerName: "Nile Foods", leadTimeDays: -3 }, false, "negative lead time"],
      [newSupplier, { partnerName: "Nile Foods", leadTimeDays: 2.5 }, false, "lead time that is not a whole number"],
      [newCustomer, { partnerName: "Mona", phoneNumber: "514-555-0300", email: "mona@example.com" }, true, "new customer with valid details"],
      [newCustomer, { partnerName: "Mona", phoneNumber: "514-555-0200" }, false, "new customer duplicating a phone number (5a)"],
      [newCustomer, { partnerName: "Mona", email: "not-an-email" }, false, "invalid email"],
      [newCustomer, { partnerName: "Mona", phoneNumber: "" }, false, "blank phone number"],
      [bp1, { partnerName: "Sample Supplier" }, true, "existing supplier keeping its own name"],
      [bp2, { phoneNumber: "514-555-0200" }, true, "existing customer keeping its own phone number"],
      [bp1, { partnerType: "Customer" }, false, "changing partnerType"],
      [bp1, { partnerStatus: "Deleted" }, false, "unknown status"],
      [bp1, {}, false, "no changes submitted"],
    ];
    for (const [partner, changes, expected, label] of cases) {
      assert.equal(await partner.validateProfile(changes), expected, `validateProfile: ${label}`);
    }
    pass(`validateProfile() gives the expected result in all ${cases.length} cases`);

    await bp1.reload();
    assert.equal(bp1.partnerName, "Sample Supplier");
    pass("validateProfile() saved nothing: the stored profile is unchanged");

    // ----- 7. updateProfile() and changeStatus() -----
    console.log("\n7. Profile updates");

    customerPartner = await customer.getPartner();
    originalCustomerName = customerPartner.partnerName;

    await customerPartner.updateProfile({ partnerName: "Sample Customer (updated)", partnerId: "IGNORED" });
    await customerPartner.changeStatus("Inactive");
    await customerPartner.reload();
    assert.equal(customerPartner.partnerId, "BP-002");
    assert.equal(customerPartner.partnerName, "Sample Customer (updated)");
    assert.equal(customerPartner.partnerStatus, "Inactive");
    pass("updateProfile() changed the name, ignored partnerId; changeStatus() set Inactive");

    await expectRejected(
      () => customerPartner.changeStatus("Deleted"),
      'changeStatus("Deleted")'
    );

    console.log(`\nProfile verification successful (${passed} checks passed).`);
  } catch (error) {
    console.error("\nProfile verification FAILED:");
    console.error(`  ${error.message}`);
    process.exitCode = 1;
  } finally {
    // Put the sample data back so the script can be run again.
    try {
      if (supplierPartner && originalSupplierName) {
        await supplierPartner.reload();
        await supplierPartner.updateProfile({ partnerName: originalSupplierName });
      }
      if (customerPartner && originalCustomerName) {
        await customerPartner.reload();
        await customerPartner.updateProfile({ partnerName: originalCustomerName });
        await customerPartner.changeStatus("Active");
      }
    } catch (restoreError) {
      console.error(`Could not restore sample data: ${restoreError.message}`);
      process.exitCode = 1;
    }
    await sequelize.close();
  }
}

verifyProfiles();
