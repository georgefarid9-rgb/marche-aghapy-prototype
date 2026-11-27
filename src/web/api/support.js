// Feature 6 — Customer Support (use case 6).
// The employee looks up the customer (Employee.assistCustomer), then opens a complaint
// case, a support request or a return; the owner reviews escalated cases.
// A customer can be looked up by customer ID (CUST-002) or by phone number written
// with digits only (5145550311).
//
// Who is acting: every request names the person chosen in the top bar ("Signed in as"),
// in the X-Signed-In-As header. The server checks that person's role:
//   - employee actions (look-up, complaints, requests, notes, returns, missing records)
//     answer 403 for the store owner,
//   - the owner's inbox and resolving an escalated case answer 403 for an employee.
// This is a demo role switch, not a login (see src/web/server.js).
//
// Every error message from these routes ends with where it happened, for example
// "(Error in src/models/Employee.js, line 112)" (see respond.js).

const express = require("express");
const { Op } = require("sequelize");
const {
  Employee, Customer, StoreOwner, ComplaintCase, SupportRequest, RestockAlert,
} = require("../../models");
const { route, fail, deny, toInteger } = require("./respond");
const { reconcileAlerts } = require("../../utils/alertReconciliation");

const router = express.Router();

const COMPLAINT_CATEGORIES = ["Product quality", "Service", "Pricing", "Other"];
const LIMITS = { description: 500, note: 500, text: 500, subject: 100, reason: 200 };

// ----- Who is signed in -----

async function signedIn(req) {
  const id = String(req.get("X-Signed-In-As") || "").trim();
  if (!id) deny("Choose who is signed in (top bar) first.");
  const owner = await StoreOwner.findByPk(id);
  if (owner) return { role: "owner", owner };
  const employee = await Employee.findByPk(id);
  if (employee) return { role: "employee", employee };
  deny(`${id} is not a store owner or an employee.`);
}

async function employeeOnly(req) {
  const user = await signedIn(req);
  if (user.role !== "employee") {
    deny("Customer support actions are done by an employee. Switch \"Signed in as\" to an employee.");
  }
  return user.employee;
}

async function ownerOnly(req) {
  const user = await signedIn(req);
  if (user.role !== "owner") {
    deny("Only the store owner can view the inbox and resolve escalated cases.");
  }
  return user.owner;
}

// ----- Input checks (a rejected value marks its own box: fieldErrors) -----

function text(body, name, label, { required = true } = {}) {
  const value = String(body?.[name] ?? "").trim();
  if (required && !value) fail(`Enter ${label}.`, { [name]: `Enter ${label}.` });
  if (LIMITS[name] && value.length > LIMITS[name]) {
    fail(`${label[0].toUpperCase()}${label.slice(1)} is too long.`, { [name]: `Use at most ${LIMITS[name]} characters.` });
  }
  return value;
}

const CUSTOMER_ID = /^CUST-\d{3,}$/i;
const DIGITS_PHONE = /^\d{7,15}$/;
const CUSTOMER_HINT = "Enter a customer ID like CUST-002, or a phone number using digits only (5145550311).";

function customerText(value, field = "customer") {
  const typed = String(value ?? "").trim();
  if (!typed) fail("Enter a customer ID or phone number.", { [field]: CUSTOMER_HINT });
  if (!CUSTOMER_ID.test(typed) && !DIGITS_PHONE.test(typed)) fail(CUSTOMER_HINT, { [field]: CUSTOMER_HINT });
  return typed;
}

// Customer ID or digits-only phone -> customer ID (or the text as typed when not found).
// Phone numbers are stored with dashes (514-555-0311), so only the digits are compared.
async function resolveCustomerId(typed) {
  if (CUSTOMER_ID.test(typed)) return typed.toUpperCase();
  const customers = await Customer.findAll({ where: { phoneNumber: { [Op.ne]: null } } });
  const match = customers.find((c) => String(c.phoneNumber).replace(/\D/g, "") === typed);
  return match ? match.customerId : typed;
}

function plain(rows) {
  return rows.map((row) => row.toJSON());
}

router.get(
  "/employees",
  route(async (req, res) => {
    const employees = await Employee.findAll({ order: [["employeeId", "ASC"]] });
    res.json({ ok: true, employees: employees.map((e) => ({ employeeId: e.employeeId, employeeName: e.employeeName })) });
  })
);

// Steps 1-4 (3a): look up the customer and everything the employee needs to review.
router.post(
  "/assist",
  route(async (req, res) => {
    const employee = await employeeOnly(req);
    const customerId = await resolveCustomerId(customerText(req.body?.customer));
    const result = await employee.assistCustomer(customerId);
    if (result.missingRecord) {
      res.json({ ok: true, missingRecord: true, customerId, message: `No customer record was found for "${customerId}".` });
      return;
    }
    const partner = await result.customer.getPartner();
    res.json({
      ok: true,
      missingRecord: false,
      customer: {
        customerId: result.customer.customerId,
        name: partner?.partnerName ?? null,
        phoneNumber: result.customer.phoneNumber,
        email: result.customer.email,
      },
      purchaseHistory: result.purchaseHistory.map((sale) => ({
        saleId: sale.saleId,
        saleDate: sale.saleDate,
        totalAmount: Number(sale.totalAmount),
        items: sale.items.map((item) => ({
          saleItemId: item.saleItemId,
          productId: item.productId,
          quantity: item.quantity,
          returnedQuantity: item.returnedQuantity,
          unitPrice: Number(item.unitPrice),
        })),
      })),
      returnRequests: plain(result.returnRequests),
      complaintCases: plain(result.complaintCases),
      supportRequests: plain(result.supportRequests),
    });
  })
);

// 3a: flag a missing customer record for the owner. Flagging it again returns the
// flag that is already open.
router.post(
  "/missing-record",
  route(async (req, res) => {
    const employee = await employeeOnly(req);
    const customer = customerText(req.body?.customer);
    const note = text(req.body, "note", "a note for the owner");
    const before = await SupportRequest.count({ where: { subject: "Missing record", requestStatus: "Open" } });
    const request = await employee.flagMissingRecord(customer, note);
    const after = await SupportRequest.count({ where: { subject: "Missing record", requestStatus: "Open" } });
    res.status(after > before ? 201 : 200).json({
      ok: true,
      requestId: request.requestId,
      message:
        after > before
          ? `Missing record flagged for the store owner (${request.requestId}).`
          : `This missing record was already flagged (${request.requestId}).`,
    });
  })
);

// Complaint cases.
router.post(
  "/complaints",
  route(async (req, res) => {
    const employee = await employeeOnly(req);
    const customerId = customerText(req.body?.customerId, "customerId");
    const category = text(req.body, "category", "a category");
    if (!COMPLAINT_CATEGORIES.includes(category)) {
      fail("Choose a category from the list.", { category: "Choose a category from the list." });
    }
    const description = text(req.body, "description", "a description");
    const complaint = await employee.createComplaintCase(customerId.toUpperCase(), { category, description });
    res.status(201).json({ ok: true, caseId: complaint.caseId, message: `Complaint case ${complaint.caseId} opened.` });
  })
);

// 5a: escalate to the store owner.
router.post(
  "/complaints/:caseId/escalate",
  route(async (req, res) => {
    const employee = await employeeOnly(req);
    const owner = await StoreOwner.findOne();
    const complaint = await employee.reviewIssue(req.params.caseId);
    if (complaint.status !== "Open") {
      fail(`Case ${complaint.caseId} is ${complaint.status}, so it cannot be escalated.`);
    }
    await employee.escalateComplaint(req.params.caseId, owner?.ownerId);
    res.json({ ok: true, message: `Case ${req.params.caseId} was escalated to the store owner.` });
  })
);

// Owner inbox: each section with its count, and the overall total.
async function ownerInbox(owner) {
  await reconcileAlerts();
  const [cases, missingRecords, deliveryNotices, restockAlerts] = await Promise.all([
    owner.listPendingCases(),
    owner.listMissingRecordFlags(),
    owner.reviewNotifications(), // unread delivery notices (Feature 3)
    RestockAlert.findAll({ where: { alertStatus: "PENDING" } }),
  ]);
  const totals = {
    escalatedComplaints: cases.length,
    missingRecords: missingRecords.length,
    deliveryNotices: deliveryNotices.length,
    restockAlerts: restockAlerts.length,
  };
  totals.total = totals.escalatedComplaints + totals.missingRecords + totals.deliveryNotices + totals.restockAlerts;
  return {
    ok: true,
    totals,
    cases: plain(cases),
    missingRecords: plain(missingRecords),
    deliveryNotices: plain(deliveryNotices),
    restockAlerts: plain(restockAlerts),
  };
}

router.get(
  ["/owner/inbox", "/owner/cases"],
  route(async (req, res) => {
    res.json(await ownerInbox(await ownerOnly(req)));
  })
);

router.post(
  "/owner/cases/:caseId/resolve",
  route(async (req, res) => {
    const owner = await ownerOnly(req);
    const complaint = await ComplaintCase.findByPk(req.params.caseId);
    if (!complaint) deny(`Complaint case ${req.params.caseId} was not found.`, 404);
    owner.reviewComplaint(complaint);
    await owner.resolveCase(complaint); // refuses a case that is not escalated
    res.json({ ok: true, message: `Case ${complaint.caseId} is resolved.` });
  })
);

// Support requests and notes (steps 8-9).
router.post(
  "/requests",
  route(async (req, res) => {
    const employee = await employeeOnly(req);
    const customerId = customerText(req.body?.customerId, "customerId");
    const subject = text(req.body, "subject", "a subject");
    const description = text(req.body, "description", "a description");
    const request = await employee.openSupportRequest(customerId.toUpperCase(), subject, description);
    res.status(201).json({ ok: true, requestId: request.requestId, message: `Support request ${request.requestId} opened.` });
  })
);

router.post(
  "/requests/:requestId/notes",
  route(async (req, res) => {
    const employee = await employeeOnly(req);
    const note = text(req.body, "text", "a note");
    await employee.addNotes(req.params.requestId, note);
    const request = await SupportRequest.findByPk(req.params.requestId);
    res.json({ ok: true, message: "Note added and the interaction was logged.", request: request.toJSON() });
  })
);

// Subflow S-1: process a return and refund (S-1a: not eligible).
router.post(
  "/returns",
  route(async (req, res) => {
    const employee = await employeeOnly(req);
    const customerId = customerText(req.body?.customerId, "customerId").toUpperCase();
    const { saleId } = req.body || {};
    const quantity = toInteger(req.body?.quantity);
    if (quantity === null || Number.isNaN(quantity) || quantity < 1) {
      fail("Quantity must be a whole number of at least 1.", { quantity: "Enter a whole number of at least 1." });
    }
    const reason = text(req.body, "reason", "a reason");
    const saleItemId = Number(req.body?.saleItemId);
    if (!Number.isInteger(saleItemId)) fail("Choose an item from the purchase history.");
    const result = await employee.requestReturn(customerId, saleId, saleItemId, quantity, reason);
    res.status(201).json({
      ok: true,
      ...result,
      message: result.refunded
        ? `Refund of $${Number(result.amount).toFixed(2)} CAD approved (${result.returnId}). It was recorded in accounting.`
        : `The return was not approved: ${result.reason}.`,
    });
  })
);

module.exports = router;
