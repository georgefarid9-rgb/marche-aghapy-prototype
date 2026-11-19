
const sequelize = require("../database");

const {
  Product,
  InventoryRecord,
  RestockAlert,
  Supplier,
} = require("../models");

const generateId = require("../utils/generateId");
const { today, daysBetween } = require("../utils/dates");

const PRODUCT_FIELDS = [
  "productName",
  "description",
  "category",
  "supplierId",
];

const INVENTORY_FIELDS = [
  "quantityOnHand",
  "reorderLevel",
  "expiryDate",
];

function parseData(data) {
  if (typeof data !== "string") return null;

  try {
    const result = JSON.parse(data);

    return result &&
      typeof result === "object" &&
      !Array.isArray(result)
      ? result
      : null;
  } catch {
    return null;
  }
}

function validDate(value) {
  if (value === null) return true;

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

class InventoryController {
  constructor() {
    this.selectedTask = null;
    this.selectedProductId = null;
    this.pendingData = null;

    this.lastError = null;
    this.lastWarning = null;
    this.lastResult = null;
    this.lastAlert = null;
  }

  // 1. Retrieve the current inventory.
  async retrieveInventory() {
    return InventoryRecord.findAll({
      include: [
        { model: Product, as: "product" },
      ],
      order: [["inventoryId", "ASC"]],
    });
  }

  // 2. Execute the selected maintenance task.
  async executeSelectedSubflow() {
    if (this.selectedTask === "NEW") {
      await this.submitNewProduct(this.pendingData);
    } else if (this.selectedTask === "UPDATE") {
      await this.submitUpdates(this.pendingData);
    } else {
      this.lastError =
        "Select an inventory maintenance task first.";
    }
  }

  // 3. Create a product and inventory in one transaction.
  async submitNewProduct(data) {
    this.selectedTask = "NEW";
    this.pendingData = data;

    this.lastError = null;
    this.lastWarning = null;
    this.lastResult = null;
    this.lastAlert = null;

    if (!this.validateSubmittedData()) return false;

    const details = parseData(data);

    try {
      const result = await sequelize.transaction(
        async (transaction) => {
          if (
            await Product.findByPk(details.productId, {
              transaction,
            })
          ) {
            throw new Error("Product ID already exists.");
          }

          if (
            await InventoryRecord.findByPk(details.inventoryId, {
              transaction,
            })
          ) {
            throw new Error("Inventory ID already exists.");
          }

          if (
            details.supplierId &&
            !(await Supplier.findByPk(details.supplierId, {
              transaction,
            }))
          ) {
            throw new Error("Supplier does not exist.");
          }

          const product = Product.build({
            productId: details.productId,
            productName: details.productName,
            description: details.description ?? null,
            category: details.category ?? null,
            supplierId: details.supplierId ?? null,
          });

          await product.recordNewProduct(data, {
            transaction,
          });

          const inventory = InventoryRecord.build();

          await inventory.createInventoryRecord(
            JSON.stringify({
              inventoryId: details.inventoryId,
              productId: details.productId,
              quantityOnHand: details.quantityOnHand,
              reorderLevel: details.reorderLevel ?? 0,
              expiryDate: details.expiryDate ?? null,
            }),
            { transaction }
          );

          const alert = await this._tryGenerateAlert(
            inventory,
            { transaction }
          );

          return { product, inventory, alert };
        }
      );

      this.lastResult = {
        product: result.product,
        inventory: result.inventory,
      };

      this.lastAlert = result.alert;
      return true;
    } catch (error) {
      this.lastError = error.message;
      return false;
    }
  }

  // 4. Retrieve the selected product.
  async retrieveSelectedProduct(options = {}) {
    if (!this.selectedProductId) {
      throw new Error("Select a product first.");
    }

    return Product.findByPk(this.selectedProductId, {
      include: [
        {
          model: InventoryRecord,
          as: "inventoryRecord",
        },
      ],
      ...options,
    });
  }

  // 5. Update product and inventory information atomically.
  async submitUpdates(data) {
    this.selectedTask = "UPDATE";
    this.pendingData = data;

    this.lastError = null;
    this.lastWarning = null;
    this.lastResult = null;
    this.lastAlert = null;

    if (!this.validateSubmittedData()) return false;

    const details = parseData(data);

    try {
      const result = await sequelize.transaction(
        async (transaction) => {
          const product = await this.retrieveSelectedProduct({
            transaction,
          });

          if (!product || !product.inventoryRecord) {
            throw new Error(
              "Product or inventory record was not found."
            );
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

          if (
            PRODUCT_FIELDS.some((field) => hasOwn(details, field))
          ) {
            await product.updateProductInformation(data, {
              transaction,
            });
          }

          if (
            INVENTORY_FIELDS.some((field) => hasOwn(details, field))
          ) {
            await inventory.updateInventoryInformation(data, {
              transaction,
            });
          }

          const alert = await this._tryGenerateAlert(
            inventory,
            { transaction }
          );

          return { product, inventory, alert };
        }
      );

      this.lastResult = {
        product: result.product,
        inventory: result.inventory,
      };

      this.lastAlert = result.alert;
      return true;
    } catch (error) {
      this.lastError = error.message;
      return false;
    }
  }

  // 6. Validate information before saving.
  validateSubmittedData() {
    const details = parseData(this.pendingData);

    if (!details) {
      this.lastError =
        "Provide a valid JSON object as a string.";
      return false;
    }

    if (
      this.selectedTask !== "NEW" &&
      this.selectedTask !== "UPDATE"
    ) {
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
        this.lastError =
          "A valid product ID and name are required.";
        return false;
      }

      if (
        typeof details.inventoryId !== "string" ||
        !details.inventoryId.trim()
      ) {
        this.lastError = "Inventory ID is required.";
        return false;
      }

      if (!hasOwn(details, "quantityOnHand")) {
        this.lastError = "Initial quantity is required.";
        return false;
      }
    } else {
      if (!this.selectedProductId) {
        this.lastError =
          "Select a product before updating it.";
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
        ![...PRODUCT_FIELDS, ...INVENTORY_FIELDS].some(
          (field) => hasOwn(details, field)
        )
      ) {
        this.lastError =
          "Provide at least one product or inventory change.";
        return false;
      }

      if (
        hasOwn(details, "productName") &&
        (
          typeof details.productName !== "string" ||
          !details.productName.trim()
        )
      ) {
        this.lastError = "Product name cannot be blank.";
        return false;
      }
    }

    for (const field of ["quantityOnHand", "reorderLevel"]) {
      if (
        hasOwn(details, field) &&
        (
          !Number.isSafeInteger(details[field]) ||
          details[field] < 0
        )
      ) {
        this.lastError =
          `${field} must be a non-negative integer.`;
        return false;
      }
    }

    if (
      hasOwn(details, "expiryDate") &&
      !validDate(details.expiryDate)
    ) {
      this.lastError =
        "Expiry date must be a valid YYYY-MM-DD date or null.";
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
      (
        typeof details.supplierId !== "string" ||
        !details.supplierId.trim()
      )
    ) {
      this.lastError =
        "Supplier ID must be a non-empty string or null.";
      return false;
    }

    this.lastError = null;
    return true;
  }

  // 7. Validate corrected information.
  revalidateCorrectedData() {
    return this.validateSubmittedData();
  }

  // Internal helper: create, refresh, or resolve a restock alert.
  async _tryGenerateAlert(inventory, { transaction } = {}) {
    const product = await Product.findByPk(inventory.productId, {
      include: [
        { model: Supplier, as: "supplier" },
      ],
      transaction,
    });

    if (!product) {
      throw new Error(
        "Product not found while evaluating restock alert."
      );
    }

    const stockStatus = inventory.evaluateInventoryStatus();
    const expiryStatus = inventory.evaluateExpiryConditions();

    const daysLeft = inventory.expiryDate
      ? daysBetween(today(), inventory.expiryDate)
      : null;

    const leadTime = product.supplier?.leadTimeDays;

    const hasLeadTime =
      Number.isSafeInteger(leadTime) &&
      leadTime >= 0;

    const expiryRisk =
      expiryStatus === "EXPIRED" ||
      expiryStatus === "NEAR_EXPIRY" ||
      (
        daysLeft !== null &&
        hasLeadTime &&
        daysLeft <= leadTime
      );

    // Resolve pending alerts if replenishment is no longer needed.
    if (stockStatus === "IN_STOCK" && !expiryRisk) {
      await RestockAlert.update(
        { alertStatus: "RESOLVED" },
        {
          where: {
            inventoryId: inventory.inventoryId,
            alertStatus: "PENDING",
          },
          transaction,
        }
      );

      return null;
    }

    // Find an existing pending alert.
    const existing = await RestockAlert.findOne({
      where: {
        inventoryId: inventory.inventoryId,
        alertStatus: "PENDING",
      },
      transaction,
    });

    if (existing) {
      // NEW: Refresh the existing alert instead of reusing
      // its outdated recommended quantity and message.
      await existing.generateRestockAlert({ transaction });

      // Preserve the existing alertId and avoid duplicates.
      return existing;
    }

    // No pending alert exists, so create a new one.
    const alert = RestockAlert.build({
      alertId: generateId("ALERT"),
      inventoryId: inventory.inventoryId,
    });

    await alert.generateRestockAlert({ transaction });

    return alert;
  }
}

module.exports = InventoryController;
