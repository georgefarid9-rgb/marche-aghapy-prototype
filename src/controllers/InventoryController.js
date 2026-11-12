
const { Product, InventoryRecord, RestockAlert, Supplier } = require("../models");
const generateId = require("../utils/generateId");
const { today, daysBetween } = require("../utils/dates");

const PRODUCT_FIELDS = ["productName", "description", "category", "supplierId"];
const INVENTORY_FIELDS = ["quantityOnHand", "reorderLevel", "expiryDate"];

function parseData(data) {
  if (typeof data !== "string") return null;

  try {
    const result = JSON.parse(data);
    return result && typeof result === "object" && !Array.isArray(result)
      ? result : null;
  } catch {
    return null;
  }
}

function validDate(value) {
  if (value === null) return true;

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

class InventoryController {
  constructor() {
    // The InventoryPage will set these based on the user's selections.
    this.selectedTask = null;
    this.selectedProductId = null;
    this.pendingData = null;

    this.lastError = null;
    this.lastWarning = null;
    this.lastResult = null;
    this.lastAlert = null;
  }

  // 1. Retrieve all current inventory records.
  async retrieveInventory() {
    return InventoryRecord.findAll({
      include: [{ model: Product, as: "product" }],
      order: [["inventoryId", "ASC"]],
    });
  }

  // 2. Execute the maintenance task selected by the user.
  async executeSelectedSubflow() {
    if (this.selectedTask === "NEW") {
      await this.submitNewProduct(this.pendingData);
    } else if (this.selectedTask === "UPDATE") {
      await this.submitUpdates(this.pendingData);
    } else {
      this.lastError = "Select an inventory maintenance task first.";
    }
  }

  // 3. Record a new product and its inventory information.
  async submitNewProduct(data) {
    this.selectedTask = "NEW";
    this.pendingData = data;
    this.lastError = this.lastWarning = this.lastResult = this.lastAlert = null;

    if (!this.validateSubmittedData()) return false;

    const details = parseData(data);
    let product = null;
    let inventory = null;

    try {
      if (await Product.findByPk(details.productId)) {
        throw new Error("Product ID already exists.");
      }

      if (await InventoryRecord.findByPk(details.inventoryId)) {
        throw new Error("Inventory ID already exists.");
      }

      if (details.supplierId && !(await Supplier.findByPk(details.supplierId))) {
        throw new Error("Supplier does not exist.");
      }

      product = Product.build({
        productId: details.productId,
        productName: details.productName,
        description: details.description ?? null,
        category: details.category ?? null,
        supplierId: details.supplierId ?? null,
      });

      await product.recordNewProduct(data);

      inventory = InventoryRecord.build();

      await inventory.createInventoryRecord(JSON.stringify({
        inventoryId: details.inventoryId,
        productId: details.productId,
        quantityOnHand: details.quantityOnHand,
        reorderLevel: details.reorderLevel ?? 0,
        expiryDate: details.expiryDate ?? null,
      }));

      this.lastResult = { product, inventory };

      await this._tryGenerateAlert(inventory);

      return true;
    } catch (error) {
      // Clean up the new product if inventory creation failed.
      if (
        product &&
        !product.isNewRecord &&
        (!inventory || inventory.isNewRecord)
      ) {
        try {
          await product.destroy();
        } catch (cleanupError) {
          this.lastWarning = `Cleanup failed: ${cleanupError.message}`;
        }
      }

      this.lastError = error.message;
      return false;
    }
  }

  // 4. Retrieve the product selected by the user.
  async retrieveSelectedProduct() {
    if (!this.selectedProductId) {
      throw new Error("Select a product first.");
    }

    return Product.findByPk(this.selectedProductId, {
      include: [{ model: InventoryRecord, as: "inventoryRecord" }],
    });
  }

  // 5. Update an existing product and inventory record.
  async submitUpdates(data) {
    this.selectedTask = "UPDATE";
    this.pendingData = data;
    this.lastError = this.lastWarning = this.lastResult = this.lastAlert = null;

    if (!this.validateSubmittedData()) return false;

    const details = parseData(data);

    try {
      const product = await this.retrieveSelectedProduct();

      if (!product || !product.inventoryRecord) {
        throw new Error("Product or inventory record was not found.");
      }

      const inventory = product.inventoryRecord;

      if (
        hasOwn(details, "inventoryId") &&
        details.inventoryId !== inventory.inventoryId
      ) {
        throw new Error("Inventory ID cannot be changed.");
      }

      if (!product.validateProductInformation(data)) {
        throw new Error("Invalid product information.");
      }

      if (PRODUCT_FIELDS.some(field => hasOwn(details, field))) {
        await product.updateProductInformation(data);
      }

      if (INVENTORY_FIELDS.some(field => hasOwn(details, field))) {
        await inventory.updateInventoryInformation(data);
      }

      this.lastResult = { product, inventory };

      await this._tryGenerateAlert(inventory);

      return true;
    } catch (error) {
      this.lastError = error.message;
      return false;
    }
  }

  // 6. Validate the information before it is saved.
  validateSubmittedData() {
    const details = parseData(this.pendingData);

    if (!details) {
      this.lastError = "Provide a valid JSON object as a string.";
      return false;
    }

    if (this.selectedTask !== "NEW" && this.selectedTask !== "UPDATE") {
      this.lastError = "Select NEW or UPDATE as the task.";
      return false;
    }

    if (this.selectedTask === "NEW") {
      const sample = Product.build({
        productId: details.productId,
        productName: details.productName,
        description: details.description,
        category: details.category,
      });

      if (!sample.validateProductInformation(this.pendingData)) {
        this.lastError = "A valid product ID and name are required.";
        return false;
      }

      if (typeof details.inventoryId !== "string" || !details.inventoryId.trim()) {
        this.lastError = "Inventory ID is required.";
        return false;
      }

      if (!hasOwn(details, "quantityOnHand")) {
        this.lastError = "Initial quantity is required.";
        return false;
      }
    } else {
      if (!this.selectedProductId) {
        this.lastError = "Select a product before updating it.";
        return false;
      }

      if (
        hasOwn(details, "productId") &&
        details.productId !== this.selectedProductId
      ) {
        this.lastError = "Product ID cannot be changed.";
        return false;
      }

      if (
        ![...PRODUCT_FIELDS, ...INVENTORY_FIELDS]
          .some(field => hasOwn(details, field))
      ) {
        this.lastError = "Provide at least one product or inventory change.";
        return false;
      }

      if (
        hasOwn(details, "productName") &&
        (typeof details.productName !== "string" ||
          !details.productName.trim())
      ) {
        this.lastError = "Product name cannot be blank.";
        return false;
      }
    }

    for (const field of ["quantityOnHand", "reorderLevel"]) {
      if (
        hasOwn(details, field) &&
        (!Number.isSafeInteger(details[field]) || details[field] < 0)
      ) {
        this.lastError = `${field} must be a non-negative integer.`;
        return false;
      }
    }

    if (hasOwn(details, "expiryDate") && !validDate(details.expiryDate)) {
      this.lastError = "Expiry date must be a valid YYYY-MM-DD date or null.";
      return false;
    }

    for (const field of ["description", "category"]) {
      if (
        hasOwn(details, field) &&
        details[field] !== null &&
        typeof details[field] !== "string"
      ) {
        this.lastError = `${field} must be a string or null.`;
        return false;
      }
    }

    if (
      hasOwn(details, "supplierId") &&
      details.supplierId !== null &&
      (typeof details.supplierId !== "string" ||
        !details.supplierId.trim())
    ) {
      this.lastError = "Supplier ID must be a non-empty string or null.";
      return false;
    }

    this.lastError = null;
    return true;
  }

  // 7. Validate information after the user makes corrections.
  revalidateCorrectedData() {
    return this.validateSubmittedData();
  }

  // Internal helper: generate or resolve replenishment alerts.
  async _tryGenerateAlert(inventory) {
    try {
      const product = await Product.findByPk(inventory.productId, {
        include: [{ model: Supplier, as: "supplier" }],
      });

      const stockStatus = inventory.evaluateInventoryStatus();
      const expiryStatus = inventory.evaluateExpiryConditions();

      const daysLeft = inventory.expiryDate
        ? daysBetween(today(), inventory.expiryDate)
        : null;

      const leadTime = product?.supplier?.leadTimeDays;
      const hasLeadTime = Number.isSafeInteger(leadTime) && leadTime >= 0;

      const expiryRisk =
        expiryStatus === "EXPIRED" ||
        expiryStatus === "NEAR_EXPIRY" ||
        (daysLeft !== null && hasLeadTime && daysLeft <= leadTime);

      // Resolve pending alerts when replenishment is no longer needed.
      if (stockStatus === "IN_STOCK" && !expiryRisk) {
        await RestockAlert.update(
          { alertStatus: "RESOLVED" },
          {
            where: {
              inventoryId: inventory.inventoryId,
              alertStatus: "PENDING",
            },
          }
        );
        return;
      }

      // Reuse an existing pending alert rather than creating duplicates.
      const existing = await RestockAlert.findOne({
        where: {
          inventoryId: inventory.inventoryId,
          alertStatus: "PENDING",
        },
      });

      if (existing) {
        this.lastAlert = existing;
        return;
      }

      const alert = RestockAlert.build({
        alertId: generateId("ALERT"),
        inventoryId: inventory.inventoryId,
      });

      await alert.generateRestockAlert();

      this.lastAlert = alert;
    } catch (error) {
      this.lastWarning =
        `Inventory saved, but the restock alert failed: ${error.message}`;
    }
  }
}

module.exports = InventoryController;
