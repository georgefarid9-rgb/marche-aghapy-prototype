const sequelize = require("../src/database");

const {
  StoreOwner,
  Employee,
  Sale,
  ComplaintCase,
  SupportRequest,
  ReturnRequest,
} = require("../src/models");

const CUSTOMER_ID = "CUST-001";

// Simple check helper: stops the script with a clear message if something is wrong.
function check(condition, message) {
  if (!condition) {
    throw new Error(`CHECK FAILED: ${message}`);
  }
  console.log(`  ok - ${message}`);
}

async function verifyCustomerSupport() {
  try {
    await sequelize.authenticate();

    const employee = await Employee.findByPk("EMP-001");
    const owner = await StoreOwner.findByPk("OWN-001");
    const sale = await Sale.findByPk("SALE-001");

    if (!employee || !owner || !sale) {
      console.log("Sample data was not found. Run npm run db:setup and npm run db:seed first.");
      return;
    }

    // Remove anything this script created on an earlier run, so it can be repeated.
    await ComplaintCase.destroy({ where: { caseId: ["CASE-VERIFY-1", "CASE-VERIFY-2"] } });
    await ReturnRequest.destroy({ where: { returnId: ["RET-VERIFY-1", "RET-VERIFY-2", "RET-VERIFY-3"] } });
    await SupportRequest.destroy({ where: { requestId: "REQ-VERIFY-1" } });
    await Sale.destroy({ where: { saleId: "SALE-VERIFY-OLD" } });
    await ReturnRequest.update({ status: "Pending" }, { where: { returnId: "RET-001" } });

    // Steps 2-4: the employee finds the account and reviews the customer's records.
    console.log("\nSteps 2-4: searchAccount() and assistCustomer()");
    const help = await employee.assistCustomer(CUSTOMER_ID);
    check(help.purchaseHistory.length >= 1, "purchase history is retrieved");
    check(help.purchaseHistory[0].items.length >= 1, "purchase history includes sale items");
    check(help.supportRequests.length >= 1, "support requests are retrieved");
    console.log(`  customer record found: ${!help.missingRecord} (needs Feature 3 Customer model)`);

    // Alternate flow 3a: a customer record that does not exist is flagged as missing.
    console.log("\nAlternate flow 3a: missing customer record");
    const missing = await employee.assistCustomer("CUST-DOES-NOT-EXIST");
    check(missing.missingRecord === true, "missing record is flagged");
    check(missing.purchaseHistory.length === 0, "no records are returned for it");

    // Step 5: the employee creates a complaint case.
    console.log("\nStep 5: Employee.createComplaintCase()");
    const complaint = await employee.createComplaintCase(CUSTOMER_ID, {
      caseId: "CASE-VERIFY-1",
      category: "Billing",
      description: "Customer says the total on the receipt looks wrong.",
    });
    check(complaint.status === "Open", "new case starts as Open");

    // Alternate flow 5a: cannot be resolved, so it goes to the owner.
    console.log("\nAlternate flow 5a: ComplaintCase.escalateToOwner()");
    await complaint.escalateToOwner();
    check(complaint.status === "Pending Owner Review", "case is Pending Owner Review");
    check(complaint.ownerId === "OWN-001", "case is assigned to the store owner");

    owner.reviewComplaint(complaint);
    await owner.resolveCase(complaint);
    await complaint.save();
    check(
      (await ComplaintCase.findByPk("CASE-VERIFY-1")).status === "Resolved",
      "owner resolves the case and it is saved as Resolved"
    );

    try {
      await complaint.setStatus("Banana");
      check(false, "invalid status should be rejected");
    } catch (err) {
      check(err.message.includes("status must be one of"), "setStatus() rejects an invalid status");
    }

    // Step 6: the system checks the return and processes the refund.
    console.log("\nStep 6: ReturnRequest.checkEligibility() and processRefund()");
    const goodReturn = await ReturnRequest.findByPk("RET-001");
    check((await goodReturn.checkEligibility()) === true, "RET-001 (2.50 of a 7.50 sale) is eligible");
    check((await goodReturn.processRefund()) === true, "refund is processed");
    check(goodReturn.status === "Refunded", "return status is Refunded");

    const tooMuch = await ReturnRequest.create({
      returnId: "RET-VERIFY-1",
      reason: "Refund more than was paid",
      amount: 50,
      customerId: CUSTOMER_ID,
      saleId: sale.saleId,
      employeeId: employee.employeeId,
    });
    check((await tooMuch.checkEligibility()) === false, "an amount above the sale total is not eligible");
    check((await tooMuch.processRefund()) === false, "refund is refused");
    check(tooMuch.status === "Rejected", "return status is Rejected");

    const remaining = await ReturnRequest.create({
      returnId: "RET-VERIFY-2",
      reason: "Second damaged can",
      amount: 5,
      customerId: CUSTOMER_ID,
      saleId: sale.saleId,
      employeeId: employee.employeeId,
    });
    check((await remaining.checkEligibility()) === true, "5.00 is still refundable (7.50 - 2.50 already refunded)");

    const tooOld = await Sale.create({
      saleId: "SALE-VERIFY-OLD",
      saleDate: "2020-01-01",
      totalAmount: 10,
      customerId: CUSTOMER_ID,
      employeeId: employee.employeeId,
    });
    const oldReturn = await ReturnRequest.create({
      returnId: "RET-VERIFY-3",
      reason: "Outside the return window",
      amount: 5,
      customerId: CUSTOMER_ID,
      saleId: tooOld.saleId,
      employeeId: employee.employeeId,
    });
    check((await oldReturn.checkEligibility()) === false, "a sale older than the return window is not eligible");

    // Alternate flow 6a: no return needed, so nothing is processed. Nothing to run here;
    // the employee simply does not create a ReturnRequest.

    // Sale methods used by the shared sales classes.
    console.log("\nSale.addItem(), removeItem(), recalculateTotal()");
    const before = (await Sale.findByPk("SALE-001")).totalAmount;
    const newItem = await employee.addSoldProduct({
      saleId: "SALE-001",
      productId: "PROD-001",
      quantity: 2,
      unitPrice: 4,
    });
    check((await Sale.findByPk("SALE-001")).totalAmount === before + 8, "addSoldProduct() adds 8.00 to the total");
    await employee.removeSoldProduct({ saleId: "SALE-001", saleItemId: newItem.saleItemId });
    check((await Sale.findByPk("SALE-001")).totalAmount === before, "removeSoldProduct() restores the total");

    // Steps 8-9: the support interaction is noted and logged.
    console.log("\nSteps 8-9: SupportRequest.addNotes() and logInteraction()");
    const request = await SupportRequest.create({
      requestId: "REQ-VERIFY-1",
      subject: "Refund follow-up",
      description: "Customer asked about the refund on SALE-001.",
      customerId: CUSTOMER_ID,
      employeeId: employee.employeeId,
    });
    await request.addNotes("Refund of 2.50 approved and processed.");
    check(request.description.includes("Refund of 2.50"), "note is added to the request");
    await request.logInteraction();
    check(
      (await SupportRequest.findByPk("REQ-VERIFY-1")).requestStatus === "Logged",
      "interaction is logged"
    );

    console.log("\nCustomer support verification successful.");
  } catch (error) {
    console.error("Customer support verification failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

verifyCustomerSupport();
