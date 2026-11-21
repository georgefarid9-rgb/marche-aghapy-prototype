const sequelize = require("../src/database");
const installGracefulShutdown = require("../src/utils/gracefulShutdown");
const { SupportError } = require("../src/utils/supportGuard");
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
  Ledger,
  Transaction,
  InventoryRecord,
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
  "RET-VERIFY-5", "RET-VERIFY-6", "RET-VERIFY-7", "RET-VERIFY-8", "RET-VERIFY-9", "RET-VERIFY-RB", "RET-VERIFY-AMT1", "RET-VERIFY-AMT2", "RET-VERIFY-AMT3", "RET-VERIFY-AMT4",
];
const REQUEST_IDS = ["REQ-VERIFY-1"];
const SALE_IDS = ["SALE-VERIFY-OLD", "SALE-VERIFY-FUTURE", "SALE-VERIFY-CONC", "SALE-VERIFY-WALKIN", "SALE-VERIFY-LINE", "SALE-VERIFY-RB", "SALE-VERIFY-AMT"];
const createdRequestIds = [];
let tempLedgerId = null;
let linkToRemove = null; // Employee-Customer link created by this script (removed again at the end)

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
  // Refund entries posted to the ledger, then the returns that caused them.
  const { Op } = require("sequelize");
  const returns = await ReturnRequest.findAll({
    where: { [Op.or]: [{ returnId: [...RETURN_IDS, "RET-001"] }, { saleId: SALE_IDS }] },
    attributes: ["returnId"],
  });
  await Transaction.destroy({ where: { transactionId: returns.map((r) => `REF-${r.returnId}`) } });
  await ReturnRequest.destroy({ where: { returnId: returns.map((r) => r.returnId).filter((id) => id !== "RET-001") } });
  if (linkToRemove) {
    await sequelize.models.EmployeeCustomer.destroy({ where: linkToRemove });
  }
  await Employee.destroy({ where: { employeeId: "EMP-VERIFY-NL" } });
  await SupportRequest.destroy({ where: { requestId: createdRequestIds } });
  await ComplaintCase.destroy({ where: { caseId: CASE_IDS } });
  await SupportRequest.destroy({ where: { requestId: REQUEST_IDS } });
  await SaleItem.destroy({ where: { saleId: SALE_IDS } });
  await Sale.destroy({ where: { saleId: SALE_IDS } });
  await Customer.destroy({ where: { customerId: OTHER_CUSTOMER_ID } });
  await BusinessPartner.destroy({ where: { partnerId: "BP-VERIFY-2" } });
}

installGracefulShutdown(sequelize);

async function verifyCustomerSupport() {
  let sampleSale = null;
  let sampleItemIds = [];
  let originalTotal = null;
  let ledger = null;

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

    // Refunds are posted to the store's ledger (Feature 4). Use the store's ledger, or make
    // a temporary one that is deleted at the end.
    ledger = await Ledger.findOne({ where: { storeId: "STORE-001" } });
    if (!ledger) {
      tempLedgerId = "LEDGER-VERIFY-F6";
      await Ledger.destroy({ where: { ledgerId: tempLedgerId } });
      ledger = await Ledger.create({ ledgerId: tempLedgerId, periodStartDate: today(), storeId: "STORE-001" });
    }
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
    const EmployeeCustomer = sequelize.models.EmployeeCustomer;
    const linkWhere = { employeeId: employee.employeeId, customerId: CUSTOMER_ID };
    if ((await EmployeeCustomer.count({ where: linkWhere })) === 0) {
      linkToRemove = linkWhere; // only remove the link if this script created it
    }
    const help = await employee.assistCustomer(CUSTOMER_ID);
    check(help.missingRecord === false && help.customer?.customerId === CUSTOMER_ID, "customer record is found");
    check(help.purchaseHistory.length >= 1 && help.purchaseHistory[0].items.length >= 1, "purchases and their items are retrieved");
    check(help.supportRequests.length >= 1, "support requests are retrieved");
    check((await employee.countCustomers({ where: { customerId: CUSTOMER_ID } })) === 1, "Employee.customers: the assisted customer is linked to the employee");
    await employee.assistCustomer(CUSTOMER_ID);
    check((await EmployeeCustomer.count({ where: linkWhere })) === 1, "assisting the same customer again does not add a second link");
    check((await (await Customer.findByPk(CUSTOMER_ID)).getEmployees()).some((e) => e.employeeId === employee.employeeId), "Customer.employees shows the same link from the other side");

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
    await owner.resolveCase(escalated);
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

    // ---- New Feature 6 methods ----
    console.log("\nEmployee.reviewIssue() / escalateComplaint()");
    check((await employee.reviewIssue("CASE-001")).caseId === "CASE-001", "reviewIssue() returns the case");
    await checkThrows(() => employee.reviewIssue("CASE-NOPE"), "was not found", "reviewIssue() refuses an unknown case");
    const toEscalate = await employee.createComplaintCase(CUSTOMER_ID, { caseId: "CASE-VERIFY-2", category: "Service", description: "Long wait at the till." });
    const escalatedCase = await employee.escalateComplaint("CASE-VERIFY-2");
    check(escalatedCase.status === "Pending Owner Review" && escalatedCase.ownerId === "OWN-001", "escalateComplaint() sends the case to the owner");

    console.log("\nStoreOwner.listPendingCases() / resolveCase()");
    const pending = await owner.listPendingCases();
    check(pending.some((c) => c.caseId === "CASE-VERIFY-2"), "listPendingCases() includes the escalated case");
    check(pending.every((c) => c.status === "Pending Owner Review" && c.ownerId === "OWN-001"), "listPendingCases() holds only this owner's pending cases");
    await owner.resolveCase(toEscalate);
    check((await ComplaintCase.findByPk("CASE-VERIFY-2")).status === "Resolved", "resolveCase() saves Resolved");
    check(!(await owner.listPendingCases()).some((c) => c.caseId === "CASE-VERIFY-2"), "a resolved case leaves the pending list");

    console.log("\nEmployee.openSupportRequest() / flagMissingRecord() / addNotes()");
    const opened = await employee.openSupportRequest(CUSTOMER_ID, "Opening hours", "Customer asked about holiday hours.");
    createdRequestIds.push(opened.requestId);
    check(opened.requestStatus === "Open" && opened.customerId === CUSTOMER_ID, "openSupportRequest() saves an Open request");
    await checkThrows(() => employee.openSupportRequest("CUST-NOPE", "x", "y"), "was not found", "openSupportRequest() refuses an unknown customer");
    const flag = await employee.flagMissingRecord("CUST-NOPE", "Customer says they have an account.");
    createdRequestIds.push(flag.requestId);
    check(flag.subject === "Missing record" && flag.customerId === null && flag.description.includes("CUST-NOPE"), "flagMissingRecord() saves a flag with no customer");
    const flagKnown = await employee.flagMissingRecord(CUSTOMER_ID, "Purchase not in history.");
    createdRequestIds.push(flagKnown.requestId);
    check(flagKnown.customerId === CUSTOMER_ID, "flagMissingRecord() keeps the customer when it exists");
    await checkThrows(() => employee.flagMissingRecord(CUSTOMER_ID, "  "), "note is required", "flagMissingRecord() needs a note");
    check((await owner.listMissingRecordFlags()).some((r) => r.requestId === flag.requestId), "listMissingRecordFlags() lists the open flag");
    const noted = await employee.addNotes(opened.requestId, "Told the customer 9am to 9pm.");
    check(noted.description.includes("Note: Told the customer") && noted.requestStatus === "Logged", "Employee.addNotes() adds the note and logs the request");
    await checkThrows(() => employee.addNotes("REQ-NOPE", "x"), "was not found", "Employee.addNotes() refuses an unknown request");

    // ---- Return of part of a sale line: quantity, stock and ledger ----
    console.log("\nEmployee.requestReturn(): partial return, items sold and ledger");
    const lineSale = await Sale.create({ saleId: "SALE-VERIFY-LINE", saleDate: today(), totalAmount: 0, customerId: CUSTOMER_ID, employeeId: employee.employeeId });
    const line = await lineSale.addItem({ productId: "PROD-001", quantity: 4, unitPrice: 3 });
    const stockBefore = (await InventoryRecord.findOne({ where: { productId: "PROD-001" } })).quantityOnHand;
    const balanceBefore = (await ledger.reload()).currentBalance;

    const firstReturn = await employee.requestReturn(CUSTOMER_ID, "SALE-VERIFY-LINE", line.saleItemId, 1);
    check(firstReturn.refunded === true && firstReturn.status === "Refunded" && firstReturn.reason === null, "returning 1 of 4 units is refunded");
    check(firstReturn.amount === 3 && firstReturn.balanceUpdated === true && firstReturn.returnId.startsWith("RET-"), "the result gives the amount, the return id and that the balance was updated");
    const afterOne = await SaleItem.findByPk(line.saleItemId);
    check(afterOne.returnedQuantity === 1 && afterOne.returnableQuantity === 3, "returnedQuantity is 1, returnable is 3");
    check((await InventoryRecord.findOne({ where: { productId: "PROD-001" } })).quantityOnHand === stockBefore, "stock is NOT put back");
    check((await ledger.reload()).currentBalance === balanceBefore - 3, "ledger balance fell by the refund (3.00)");
    const refundTx = await Transaction.findAll({ where: { transactionId: `REF-${firstReturn.returnId}` } });
    check(
      refundTx.length === 1 && refundTx[0].amount === 3 && refundTx[0].category === "Refund" && refundTx[0].ledgerId === ledger.ledgerId,
      "exactly one Refund entry of 3.00 was added to the ledger for this return"
    );

    // ReturnRequest.ledger and Ledger.returnRequests
    const refundedReturn = await ReturnRequest.findByPk(firstReturn.returnId);
    check(refundedReturn.ledgerId === ledger.ledgerId, "ReturnRequest.ledger: the refunded return points to the ledger it was posted to");
    check((await refundedReturn.getLedger()).ledgerId === ledger.ledgerId, "return.getLedger() returns that ledger");
    check((await ledger.getReturnRequests()).some((r) => r.returnId === firstReturn.returnId), "Ledger.returnRequests lists the refunded return");

    // Sale.getSale()
    const loadedSale = await (await Sale.findByPk("SALE-VERIFY-LINE")).getSale();
    check(loadedSale.saleId === "SALE-VERIFY-LINE" && loadedSale.items.length === 1 && loadedSale.items[0].returnedQuantity === 1, "Sale.getSale() reloads the sale with its lines and the current returnedQuantity");
    check(loadedSale.returnRequests.some((r) => r.returnId === firstReturn.returnId), "Sale.getSale() also loads the sale's return requests");
    await checkThrows(() => new Sale({ saleId: "SALE-DOES-NOT-EXIST" }).getSale(), "was not found", "Sale.getSale() reports a sale that does not exist");


    check((await employee.requestReturn(CUSTOMER_ID, "SALE-VERIFY-LINE", line.saleItemId, 3)).refunded === true, "returning the other 3 units is refunded");
    const fifth = await employee.requestReturn(CUSTOMER_ID, "SALE-VERIFY-LINE", line.saleItemId, 1);
    check(fifth.refunded === false && fifth.status === "Rejected", "a 5th unit is rejected (only 4 were sold)");
    check(typeof fifth.reason === "string" && fifth.reason.includes("only 0 unit(s)"), "the employee gets the reason for the rejection");
    check((await SaleItem.findByPk(line.saleItemId)).returnedQuantity === 4, "returnedQuantity stays 4");
    await checkThrows(() => employee.requestReturn(CUSTOMER_ID, "SALE-001", line.saleItemId, 1), "was not found on sale", "a line from another sale is refused");
    await checkThrows(() => line.recordReturn(0), "whole number", "recordReturn() refuses 0");

    console.log("\nRefund amount must match quantity x unit price");
    const amtSale = await Sale.create({ saleId: "SALE-VERIFY-AMT", saleDate: today(), totalAmount: 0, customerId: CUSTOMER_ID, employeeId: employee.employeeId });
    const amtLine = await amtSale.addItem({ productId: "PROD-001", quantity: 3, unitPrice: 3 });
    const amtTooMuch = await ReturnRequest.create({
      returnId: "RET-VERIFY-AMT1", reason: "Verification", amount: 9, quantity: 1, saleItemId: amtLine.saleItemId,
      customerId: CUSTOMER_ID, saleId: "SALE-VERIFY-AMT", employeeId: employee.employeeId,
    });
    check((await amtTooMuch.processRefund()) === false, "1 unit priced at 3.00 cannot be refunded as 9.00");
    check(amtTooMuch.status === "Rejected" && amtTooMuch.rejectionReason.includes("must be 3.00"), "the reason names the correct amount");
    check((await SaleItem.findByPk(amtLine.saleItemId)).returnedQuantity === 0, "nothing was recorded as returned");
    const amtTooLittle = await ReturnRequest.create({
      returnId: "RET-VERIFY-AMT2", reason: "Verification", amount: 2, quantity: 1, saleItemId: amtLine.saleItemId,
      customerId: CUSTOMER_ID, saleId: "SALE-VERIFY-AMT", employeeId: employee.employeeId,
    });
    check((await amtTooLittle.processRefund()) === false, "a refund below the item price is also rejected");
    const amtNoQuantity = await ReturnRequest.create({
      returnId: "RET-VERIFY-AMT3", reason: "Verification", amount: 3, saleItemId: amtLine.saleItemId,
      customerId: CUSTOMER_ID, saleId: "SALE-VERIFY-AMT", employeeId: employee.employeeId,
    });
    check((await amtNoQuantity.processRefund()) === false && amtNoQuantity.rejectionReason.includes("together"), "a sale item without a quantity is rejected");
    const amtExact = await ReturnRequest.create({
      returnId: "RET-VERIFY-AMT4", reason: "Verification", amount: 3, quantity: 1, saleItemId: amtLine.saleItemId,
      customerId: CUSTOMER_ID, saleId: "SALE-VERIFY-AMT", employeeId: employee.employeeId,
    });
    check((await amtExact.processRefund()) === true, "the exact amount (3.00) is refunded");

    console.log("\nRefund failure rolls everything back");
    const noLedgerEmp = await Employee.create({ employeeId: "EMP-VERIFY-NL", employeeName: "No Store", phoneNumber: "514-555-0100", role: "Cashier" });
    const rbReturn = await ReturnRequest.create({
      returnId: "RET-VERIFY-RB", reason: "Verification", amount: 3, quantity: 1, saleItemId: line.saleItemId,
      customerId: CUSTOMER_ID, saleId: "SALE-VERIFY-LINE", employeeId: noLedgerEmp.employeeId,
    });
    const sale2 = await Sale.create({ saleId: "SALE-VERIFY-RB", saleDate: today(), totalAmount: 0, customerId: CUSTOMER_ID, employeeId: employee.employeeId });
    const line2 = await sale2.addItem({ productId: "PROD-001", quantity: 2, unitPrice: 5 });
    await rbReturn.update({ saleId: "SALE-VERIFY-RB", saleItemId: line2.saleItemId, amount: 5 });
    await checkThrows(() => rbReturn.processRefund(), "No ledger", "a refund with no ledger raises an error");
    check((await ReturnRequest.findByPk("RET-VERIFY-RB")).status === "Pending", "the return stays Pending");
    check((await SaleItem.findByPk(line2.saleItemId)).returnedQuantity === 0, "returnedQuantity was not changed");

    // ---- Unexpected failures (power cut, lost connection, busy database) ----
    console.log("\nUnexpected failures are handled (an error line printed below is expected)");

    const realCreate = SupportRequest.create;
    SupportRequest.create = async () => {
      const failure = new Error("disk I/O error");
      failure.code = "SQLITE_IOERR";
      throw failure;
    };
    try {
      await employee.openSupportRequest(CUSTOMER_ID, "x", "y");
      check(false, "an unexpected failure is reported (nothing was thrown)");
    } catch (err) {
      check(
        err instanceof SupportError && err.message.startsWith("Something went wrong while opening the support request") && err.retryable === true,
        "an unexpected failure becomes a friendly 'something went wrong, try again' error"
      );
    } finally {
      SupportRequest.create = realCreate;
    }

    const realFindAll = ComplaintCase.findAll;
    let findAllCalls = 0;
    ComplaintCase.findAll = async function (...args) {
      findAllCalls += 1;
      if (findAllCalls === 1) {
        const busy = new Error("database is locked");
        busy.code = "SQLITE_BUSY";
        throw busy;
      }
      return realFindAll.apply(this, args);
    };
    try {
      const list = await owner.listPendingCases();
      check(Array.isArray(list) && findAllCalls === 2, "a busy database is retried automatically and the list loads");
    } finally {
      ComplaintCase.findAll = realFindAll;
    }

    const realProcess = ReturnRequest.prototype.processRefund;
    const countReturns = () => ReturnRequest.count({ where: { saleId: "SALE-VERIFY-RB" } });
    const returnsBefore = await countReturns();
    ReturnRequest.prototype.processRefund = async () => {
      throw new SupportError("processing the refund", new Error("connection lost"), true);
    };
    try {
      await checkThrows(
        () => employee.requestReturn(CUSTOMER_ID, "SALE-VERIFY-RB", line2.saleItemId, 1),
        "Something went wrong",
        "a failed refund reports 'something went wrong'"
      );
    } finally {
      ReturnRequest.prototype.processRefund = realProcess;
    }
    check((await countReturns()) === returnsBefore, "no half-made Pending return is left behind, so retrying does not duplicate");

    const realRecalc = Ledger.prototype.recalculateBalance;
    const balanceBeforeFailure = (await ledger.reload()).currentBalance;
    Ledger.prototype.recalculateBalance = async () => {
      throw new Error("connection lost");
    };
    let balanceFailureResult;
    try {
      balanceFailureResult = await employee.requestReturn(CUSTOMER_ID, "SALE-VERIFY-RB", line2.saleItemId, 1);
    } finally {
      Ledger.prototype.recalculateBalance = realRecalc;
    }
    check(
      balanceFailureResult.refunded === true && balanceFailureResult.balanceUpdated === false,
      "a saved refund is reported as done, with balanceUpdated false when only the balance update failed"
    );
    await ledger.recalculateBalance();
    check((await ledger.reload()).currentBalance === balanceBeforeFailure - 5, "the ledger balance is corrected by the next recalculation");

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
      if (ledger) {
        await ledger.reload();
        await ledger.recalculateBalance();
        if (tempLedgerId) {
          await Ledger.destroy({ where: { ledgerId: tempLedgerId } });
        }
      }
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
