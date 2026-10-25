const sequelize = require("../src/database");
const { today } = require("../src/utils/dates");

const {
  BusinessPartner,
  Customer,
  StoreOwner,
  Employee,
  Sale,
  SaleItem,
  ComplaintCase,
  SupportRequest,
  ReturnRequest,
} = require("../src/models");

// Feature 6 verification. Needs the sample data from `npm run db:seed`, including the
// Feature 3 sample customer CUST-001. Everything this script creates is deleted again,
// and the sample records it changes are put back, so it can be run repeatedly.

const CUSTOMER_ID = "CUST-001";
const OTHER_CUSTOMER_ID = "CUST-VERIFY-2";

// Everything this script creates (ids are prefixed VERIFY so they are easy to spot).
const CASE_IDS = ["CASE-VERIFY-1", "CASE-VERIFY-2"];
const RETURN_IDS = [
  "RET-VERIFY-1", "RET-VERIFY-2", "RET-VERIFY-3", "RET-VERIFY-4",
  "RET-VERIFY-5", "RET-VERIFY-6", "RET-VERIFY-7", "RET-VERIFY-8", "RET-VERIFY-9",
];
const REQUEST_IDS = ["REQ-VERIFY-1"];
const SALE_IDS = ["SALE-VERIFY-OLD", "SALE-VERIFY-FUTURE", "SALE-VERIFY-CONC", "SALE-VERIFY-WALKIN"];

let failures = 0;

// Record a pass or fail. A failure is printed and counted; the run exits with code 1.
function check(condition, message) {
  if (condition) {
    console.log(`  ok - ${message}`);
  } else {
    failures += 1;
    console.log(`  FAILED - ${message}`);
  }
}

// Check that `action` throws an error whose message contains `text`.
async function checkThrows(action, text, message) {
  try {
    await action();
    check(false, `${message} (nothing was thrown)`);
  } catch (err) {
    check(err.message.includes(text), `${message}${err.message.includes(text) ? "" : ` (got: ${err.message})`}`);
  }
}

// Delete everything this script creates. Children are deleted before parents.
async function removeVerifyData() {
  await ReturnRequest.destroy({ where: { returnId: RETURN_IDS } });
  await ComplaintCase.destroy({ where: { caseId: CASE_IDS } });
  await SupportRequest.destroy({ where: { requestId: REQUEST_IDS } });
  await SaleItem.destroy({ where: { saleId: SALE_IDS } });
  await Sale.destroy({ where: { saleId: SALE_IDS } });
  await Customer.destroy({ where: { customerId: OTHER_CUSTOMER_ID } });
  await BusinessPartner.destroy({ where: { partnerId: "BP-VERIFY-2" } });
}

async function verifyCustomerSupport() {
  let sampleSale = null;
  let sampleItemIds = [];
  let originalTotal = null;

  try {
    await sequelize.authenticate();

    const employee = await Employee.findByPk("EMP-001");
    const owner = await StoreOwner.findByPk("OWN-001");
    const customer = await Customer.findByPk(CUSTOMER_ID);
    sampleSale = await Sale.findByPk("SALE-001");

    if (!employee || !owner || !sampleSale || !customer) {
      console.log("Sample data was not found. Run npm run db:setup and npm run db:seed first.");
      process.exitCode = 1;
      return;
    }

    // Remember the sample records so they can be restored afterwards.
    originalTotal = sampleSale.totalAmount;
    sampleItemIds = (await SaleItem.findAll({ where: { saleId: "SALE-001" } })).map((i) => i.saleItemId);
    await removeVerifyData(); // leftovers from an interrupted earlier run
    await ReturnRequest.update({ status: "Pending" }, { where: { returnId: "RET-001" } });

    // ---- Feature 3 integration: a real Customer record ----
    console.log("\nIntegration with Feature 3 (Customer)");
    check(customer instanceof Customer, `real Customer record ${CUSTOMER_ID} exists`);
    check((await employee.searchAccount(CUSTOMER_ID))?.customerId === CUSTOMER_ID, "searchAccount() finds the Customer");
    check((await employee.searchAccount("CUST-NOPE")) === null, "searchAccount() returns null for an unknown id");
    const history = await customer.listPurchaseHistory();
    check(history.length >= 1 && history[0].saleId === "SALE-001", "Customer.listPurchaseHistory() returns the customer's Sales");
    check(history.every((sale) => sale.customerId === CUSTOMER_ID), "purchase history holds only this customer's sales");

    // ---- Steps 2-4: look up the account and review the records ----
    console.log("\nSteps 2-4: Employee.assistCustomer()");
    const help = await employee.assistCustomer(CUSTOMER_ID);
    check(help.missingRecord === false && help.customer?.customerId === CUSTOMER_ID, "customer record is found");
    check(help.purchaseHistory.length >= 1 && help.purchaseHistory[0].items.length >= 1, "purchases and their items are retrieved");
    check(help.supportRequests.length >= 1, "support requests are retrieved");

    console.log("\nAlternate flow 3a: missing customer record");
    const missing = await employee.assistCustomer("CUST-DOES-NOT-EXIST");
    check(missing.missingRecord === true, "missing record is flagged");
    check(missing.purchaseHistory.length === 0 && missing.returnRequests.length === 0, "no records are returned for it");

    // ---- Step 5 and alternate flow 5a: complaint case ----
    console.log("\nStep 5: Employee.createComplaintCase()");
    const complaint = await employee.createComplaintCase(CUSTOMER_ID, {
      caseId: "CASE-VERIFY-1",
      category: "Billing",
      description: "Customer says the total on the receipt looks wrong.",
    });
    check(complaint.status === "Open", "new case starts as Open");
    await checkThrows(
      () => employee.createComplaintCase("CUST-DOES-NOT-EXIST", { caseId: "CASE-VERIFY-2", category: "x", description: "y" }),
      "was not found",
      "a case for a customer that does not exist is refused"
    );

    console.log("\nAlternate flow 5a: ComplaintCase.escalateToOwner()");
    await complaint.escalateToOwner();
    const escalated = await ComplaintCase.findByPk("CASE-VERIFY-1");
    check(escalated.status === "Pending Owner Review", "case is saved as Pending Owner Review");
    check(escalated.ownerId === "OWN-001", "case is assigned to the store owner");
    owner.reviewComplaint(escalated);
    owner.resolveCase(escalated);
    await escalated.save();
    check((await ComplaintCase.findByPk("CASE-VERIFY-1")).status === "Resolved", "owner resolves the case and it is saved as Resolved");
    await checkThrows(() => escalated.escalateToOwner(), "already Resolved", "a resolved case cannot be escalated again");
    await checkThrows(() => complaint.setStatus("Banana"), "status must be one of", "setStatus() rejects an invalid status");

    // ---- Step 6: return and refund ----
    console.log("\nStep 6: ReturnRequest.checkEligibility() and processRefund()");
    const goodReturn = await ReturnRequest.findByPk("RET-001");
    check((await goodReturn.checkEligibility()) === true, "RET-001 (2.50 of a 7.50 sale) is eligible");
    check((await goodReturn.processRefund()) === true, "refund is processed");
    check((await ReturnRequest.findByPk("RET-001")).status === "Refunded", "RET-001 is saved as Refunded");

    console.log("\nRefund rules");
    const makeReturn = (returnId, saleId, amount, customerId = CUSTOMER_ID) =>
      ReturnRequest.create({ returnId, reason: "Verification", amount, customerId, saleId, employeeId: employee.employeeId });

    // Amount above the sale total.
    const tooMuch = await makeReturn("RET-VERIFY-1", "SALE-001", 50);
    check((await tooMuch.checkEligibility()) === false, "an amount above the sale total is not eligible");
    check((await tooMuch.processRefund()) === false && tooMuch.status === "Rejected", "the refund is refused and the return is Rejected");

    // Earlier refunds reduce what is left (7.50 - 2.50 already refunded = 5.00).
    const remaining = await makeReturn("RET-VERIFY-2", "SALE-001", 5);
    check((await remaining.checkEligibility()) === true, "5.00 is still refundable (7.50 - 2.50 already refunded)");
    const overRemaining = await makeReturn("RET-VERIFY-3", "SALE-001", 5.01);
    check((await overRemaining.checkEligibility()) === false, "5.01 is more than what is left");

    // Customer must own the sale.
    await BusinessPartner.create({ partnerId: "BP-VERIFY-2", partnerName: "Other Customer", partnerType: "Customer" });
    await Customer.create({ customerId: OTHER_CUSTOMER_ID, partnerId: "BP-VERIFY-2" });
    const wrongOwner = await makeReturn("RET-VERIFY-4", "SALE-001", 1, OTHER_CUSTOMER_ID);
    check((await wrongOwner.checkEligibility()) === false, "a return by a customer who does not own the sale is not eligible");
    check((await wrongOwner.processRefund()) === false && wrongOwner.status === "Rejected", "the other customer's refund is refused");

    // Walk-in sale (no customer) cannot be refunded to an account.
    await Sale.create({ saleId: "SALE-VERIFY-WALKIN", saleDate: today(), totalAmount: 10, employeeId: employee.employeeId });
    const walkIn = await makeReturn("RET-VERIFY-5", "SALE-VERIFY-WALKIN", 5);
    check((await walkIn.checkEligibility()) === false, "a walk-in sale with no customer is not eligible");

    // Return window.
    await Sale.create({ saleId: "SALE-VERIFY-OLD", saleDate: "2020-01-01", totalAmount: 10, customerId: CUSTOMER_ID, employeeId: employee.employeeId });
    const oldReturn = await makeReturn("RET-VERIFY-6", "SALE-VERIFY-OLD", 5);
    check((await oldReturn.checkEligibility()) === false, "a sale older than the return window is not eligible");

    // Future-dated sales.
    await checkThrows(
      () => Sale.create({ saleId: "SALE-VERIFY-FUTURE", saleDate: "2099-01-01", totalAmount: 10, customerId: CUSTOMER_ID }),
      "cannot be in the future",
      "a future-dated sale is rejected when it is created"
    );
    // Even if one got into the database some other way, it must not be refundable.
    await Sale.create(
      { saleId: "SALE-VERIFY-FUTURE", saleDate: "2099-01-01", totalAmount: 10, customerId: CUSTOMER_ID, employeeId: employee.employeeId },
      { validate: false }
    );
    const futureReturn = await makeReturn("RET-VERIFY-7", "SALE-VERIFY-FUTURE", 5);
    check((await futureReturn.checkEligibility()) === false, "a future-dated sale is not eligible for a refund");

    // Status changes: Refunded and Rejected are final.
    console.log("\nReturn status is final once decided");
    await checkThrows(() => goodReturn.processRefund(), "already Refunded", "a Refunded return cannot be processed again");
    await checkThrows(() => tooMuch.processRefund(), "already Rejected", "a Rejected return cannot be processed again");
    const rejected = await ReturnRequest.findByPk("RET-VERIFY-1");
    rejected.status = "Pending";
    await checkThrows(() => rejected.save(), "cannot be changed", "a Rejected return cannot be set back to Pending");
    check((await ReturnRequest.findByPk("RET-VERIFY-1")).status === "Rejected", "the Rejected status is still stored");

    // Two refunds on the same sale at the same moment (6.00 + 6.00 on a 10.00 sale).
    console.log("\nSimultaneous refunds");
    await Sale.create({ saleId: "SALE-VERIFY-CONC", saleDate: today(), totalAmount: 10, customerId: CUSTOMER_ID, employeeId: employee.employeeId });
    const raceA = await makeReturn("RET-VERIFY-8", "SALE-VERIFY-CONC", 6);
    const raceB = await ReturnRequest.create({
      returnId: "RET-VERIFY-9", reason: "Verification", amount: 6, customerId: CUSTOMER_ID,
      saleId: "SALE-VERIFY-CONC", employeeId: employee.employeeId,
    });
    await Promise.allSettled([raceA.processRefund(), raceB.processRefund()]);
    const refundedTotal =
      (await ReturnRequest.sum("amount", { where: { saleId: "SALE-VERIFY-CONC", status: "Refunded" } })) || 0;
    check(refundedTotal <= 10, `total refunded on the sale (${refundedTotal.toFixed(2)}) does not exceed its total (10.00)`);
    check(refundedTotal === 6, "exactly one of the two refunds was paid");

    // ---- Shared sale methods ----
    console.log("\nSale.addItem(), removeItem(), recalculateTotal()");
    const before = (await Sale.findByPk("SALE-001")).totalAmount;
    const newItem = await employee.addSoldProduct({ saleId: "SALE-001", productId: "PROD-001", quantity: 2, unitPrice: 4 });
    check((await Sale.findByPk("SALE-001")).totalAmount === before + 8, "addSoldProduct() adds 8.00 to the total");
    await employee.removeSoldProduct({ saleId: "SALE-001", saleItemId: newItem.saleItemId });
    check((await Sale.findByPk("SALE-001")).totalAmount === before, "removeSoldProduct() restores the total");

    // ---- Steps 8-9: notes and logging ----
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
    await checkThrows(() => request.addNotes("   "), "cannot be empty", "an empty note is refused");
    await request.logInteraction();
    check((await SupportRequest.findByPk("REQ-VERIFY-1")).requestStatus === "Logged", "interaction is logged");
  } catch (error) {
    failures += 1;
    console.error("\nUnexpected error during verification:");
    console.error(error);
  } finally {
    // Always leave the sample data as it was found.
    try {
      await removeVerifyData();
      if (sampleSale) {
        await SaleItem.destroy({ where: { saleId: "SALE-001", saleItemId: { [require("sequelize").Op.notIn]: sampleItemIds } } });
        await Sale.update({ totalAmount: originalTotal }, { where: { saleId: "SALE-001" } });
        // Bulk update on purpose: it puts RET-001 back to Pending, which the model forbids.
        await ReturnRequest.update({ status: "Pending" }, { where: { returnId: "RET-001" } });
      }
      console.log("\nVerification data removed and sample records restored.");
    } catch (cleanupError) {
      failures += 1;
      console.error("Cleanup failed:");
      console.error(cleanupError);
    }

    await sequelize.close();

    if (failures > 0) {
      console.log(`\nCustomer support verification FAILED (${failures} problem${failures === 1 ? "" : "s"}).`);
      process.exitCode = 1;
    } else if (sampleSale) {
      console.log("\nCustomer support verification successful.");
    }
  }
}

verifyCustomerSupport();
