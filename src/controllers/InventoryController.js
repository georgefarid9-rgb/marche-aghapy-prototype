
const sequelize = require("../database");
const { QueryTypes } = require("sequelize");

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
  return Object.prototype.hasOwnProperty.call(
    object,
    field
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

// Check the actual SQLite foreign-key relationships before
// changing either primary key.
//
// A successful Sequelize association declaration does not
// necessarily mean an older database has the same constraints.
async function assertSafeKeyChange(
  parentTable,
  keyColumn,
  oldId,
  requiredChild,
  transaction
) {
  const select = {
    type: QueryTypes.SELECT,
    transaction,
  };

  const setting = await sequelize.query(
    "PRAGMA foreign_keys",
    select
  );

  if (Number(setting[0]?.foreign_keys) !== 1) {
    throw new Error(
      "ID correction requires SQLite foreign-key enforcement."
    );
  }

  const existingViolations = await sequelize.query(
    "PRAGMA foreign_key_check",
    select
  );

  if (existingViolations.length) {
    throw new Error(
      "Database already has foreign-key violations. Correct them first."
    );
  }

  const tables = await sequelize.query(
    "SELECT name FROM sqlite_master " +
      "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    select
  );

  let requiredRelationship = false;

  for (const { name } of tables) {
    if (name === parentTable) continue;

    const table = quoteIdentifier(name);

    const keys = await sequelize.query(
      `PRAGMA foreign_key_list(${table})`,
      select
    );

    const references = keys.filter(
      (key) =>
        key.table === parentTable &&
        (
          key.to === keyColumn ||
          key.to === null ||
          key.to === ""
        )
    );

    if (
      name === requiredChild &&
      references.some(
        (key) => key.from === keyColumn
      )
    ) {
      requiredRelationship = true;
    }

    // All declared relationships referencing this key
    // must support cascading updates.
    for (const key of references) {
      if (
        String(key.on_update).toUpperCase() !==
        "CASCADE"
      ) {
        throw new Error(
          `Cannot correct ${keyColumn}: ` +
          `${name}.${key.from} must use ON UPDATE CASCADE. ` +
          "A database migration is required."
        );
      }
    }

    // Detect records that contain the old identifier
    // but do not have a declared cascading foreign key.
    const columns = await sequelize.query(
      `PRAGMA table_info(${table})`,
      select
    );

    const hasKeyColumn = columns.some(
      (column) => column.name === keyColumn
    );

    const hasDeclaredReference =
      references.some(
        (key) => key.from === keyColumn
      );

    if (
      hasKeyColumn &&
      !hasDeclaredReference
    ) {
      const rows = await sequelize.query(
        `SELECT 1 FROM ${table} ` +
          `WHERE ${quoteIdentifier(keyColumn)} = :oldId LIMIT 1`,
        {
          ...select,
          replacements: { oldId },
        }
      );

      if (rows.length) {
        throw new Error(
          `Cannot correct ${keyColumn}: ` +
          `${name}.${keyColumn} contains related data ` +
          "without a cascading foreign key."
        );
      }
    }
  }

  if (!requiredRelationship) {
    throw new Error(
      `Cannot correct ${keyColumn}: ` +
      `missing ${requiredChild} cascading relationship. ` +
      "A database migration is required."
    );
  }
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
        {
          model: Product,
          as: "product",
        },
      ],
      order: [["inventoryId", "ASC"]],
    });
  }

  // 2. Execute the selected maintenance task.
  async executeSelectedSubflow() {
    if (this.selectedTask === "NEW") {
      await this.submitNewProduct(
        this.pendingData
      );
    } else if (this.selectedTask === "UPDATE") {
      await this.submitUpdates(
        this.pendingData
      );
    } else {
      this.lastError =
        "Select an inventory maintenance task first.";
    }
  }

  // 3. Create a new product and inventory record
  // together in one transaction.
  async submitNewProduct(data) {
    this.selectedTask = "NEW";
    this.pendingData = data;

    this.lastError = null;
    this.lastWarning = null;
    this.lastResult = null;
    this.lastAlert = null;

    if (!this.validateSubmittedData()) {
      return false;
    }

    const details = parseData(data);

    try {
      const result = await sequelize.transaction(
        async (transaction) => {
          const existingProduct =
            await Product.findByPk(
              details.productId,
              { transaction }
            );

          if (existingProduct) {
            throw new Error(
              "Product ID already exists."
            );
          }

          const existingInventory =
            await InventoryRecord.findByPk(
              details.inventoryId,
              { transaction }
            );

          if (existingInventory) {
            throw new Error(
              "Inventory ID already exists."
            );
          }

          if (
            details.supplierId &&
            !(await Supplier.findByPk(
              details.supplierId,
              { transaction }
            ))
          ) {
            throw new Error(
              "Supplier does not exist."
            );
          }

          const product = Product.build({
            productId: details.productId,
            productName: details.productName,
            description:
              details.description ?? null,
            category: details.category,
            supplierId:
              details.supplierId ?? null,
          });

          await product.recordNewProduct(
            data,
            { transaction }
          );

          const inventory =
            InventoryRecord.build();

          await inventory.createInventoryRecord(
            JSON.stringify({
              inventoryId: details.inventoryId,
              productId: details.productId,
              quantityOnHand:
                details.quantityOnHand,
              reorderLevel:
                details.reorderLevel ?? 0,
              expiryDate:
                details.expiryDate ?? null,
            }),
            { transaction }
          );

          const alert =
            await this._tryGenerateAlert(
              inventory,
              { transaction }
            );

          return {
            product,
            inventory,
            alert,
          };
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
      throw new Error(
        "Select a product first."
      );
    }

    return Product.findByPk(
      this.selectedProductId,
      {
        include: [
          {
            model: InventoryRecord,
            as: "inventoryRecord",
          },
        ],
        ...options,
      }
    );
  }

  // 5. Save product and inventory changes.
  //
  // This now supports changing both IDs together,
  // as well as all ordinary editable fields.
  async submitUpdates(data) {
    this.selectedTask = "UPDATE";
    this.pendingData = data;

    this.lastError = null;
    this.lastWarning = null;
    this.lastResult = null;
    this.lastAlert = null;

    if (!this.validateSubmittedData()) {
      return false;
    }

    const details = parseData(data);

    try {
      const result = await sequelize.transaction(
        async (transaction) => {
          const original =
            await this.retrieveSelectedProduct({
              transaction,
            });

          if (
            !original ||
            !original.inventoryRecord
          ) {
            throw new Error(
              "Product or inventory record was not found."
            );
          }

          const originalInventory =
            original.inventoryRecord;

          const oldProductId =
            original.productId;

          const oldInventoryId =
            originalInventory.inventoryId;

          const newProductId =
            hasOwn(details, "productId")
              ? details.productId.trim()
              : oldProductId;

          const newInventoryId =
            hasOwn(details, "inventoryId")
              ? details.inventoryId.trim()
              : oldInventoryId;

          // Validate the proposed product information.
          if (
            !original.validateProductInformation(
              data
            )
          ) {
            throw new Error(
              "Invalid product information."
            );
          }

          // Check the selected supplier.
          if (
            details.supplierId &&
            !(await Supplier.findByPk(
              details.supplierId,
              { transaction }
            ))
          ) {
            throw new Error(
              "Supplier does not exist."
            );
          }

          // Check a proposed Product ID correction.
          if (newProductId !== oldProductId) {
            const duplicateProduct =
              await Product.findByPk(
                newProductId,
                { transaction }
              );

            if (duplicateProduct) {
              throw new Error(
                "Product ID already exists."
              );
            }

            await assertSafeKeyChange(
              "products",
              "productId",
              oldProductId,
              "inventory_records",
              transaction
            );
          }

          // Check a proposed Inventory ID correction.
          if (newInventoryId !== oldInventoryId) {
            const duplicateInventory =
              await InventoryRecord.findByPk(
                newInventoryId,
                { transaction }
              );

            if (duplicateInventory) {
              throw new Error(
                "Inventory ID already exists."
              );
            }

            await assertSafeKeyChange(
              "inventory_records",
              "inventoryId",
              oldInventoryId,
              "restock_alerts",
              transaction
            );
          }

          // Update the Product primary key first.
          // SQLite cascades the change into referencing
          // tables when their constraints support it.
          if (newProductId !== oldProductId) {
            await sequelize.query(
              'UPDATE "products" ' +
              'SET "productId" = :newId ' +
              'WHERE "productId" = :oldId',
              {
                replacements: {
                  newId: newProductId,
                  oldId: oldProductId,
                },
                transaction,
              }
            );
          }

          // Update the Inventory primary key.
          // Restock alerts and reports must follow
          // this change through their foreign keys.
          if (newInventoryId !== oldInventoryId) {
            await sequelize.query(
              'UPDATE "inventory_records" ' +
              'SET "inventoryId" = :newId ' +
              'WHERE "inventoryId" = :oldId',
              {
                replacements: {
                  newId: newInventoryId,
                  oldId: oldInventoryId,
                },
                transaction,
              }
            );
          }

          // Reload using the corrected IDs.
          // This is important because the original
          // Sequelize instances used the old keys.
          const product =
            await Product.findByPk(
              newProductId,
              {
                include: [
                  {
                    model: InventoryRecord,
                    as: "inventoryRecord",
                  },
                ],
                transaction,
              }
            );

          if (
            !product ||
            !product.inventoryRecord ||
            product.inventoryRecord.inventoryId !==
              newInventoryId ||
            product.inventoryRecord.productId !==
              newProductId
          ) {
            throw new Error(
              "ID correction did not preserve the inventory relationship."
            );
          }

          const inventory =
            product.inventoryRecord;

          // Save ordinary product fields separately.
          // We deliberately omit productId because
          // Product.js protects it from ordinary edits.
          const productChanges = {};

          for (const field of PRODUCT_FIELDS) {
            if (hasOwn(details, field)) {
              productChanges[field] = details[field];
            }
          }

          if (
            Object.keys(productChanges).length
          ) {
            await product.updateProductInformation(
              JSON.stringify(productChanges),
              { transaction }
            );
          }

          // Save ordinary inventory fields separately.
          const inventoryChanges = {};

          for (const field of INVENTORY_FIELDS) {
            if (hasOwn(details, field)) {
              inventoryChanges[field] =
                details[field];
            }
          }

          if (
            Object.keys(inventoryChanges).length
          ) {
            await inventory.updateInventoryInformation(
              JSON.stringify(inventoryChanges),
              { transaction }
            );
          }

          // Re-evaluate the stock and expiry conditions.
          const alert =
            await this._tryGenerateAlert(
              inventory,
              { transaction }
            );

          // Verify that the database relationships
          // are still valid before committing.
          const violations =
            await sequelize.query(
              "PRAGMA foreign_key_check",
              {
                type: QueryTypes.SELECT,
                transaction,
              }
            );

          if (violations.length) {
            throw new Error(
              "ID correction would damage database relationships."
            );
          }

          return {
            product,
            inventory,
            alert,
            newProductId,
          };
        }
      );

      // Update the selected ID only after
      // the entire transaction succeeds.
      this.selectedProductId =
        result.newProductId;

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

  // Keep compatibility with the existing
  // Product ID correction API endpoint.
  async correctProductId(newProductId) {
    return this.submitUpdates(
      JSON.stringify({
        productId: newProductId,
      })
    );
  }

  // 6. Validate all submitted information.
  validateSubmittedData() {
    const details = parseData(
      this.pendingData
    );

    if (!details) {
      this.lastError =
        "Provide a valid JSON object as a string.";

      return false;
    }

    if (
      !["NEW", "UPDATE"].includes(
        this.selectedTask
      )
    ) {
      this.lastError =
        "Select NEW or UPDATE as the task.";

      return false;
    }

    if (this.selectedTask === "NEW") {
      const sample = Product.build({
        productId: details.productId,
        productName: details.productName,
        description: details.description,
        category: details.category,
      });

      if (
        !sample.validateProductInformation(
          this.pendingData
        )
      ) {
        this.lastError =
          "A valid product ID, name, and category are required.";

        return false;
      }

      if (
        typeof details.inventoryId !==
          "string" ||
        !details.inventoryId.trim()
      ) {
        this.lastError =
          "Inventory ID is required.";

        return false;
      }

      if (
        !hasOwn(
          details,
          "quantityOnHand"
        )
      ) {
        this.lastError =
          "Initial quantity is required.";

        return false;
      }
    } else {
      if (!this.selectedProductId) {
        this.lastError =
          "Select a product before updating it.";

        return false;
      }

      // ID changes now count as valid update requests.
      const editableFields = [
        ...PRODUCT_FIELDS,
        ...INVENTORY_FIELDS,
        "productId",
        "inventoryId",
      ];

      if (
        !editableFields.some(
          (field) =>
            hasOwn(details, field)
        )
      ) {
        this.lastError =
          "Provide at least one product or inventory change.";

        return false;
      }

      if (
        hasOwn(details, "productName") &&
        (
          typeof details.productName !==
            "string" ||
          !details.productName.trim()
        )
      ) {
        this.lastError =
          "Product name cannot be blank.";

        return false;
      }
    }

    // Validate both identifiers.
    for (const idField of [
      "productId",
      "inventoryId",
    ]) {
      if (
        hasOwn(details, idField) &&
        (
          typeof details[idField] !==
            "string" ||
          !details[idField].trim()
        )
      ) {
        this.lastError =
          `${idField} must be a non-empty string.`;

        return false;
      }
    }

    // Validate stock quantities.
    for (const field of [
      "quantityOnHand",
      "reorderLevel",
    ]) {
      if (
        hasOwn(details, field) &&
        (
          !Number.isSafeInteger(
            details[field]
          ) ||
          details[field] < 0
        )
      ) {
        this.lastError =
          `${field} must be a non-negative integer.`;

        return false;
      }
    }

    // Validate expiry date.
    if (
      hasOwn(details, "expiryDate") &&
      !validDate(details.expiryDate)
    ) {
      this.lastError =
        "Expiry date must be a valid YYYY-MM-DD date or null.";

      return false;
    }

    // Validate product category.
    if (
      hasOwn(details, "category") &&
      (
        typeof details.category !==
          "string" ||
        !details.category.trim()
      )
    ) {
      this.lastError =
        "Category must be a non-empty string.";

      return false;
    }

    // Validate optional description.
    if (
      hasOwn(details, "description") &&
      details.description !== null &&
      typeof details.description !==
        "string"
    ) {
      this.lastError =
        "description must be a string or null.";

      return false;
    }

    // Validate optional supplier ID.
    if (
      hasOwn(details, "supplierId") &&
      details.supplierId !== null &&
      (
        typeof details.supplierId !==
          "string" ||
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

  // Internal helper: create, refresh, or resolve
  // restock alerts after inventory changes.
  async _tryGenerateAlert(
    inventory,
    { transaction } = {}
  ) {
    const product = await Product.findByPk(
      inventory.productId,
      {
        include: [
          {
            model: Supplier,
            as: "supplier",
          },
        ],
        transaction,
      }
    );

    if (!product) {
      throw new Error(
        "Product not found while evaluating restock alert."
      );
    }

    const stockStatus =
      inventory.evaluateInventoryStatus();

    const expiryStatus =
      inventory.evaluateExpiryConditions();

    const daysLeft = inventory.expiryDate
      ? daysBetween(
          today(),
          inventory.expiryDate
        )
      : null;

    const leadTime =
      product.supplier?.leadTimeDays;

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

    // Resolve alerts when they are no longer needed.
    if (
      stockStatus === "IN_STOCK" &&
      !expiryRisk
    ) {
      await RestockAlert.update(
        {
          alertStatus: "RESOLVED",
        },
        {
          where: {
            inventoryId:
              inventory.inventoryId,
            alertStatus: "PENDING",
          },
          transaction,
        }
      );

      return null;
    }

    // Refresh an existing pending alert.
    const existing =
      await RestockAlert.findOne({
        where: {
          inventoryId:
            inventory.inventoryId,
          alertStatus: "PENDING",
        },
        transaction,
      });

    if (existing) {
      await existing.generateRestockAlert({
        transaction,
      });

      return existing;
    }

    // Create a new pending alert.
    const alert = RestockAlert.build({
      alertId: generateId("ALERT"),
      inventoryId:
        inventory.inventoryId,
    });

    await alert.generateRestockAlert({
      transaction,
    });

    return alert;
  }
}

module.exports = InventoryController;
