const assert = require("node:assert/strict");
const sequelize = require("../src/database");

const {
  BusinessPartner,
  Supplier,
  Customer,
  PerformanceRecord,
  Employee,
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
    assert.equal(records.length, 2, "Expected 2 seeded performance records.");
    const [perf1, perf2] = records;

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
    pass("evaluatePerformance() returns 95 (average of 100 and 90)");

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

    // ----- 6. Customer profile -----
    console.log("\n6. Customer profile");

    const customer = await Customer.findByPk("CUST-001");
    assert.ok(customer, "CUST-001 not found.");
    const info = await customer.retrieveInfo();
    assert.deepEqual(
      {
        customerId: info.customerId,
        partnerId: info.partnerId,
        name: info.name,
        status: info.status,
        email: info.email,
      },
      {
        customerId: "CUST-001",
        partnerId: "BP-002",
        name: "Sample Customer",
        status: "Active",
        email: "customer1@example.com",
      }
    );
    pass("retrieveInfo() returns the shared profile and the customer fields");

    const history = await customer.listPurchaseHistory();
    assert.ok(Array.isArray(history), "listPurchaseHistory() should return a list");
    if (typeof customer.getSales === "function") {
      pass(`listPurchaseHistory() reads the Sale model: ${history.length} sale(s) for CUST-001`);
    } else {
      assert.equal(history.length, 0);
      pass("listPurchaseHistory() returns [] (Sale model not in the prototype yet)");
    }

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
