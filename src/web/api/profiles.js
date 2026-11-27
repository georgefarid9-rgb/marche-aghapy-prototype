// Feature 3 — Supplier and Customer Profile Management (use case 3).
// The routes follow the Feature 3 sequence diagrams:
//   find:    Supplier.findProfile(partnerName) / Customer.findProfile(phoneNumber)   (2a)
//   view:    retrieveInfo(), getPerformanceReport(), listPurchaseHistory()           (8-9, 9a)
//   create:  BusinessPartner.validateProfile(details) -> create                       (3-6, 5a)
//   update:  BusinessPartner.updateProfile(changes) (validates first)                 (2S.1-2S.3)
//   status:  BusinessPartner.changeStatus(newStatus)
//   deliver: create PerformanceRecord -> flagDiscrepancy() -> StoreOwner.notify...()   (6, 6a, 6b)
//   inbox:   StoreOwner.reviewNotifications(), Notification.markAsRead()

const express = require("express");
const sequelize = require("../../database");
const {
  BusinessPartner,
  Supplier,
  Customer,
  PerformanceRecord,
  StoreOwner,
  Notification,
  Employee,
} = require("../../models");
const generateId = require("../../utils/generateId");
const { today } = require("../../utils/dates");
const { route, fail, toInteger } = require("./respond");

const router = express.Router();
const OWNER_ID = "OWN-001";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ----- Helpers -----

function blankToNull(value) {
  return value === undefined || value === null || String(value).trim() === "" ? null : String(value).trim();
}

async function supplierSummary(supplier) {
  const partner = supplier.partner ?? (await supplier.getPartner());
  return {
    supplierId: supplier.supplierId,
    partnerId: partner.partnerId,
    partnerName: partner.partnerName,
    partnerStatus: partner.partnerStatus,
    contactInformation: supplier.contactInformation,
    leadTimeDays: supplier.leadTimeDays,
    paymentTerms: supplier.paymentTerms,
    averageFillRate: await supplier.evaluatePerformance(),
  };
}

async function customerSummary(customer) {
  const partner = customer.partner ?? (await customer.getPartner());
  return {
    customerId: customer.customerId,
    partnerId: partner.partnerId,
    partnerName: partner.partnerName,
    partnerStatus: partner.partnerStatus,
    phoneNumber: customer.phoneNumber,
    email: customer.email,
    createdDate: customer.createdDate,
  };
}

// The reason validateProfile() said no, in words the user understands (inline messages).
async function explainInvalidProfile(partnerType, details, partnerId = null) {
  const problems = {};
  if ("partnerName" in details && !blankToNull(details.partnerName)) {
    problems.partnerName = "Enter a name.";
  }
  if (partnerType === "Supplier") {
    if ("leadTimeDays" in details && details.leadTimeDays !== null) {
      if (!Number.isInteger(details.leadTimeDays) || details.leadTimeDays < 0) {
        problems.leadTimeDays = "Lead time must be a whole number of days (0 or more).";
      }
    }
    if (blankToNull(details.partnerName)) {
      const existing = await Supplier.findProfile(details.partnerName);
      if (existing && existing.partnerId !== partnerId) {
        problems.partnerName = `A supplier named "${details.partnerName.trim()}" already exists (${existing.supplierId}).`;
      }
    }
  } else {
    if ("phoneNumber" in details && !blankToNull(details.phoneNumber)) {
      problems.phoneNumber = "Enter a phone number.";
    }
    if (blankToNull(details.email) && !EMAIL_PATTERN.test(details.email.trim())) {
      problems.email = "Enter a valid email address (for example name@example.com).";
    }
    if (blankToNull(details.phoneNumber)) {
      const existing = await Customer.findProfile(details.phoneNumber);
      if (existing && existing.partnerId !== partnerId) {
        problems.phoneNumber = `The phone number ${details.phoneNumber.trim()} already belongs to ${existing.customerId}.`;
      }
    }
  }
  if ("partnerStatus" in details && !["Active", "Inactive"].includes(details.partnerStatus)) {
    problems.partnerStatus = "Status must be Active or Inactive.";
  }
  return problems;
}

function rejectProfile(res, problems) {
  res.status(400).json({
    ok: false,
    message:
      Object.keys(problems).length > 0
        ? "Please correct the highlighted fields. Nothing was saved."
        : "These details are not valid. Nothing was saved.",
    fieldErrors: problems,
  });
}

// Keep only the profile fields of this partner type from the form.
function profileChanges(partnerType, body) {
  const changes = {};
  const fields =
    partnerType === "Supplier"
      ? ["partnerName", "partnerStatus", "contactInformation", "leadTimeDays", "paymentTerms"]
      : ["partnerName", "partnerStatus", "phoneNumber", "email"];
  for (const field of fields) {
    if (field in body) {
      changes[field] = field === "leadTimeDays" ? toInteger(body[field]) : body[field];
    }
  }
  return changes;
}

// ----- Suppliers -----

router.get(
  "/suppliers",
  route(async (req, res) => {
    const suppliers = await Supplier.findAll({
      include: [{ model: BusinessPartner, as: "partner", required: true }],
      order: [["supplierId", "ASC"]],
    });
    res.json({ ok: true, suppliers: await Promise.all(suppliers.map(supplierSummary)) });
  })
);

// 2 / 2a: find a supplier by name.
router.get(
  "/suppliers/find",
  route(async (req, res) => {
    const name = blankToNull(req.query.name);
    if (!name) fail("Enter a supplier name to search for.");
    const supplier = await Supplier.findProfile(name);
    if (!supplier) {
      res.status(404).json({ ok: false, notFound: true, message: `No supplier named "${name}" was found. You can create a new profile.` });
      return;
    }
    res.json({ ok: true, supplierId: supplier.supplierId });
  })
);

// 8-9: the supplier's profile, delivery history and performance report.
router.get(
  "/suppliers/:supplierId",
  route(async (req, res) => {
    const supplier = await Supplier.findByPk(req.params.supplierId);
    if (!supplier || !supplier.partnerId) {
      res.status(404).json({ ok: false, message: `Supplier ${req.params.supplierId} was not found.` });
      return;
    }
    const records = await supplier.getPerformanceRecords({ order: [["deliveryDate", "DESC"]] });
    res.json({
      ok: true,
      profile: await supplierSummary(supplier),
      profileText: await supplier.retrieveInfo(),
      report: await supplier.getPerformanceReport(),
      deliveries: records.map((r) => ({
        ...r.toJSON(),
        deliveryDelay: r.calculateDeliveryDelay(),
        fillRate: r.isUnplanned ? null : r.calculateFillRate(),
        discrepancy: r.flagDiscrepancy(),
      })),
    });
  })
);

// 3-6 / 5a: create a supplier profile.
router.post(
  "/suppliers",
  route(async (req, res) => {
    const details = profileChanges("Supplier", req.body);
    details.partnerName = details.partnerName ?? "";
    const aPartner = BusinessPartner.build({ partnerType: "Supplier" });
    if (!(await aPartner.validateProfile(details))) {
      rejectProfile(res, await explainInvalidProfile("Supplier", details));
      return;
    }
    const partnerId = generateId("BP");
    const supplierId = generateId("SUP");
    await sequelize.transaction(async (transaction) => {
      await BusinessPartner.create(
        {
          partnerId,
          partnerName: details.partnerName.trim(),
          partnerType: "Supplier",
          partnerStatus: details.partnerStatus || "Active",
        },
        { transaction }
      );
      await Supplier.create(
        {
          supplierId,
          partnerId,
          contactInformation: blankToNull(details.contactInformation),
          leadTimeDays: details.leadTimeDays ?? null,
          paymentTerms: blankToNull(details.paymentTerms),
        },
        { transaction }
      );
    });
    res.status(201).json({ ok: true, supplierId, message: `Supplier profile ${supplierId} created.` });
  })
);

// ----- Customers -----

router.get(
  "/customers",
  route(async (req, res) => {
    const customers = await Customer.findAll({
      include: [{ model: BusinessPartner, as: "partner", required: true }],
      order: [["customerId", "ASC"]],
    });
    res.json({ ok: true, customers: await Promise.all(customers.map(customerSummary)) });
  })
);

// 2 / 2a: find a customer by phone number.
router.get(
  "/customers/find",
  route(async (req, res) => {
    const phone = blankToNull(req.query.phone);
    if (!phone) fail("Enter a phone number to search for.");
    const customer = await Customer.findProfile(phone);
    if (!customer) {
      res.status(404).json({ ok: false, notFound: true, message: `No customer with phone ${phone} was found. You can create a new profile.` });
      return;
    }
    res.json({ ok: true, customerId: customer.customerId });
  })
);

router.get(
  "/customers/:customerId",
  route(async (req, res) => {
    const customer = await Customer.findByPk(req.params.customerId);
    if (!customer || !customer.partnerId) {
      res.status(404).json({ ok: false, message: `Customer ${req.params.customerId} was not found.` });
      return;
    }
    const sales = await customer.listPurchaseHistory();
    res.json({
      ok: true,
      profile: await customerSummary(customer),
      profileText: await customer.retrieveInfo(),
      purchaseHistory: sales.map((sale) => ({
        saleId: sale.saleId,
        saleDate: sale.saleDate,
        totalAmount: Number(sale.totalAmount),
        paymentMethod: sale.paymentMethod,
      })),
    });
  })
);

router.post(
  "/customers",
  route(async (req, res) => {
    const details = profileChanges("Customer", req.body);
    details.partnerName = details.partnerName ?? "";
    details.phoneNumber = details.phoneNumber ?? "";
    const aPartner = BusinessPartner.build({ partnerType: "Customer" });
    if (!(await aPartner.validateProfile(details))) {
      rejectProfile(res, await explainInvalidProfile("Customer", details));
      return;
    }
    const partnerId = generateId("BP");
    const customerId = generateId("CUST");
    await sequelize.transaction(async (transaction) => {
      await BusinessPartner.create(
        {
          partnerId,
          partnerName: details.partnerName.trim(),
          partnerType: "Customer",
          partnerStatus: details.partnerStatus || "Active",
        },
        { transaction }
      );
      await Customer.create(
        {
          customerId,
          partnerId,
          phoneNumber: details.phoneNumber.trim(),
          email: blankToNull(details.email),
          createdDate: today(),
        },
        { transaction }
      );
    });
    res.status(201).json({ ok: true, customerId, message: `Customer profile ${customerId} created.` });
  })
);

// ----- Update and status (both partner types) -----

// 2S.1-2S.3: updateProfile() validates first and saves nothing when the changes are invalid.
router.put(
  "/partners/:partnerId",
  route(async (req, res) => {
    const partner = await BusinessPartner.findByPk(req.params.partnerId);
    if (!partner) {
      res.status(404).json({ ok: false, message: `Profile ${req.params.partnerId} was not found.` });
      return;
    }
    const changes = profileChanges(partner.partnerType, req.body);
    delete changes.partnerStatus; // the status has its own action (changeStatus)
    if (!(await partner.validateProfile(changes))) {
      rejectProfile(res, await explainInvalidProfile(partner.partnerType, changes, partner.partnerId));
      return;
    }
    await partner.updateProfile(changes);
    res.json({ ok: true, message: "Profile saved." });
  })
);

router.post(
  "/partners/:partnerId/status",
  route(async (req, res) => {
    const partner = await BusinessPartner.findByPk(req.params.partnerId);
    if (!partner) {
      res.status(404).json({ ok: false, message: `Profile ${req.params.partnerId} was not found.` });
      return;
    }
    await partner.changeStatus(req.body.partnerStatus);
    res.json({ ok: true, message: `Profile is now ${partner.partnerStatus}.` });
  })
);

// ----- Deliveries (6, 6a, 6b) and the owner's notifications -----

router.get(
  "/employees",
  route(async (req, res) => {
    const employees = await Employee.findAll({ order: [["employeeId", "ASC"]] });
    res.json({ ok: true, employees: employees.map((e) => ({ employeeId: e.employeeId, employeeName: e.employeeName })) });
  })
);

router.post(
  "/suppliers/:supplierId/deliveries",
  route(async (req, res) => {
    const supplier = await Supplier.findByPk(req.params.supplierId);
    if (!supplier) fail(`Supplier ${req.params.supplierId} was not found.`);
    const isUnplanned = req.body.isUnplanned === true || req.body.isUnplanned === "true";

    const fieldErrors = {};
    const quantityReceived = toInteger(req.body.quantityReceived);
    const quantityOrdered = isUnplanned ? null : toInteger(req.body.quantityOrdered);
    if (!blankToNull(req.body.deliveryDate)) fieldErrors.deliveryDate = "Enter the delivery date.";
    if (!Number.isInteger(quantityReceived) || quantityReceived < 0) {
      fieldErrors.quantityReceived = "Enter the quantity received (0 or more).";
    }
    if (!isUnplanned) {
      if (!blankToNull(req.body.expectedDeliveryDate)) fieldErrors.expectedDeliveryDate = "Enter the expected date from the purchase order.";
      if (!Number.isInteger(quantityOrdered) || quantityOrdered < 1) {
        fieldErrors.quantityOrdered = "Enter the quantity ordered on the purchase order.";
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ ok: false, message: "Please correct the highlighted fields. Nothing was saved.", fieldErrors });
      return;
    }

    const aRecord = await PerformanceRecord.create({
      recordId: generateId("PERF"),
      deliveryDate: req.body.deliveryDate,
      expectedDeliveryDate: isUnplanned ? null : req.body.expectedDeliveryDate,
      quantityOrdered,
      quantityReceived,
      conditionRating: req.body.conditionRating || "Good",
      isUnplanned,
      supplierId: supplier.supplierId,
      employeeId: req.body.employeeId,
    });

    const owner = await StoreOwner.findByPk(OWNER_ID);
    let notification = null;
    if (isUnplanned) {
      notification = await owner.notifyUnplannedDelivery(aRecord.recordId); // 6b
    } else if (aRecord.flagDiscrepancy()) {
      notification = await owner.notifyDiscrepancy(aRecord.recordId); // 6a
    }
    res.status(201).json({
      ok: true,
      recordId: aRecord.recordId,
      fillRate: isUnplanned ? null : aRecord.calculateFillRate(),
      deliveryDelay: aRecord.calculateDeliveryDelay(),
      notification: notification ? notification.toJSON() : null,
      message: notification
        ? `Delivery ${aRecord.recordId} recorded. The store owner was notified: ${notification.notificationType}.`
        : `Delivery ${aRecord.recordId} recorded. No discrepancy.`,
    });
  })
);

router.get(
  "/notifications",
  route(async (req, res) => {
    const owner = await StoreOwner.findByPk(OWNER_ID);
    const notifications = await owner.reviewNotifications();
    res.json({ ok: true, notifications: notifications.map((n) => n.toJSON()) });
  })
);

router.post(
  "/notifications/:notificationId/read",
  route(async (req, res) => {
    const notification = await Notification.findByPk(req.params.notificationId);
    if (!notification) fail("Notification not found.");
    await notification.markAsRead();
    res.json({ ok: true });
  })
);

module.exports = router;
