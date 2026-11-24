// Feature 1 — Products and Inventory.
// Every route drives the <<boundary>> InventoryPage, which asks InventoryController to
// validate and save (Milestone 6 scenario 1: Update Existing Product Inventory).

const express = require("express");
const InventoryPage = require("../../pages/InventoryPage");
const { Supplier, BusinessPartner, StoreOwner, Product, RestockAlert } = require("../../models");
const { route } = require("./respond");

const router = express.Router();

// Keep only the fields the user filled in; numbers are sent as numbers.
const NUMBER_FIELDS = ["quantityOnHand", "reorderLevel"];
function formDataFrom(body) {
  const data = {};
  for (const [field, value] of Object.entries(body || {})) {
    if (value === undefined || value === "") continue;
    data[field] = NUMBER_FIELDS.includes(field) && /^-?\d+(\.\d+)?$/.test(String(value)) ? Number(value) : value;
  }
  return data;
}

function pageResult(page) {
  return {
    view: page.view,
    errorMessage: page.errorMessage,
    warningMessage: page.warningMessage,
    updatedInformation: page.updatedInformation,
    restockAlert: page.lastAlert ? page.lastAlert.toJSON() : null,
    currentInventory: page.currentInventory,
  };
}

// Supplier ID -> name (the partner name of a Feature 3 profile, or the old supplierName).
async function supplierNames() {
  const suppliers = await Supplier.findAll({ include: [{ model: BusinessPartner, as: "partner" }] });
  return Object.fromEntries(suppliers.map((s) => [s.supplierId, s.partner?.partnerName ?? s.supplierName]));
}

// Steps 1-2: Inventory Management shows the current products and inventory.
// The list from InventoryPage is completed with each product's category and supplier
// (wireframe 1.1 shows and filters by category).
router.get(
  "/",
  route(async (req, res) => {
    const page = new InventoryPage();
    await page.beginInventoryReview();
    const products = await Product.findAll();
    const names = await supplierNames();
    const byId = Object.fromEntries(products.map((p) => [p.productId, p]));
    res.json({
      ok: true,
      inventory: page.currentInventory.map((row) => ({
        ...row,
        category: byId[row.productId]?.category ?? null,
        supplierName: names[byId[row.productId]?.supplierId] ?? null,
      })),
    });
  })
);

// Suppliers for the product form.
router.get(
  "/suppliers",
  route(async (req, res) => {
    const suppliers = await Supplier.findAll({
      include: [{ model: BusinessPartner, as: "partner" }],
      order: [["supplierId", "ASC"]],
    });
    res.json({
      ok: true,
      suppliers: suppliers.map((s) => ({ supplierId: s.supplierId, name: s.partner?.partnerName ?? s.supplierName })),
    });
  })
);

// Restock alerts for the owner (StoreOwner.reviewRestockAlert).
router.get(
  "/alerts",
  route(async (req, res) => {
    const owner = await StoreOwner.findByPk("OWN-001");
    const alerts = await owner.reviewRestockAlert();
    res.json({
      ok: true,
      alerts: alerts
        .filter((a) => a.alertStatus === "PENDING")
        .map((a) => a.toJSON()),
    });
  })
);

// S-2 steps: select a product -> displayExistingProduct().
router.get(
  "/:productId",
  route(async (req, res) => {
    const page = new InventoryPage();
    page.selectedTask = "UPDATE";
    page.selectedProductId = req.params.productId;
    await page.selectMaintenanceTask();
    if (page.view === "ERROR") {
      res.status(404).json({ ok: false, message: page.errorMessage });
      return;
    }
    const product = page.existingProduct;
    const names = await supplierNames();
    const alerts = await RestockAlert.findAll({
      where: { inventoryId: product.inventoryRecord?.inventoryId ?? null },
    });
    res.json({
      ok: true,
      product,
      supplierName: names[product.supplierId] ?? null,
      alerts: alerts.map((a) => a.toJSON()),
    });
  })
);

// S-2: submit changed fields -> validate -> save -> evaluate -> restock alert.
router.put(
  "/:productId",
  route(async (req, res) => {
    const page = new InventoryPage();
    page.selectedTask = "UPDATE";
    page.selectedProductId = req.params.productId;
    await page.selectMaintenanceTask();
    if (page.view === "ERROR") {
      res.status(404).json({ ok: false, message: page.errorMessage });
      return;
    }
    page.formData = formDataFrom(req.body);
    page.provideProductAndInventoryChanges();
    await page.submitProductInformation();
    if (page.view === "CORRECTION_REQUIRED") {
      res.status(400).json({ ok: false, message: page.errorMessage });
      return;
    }
    page.inventoryReviewComplete();
    res.json({ ok: true, ...pageResult(page) });
  })
);

// S-1: record a new product and its inventory.
router.post(
  "/",
  route(async (req, res) => {
    const page = new InventoryPage();
    page.selectedTask = "NEW";
    await page.selectMaintenanceTask();
    page.formData = formDataFrom(req.body);
    page.provideProductQuantityExpiry();
    await page.submitProductInformation();
    if (page.view === "CORRECTION_REQUIRED") {
      res.status(400).json({ ok: false, message: page.errorMessage });
      return;
    }
    page.inventoryReviewComplete();
    res.json({ ok: true, ...pageResult(page) });
  })
);

module.exports = router;
