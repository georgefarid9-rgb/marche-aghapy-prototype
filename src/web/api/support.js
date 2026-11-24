// Feature 6 — Customer Support (use case 6).
// The employee looks up the customer (Employee.assistCustomer), then opens a complaint
// case, a support request or a return; the owner reviews escalated cases.
// A customer can be looked up by customer ID or by phone number
// (Customer.findProfile from Feature 3).

const express = require("express");
const { Employee, Customer, StoreOwner, ComplaintCase, SupportRequest } = require("../../models");
const { route, fail, toInteger } = require("./respond");

const router = express.Router();
const OWNER_ID = "OWN-001";

async function employeeFrom(req) {
  const employeeId = req.body?.employeeId || req.query.employeeId || "EMP-001";
  const employee = await Employee.findByPk(employeeId);
  if (!employee) fail(`Employee ${employeeId} was not found.`);
  return employee;
}

// ID ("CUST-...") or phone number -> customer ID (or the text as typed when not found).
async function resolveCustomerId(input) {
  const text = String(input ?? "").trim();
  if (!text) fail("Enter a customer ID or phone number.");
  if (/^CUST-/i.test(text)) return text.toUpperCase();
  const customer = await Customer.findProfile(text);
  return customer ? customer.customerId : text;
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
    const employee = await employeeFrom(req);
    const customerId = await resolveCustomerId(req.body.customer);
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

// 3a: flag a missing customer record for the owner.
router.post(
  "/missing-record",
  route(async (req, res) => {
    const employee = await employeeFrom(req);
    const request = await employee.flagMissingRecord(String(req.body.customer ?? "").trim(), req.body.note);
    res.status(201).json({ ok: true, message: `Missing record flagged for the store owner (${request.requestId}).` });
  })
);

// Complaint cases.
router.post(
  "/complaints",
  route(async (req, res) => {
    const employee = await employeeFrom(req);
    const { customerId, category, description } = req.body;
    const complaint = await employee.createComplaintCase(customerId, { category, description });
    res.status(201).json({ ok: true, message: `Complaint case ${complaint.caseId} opened.` });
  })
);

// 5a: escalate to the store owner.
router.post(
  "/complaints/:caseId/escalate",
  route(async (req, res) => {
    const employee = await employeeFrom(req);
    await employee.escalateComplaint(req.params.caseId, OWNER_ID);
    res.json({ ok: true, message: `Case ${req.params.caseId} was escalated to the store owner.` });
  })
);

// Owner: escalated cases waiting for review, and resolving one.
router.get(
  "/owner/cases",
  route(async (req, res) => {
    const owner = await StoreOwner.findByPk(OWNER_ID);
    res.json({
      ok: true,
      cases: plain(await owner.listPendingCases()),
      missingRecords: plain(await owner.listMissingRecordFlags()),
    });
  })
);

router.post(
  "/owner/cases/:caseId/resolve",
  route(async (req, res) => {
    const owner = await StoreOwner.findByPk(OWNER_ID);
    const complaint = await ComplaintCase.findByPk(req.params.caseId);
    if (!complaint) fail(`Complaint case ${req.params.caseId} was not found.`);
    owner.reviewComplaint(complaint);
    await owner.resolveCase(complaint);
    res.json({ ok: true, message: `Case ${complaint.caseId} is resolved.` });
  })
);

// Support requests and notes (steps 8-9).
router.post(
  "/requests",
  route(async (req, res) => {
    const employee = await employeeFrom(req);
    const { customerId, subject, description } = req.body;
    if (!subject || !String(subject).trim()) fail("Enter a subject.");
    const request = await employee.openSupportRequest(customerId, String(subject).trim(), description);
    res.status(201).json({ ok: true, message: `Support request ${request.requestId} opened.` });
  })
);

router.post(
  "/requests/:requestId/notes",
  route(async (req, res) => {
    const employee = await employeeFrom(req);
    await employee.addNotes(req.params.requestId, req.body.text);
    const request = await SupportRequest.findByPk(req.params.requestId);
    res.json({ ok: true, message: "Note added and the interaction was logged.", request: request.toJSON() });
  })
);

// Subflow S-1: process a return and refund (S-1a: not eligible).
router.post(
  "/returns",
  route(async (req, res) => {
    const employee = await employeeFrom(req);
    const { customerId, saleId, saleItemId, reason } = req.body;
    const quantity = toInteger(req.body.quantity);
    const result = await employee.requestReturn(customerId, saleId, Number(saleItemId), quantity, reason || "Customer return");
    res.status(201).json({
      ok: true,
      ...result,
      message: result.refunded
        ? `Refund of $${Number(result.amount).toFixed(2)} approved (${result.returnId}). It was recorded in accounting.`
        : `The return was not approved: ${result.reason}`,
    });
  })
);

module.exports = router;
