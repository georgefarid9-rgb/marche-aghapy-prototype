
const http = require("http");
const fs = require("fs");
const path = require("path");

const sequelize = require("./database");
const {
  Product,
  InventoryRecord,
  RestockAlert,
  Supplier,
} = require("./models");

const InventoryController = require("./controllers/InventoryController");
const { today } = require("./utils/dates");

// Reconcile alerts once per UTC day on the first inventory read.
// Concurrent requests share the same reconciliation work.
let reconciledDay = null;
let reconciliation = null;
let databaseQueue = Promise.resolve();

function exclusiveDatabaseWork(work) {
  const result = databaseQueue.then(work);
  databaseQueue = result.catch(() => {});
  return result;
}

async function reconcileAlerts() {
  const day = today();

  if (reconciledDay === day) return;

  if (reconciliation) {
    await reconciliation;
    return reconcileAlerts();
  }

  reconciliation = exclusiveDatabaseWork(() =>
    sequelize.transaction(async (transaction) => {
      const records = await InventoryRecord.findAll({
        transaction,
      });

      const controller = new InventoryController();

      for (const record of records) {
        await controller._tryGenerateAlert(record, {
          transaction,
        });
      }
    })
  );

  try {
    await reconciliation;
    reconciledDay = day;
  } finally {
    reconciliation = null;
  }
}

// Retrieve complete product details.
async function detail(id) {
  const product = await Product.findByPk(id, {
    include: [
      {
        model: InventoryRecord,
        as: "inventoryRecord",
      },
      {
        model: Supplier,
        as: "supplier",
      },
    ],
  });

  if (!product || !product.inventoryRecord) {
    return null;
  }

  const inventory = product.inventoryRecord;

  const alert = await RestockAlert.findOne({
    where: {
      inventoryId: inventory.inventoryId,
      alertStatus: "PENDING",
    },
  });

  return {
    product: product.toJSON(),
    inventory: inventory.toJSON(),
    stockStatus: inventory.evaluateInventoryStatus(),
    expiryStatus: inventory.evaluateExpiryConditions(),
    alert,
  };
}

// Send a JSON response.
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

  res.end(JSON.stringify(data));
}

// Read and validate a JSON request body.
async function body(req) {
  let text = "";

  for await (const chunk of req) {
    text += chunk;

    if (text.length > 32768) {
      throw new Error("Request is too large.");
    }
  }

  try {
    const value = JSON.parse(text);

    if (
      !value ||
      Array.isArray(value) ||
      typeof value !== "object"
    ) {
      throw new Error();
    }

    return value;
  } catch {
    throw new Error("Provide a valid JSON object.");
  }
}

// Convert controller errors into HTTP status codes.
function errorStatus(message) {
  if (/not found/i.test(message)) {
    return 404;
  }

  if (
    /already exists|already in use|same as the existing/i.test(
      message
    )
  ) {
    return 409;
  }

  if (
    /foreign.key|ON UPDATE CASCADE|database migration/i.test(
      message
    )
  ) {
    return 409;
  }

  if (
    /required|invalid|must|cannot|provide|does not exist|enter|select|empty|blank/i.test(
      message
    )
  ) {
    return 400;
  }

  return 500;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    // API requests.
    if (url.pathname.startsWith("/api/")) {

      // GET: List all inventory records.
      if (
        req.method === "GET" &&
        url.pathname === "/api/inventory"
      ) {
        await reconcileAlerts();

        const records =
          await new InventoryController().retrieveInventory();

        const results = records
          .filter((record) => record.product)
          .map((record) => ({
            productId: record.productId,
            productName: record.product.productName,
            category: record.product.category,
            inventoryId: record.inventoryId,
            quantityOnHand: record.quantityOnHand,
            reorderLevel: record.reorderLevel,
            expiryDate: record.expiryDate,
            stockStatus: record.evaluateInventoryStatus(),
            expiryStatus: record.evaluateExpiryConditions(),
          }));

        return send(res, 200, results);
      }

      // GET: List suppliers.
      if (
        req.method === "GET" &&
        url.pathname === "/api/suppliers"
      ) {
        const suppliers = await Supplier.findAll({
          attributes: ["supplierId", "supplierName"],
          order: [["supplierName", "ASC"]],
        });

        return send(res, 200, suppliers);
      }

      // NEW: Correct an existing Product ID.
      //
      // PUT /api/inventory/PROD-001/correct-id
      //
      // Request:
      // {
      //   "newProductId": "PROD-005"
      // }
      //
      // The controller checks database relationships
      // before updating the primary key.
      const correctionMatch = url.pathname.match(
        /^\/api\/inventory\/([^/]+)\/correct-id$/
      );

      if (
        req.method === "PUT" &&
        correctionMatch
      ) {
        let data;

        try {
          data = await body(req);
        } catch (error) {
          return send(res, 400, {
            error: error.message,
          });
        }

        const oldProductId = decodeURIComponent(
          correctionMatch[1]
        );

        if (
          typeof data.newProductId !== "string" ||
          !data.newProductId.trim()
        ) {
          return send(res, 400, {
            error: "Enter a valid new Product ID.",
          });
        }

        const controller = new InventoryController();
        controller.selectedProductId = oldProductId;

        const success = await exclusiveDatabaseWork(
          () =>
            controller.correctProductId(
              data.newProductId
            )
        );

        if (!success) {
          const message =
            controller.lastError ||
            "Unable to correct Product ID.";

          const status = errorStatus(message);

          return send(res, status, {
            error:
              status === 500
                ? "Unable to correct Product ID. Please try again."
                : message,
          });
        }

        // The controller now stores the corrected ID.
        const updatedProductId =
          controller.selectedProductId;

        const updatedDetails = await detail(
          updatedProductId
        );

        if (!updatedDetails) {
          return send(res, 500, {
            error:
              "Product ID was updated, but the updated details could not be loaded. Refresh the inventory list.",
          });
        }

        return send(res, 200, {
          ...updatedDetails,
          message: "Product ID corrected successfully.",
          oldProductId,
          newProductId: updatedProductId,
        });
      }

      // Existing product-specific routes.
      const match = url.pathname.match(
        /^\/api\/inventory\/([^/]+)$/
      );

      // GET: Retrieve one product.
      if (
        req.method === "GET" &&
        match
      ) {
        await reconcileAlerts();

        const productId = decodeURIComponent(
          match[1]
        );

        const result = await detail(productId);

        return result
          ? send(res, 200, result)
          : send(res, 404, {
              error:
                "Product or inventory record not found.",
            });
      }

      // POST: Create a product.
      // PUT: Update product and inventory information.
      if (
        (req.method === "POST" &&
          url.pathname === "/api/inventory") ||
        (req.method === "PUT" && match)
      ) {
        let data;

        try {
          data = await body(req);
        } catch (error) {
          return send(res, 400, {
            error: error.message,
          });
        }

        const controller = new InventoryController();
        const isNew = req.method === "POST";

        if (!isNew) {
          controller.selectedProductId =
            decodeURIComponent(match[1]);
        }

        const success = await exclusiveDatabaseWork(
          () =>
            isNew
              ? controller.submitNewProduct(
                  JSON.stringify(data)
                )
              : controller.submitUpdates(
                  JSON.stringify(data)
                )
        );

        if (!success) {
          const message =
            controller.lastError ||
            "Unable to save.";

          const status = errorStatus(message);

          return send(res, status, {
            error:
              status === 500
                ? "Unable to save inventory. Please try again."
                : message,
          });
        }

        const productId = isNew
          ? data.productId
          : controller.selectedProductId;

        const result = await detail(productId);

        return send(
          res,
          isNew ? 201 : 200,
          result
        );
      }

      return send(res, 404, {
        error: "Endpoint not found.",
      });
    }

    // Serve frontend files.
    if (req.method !== "GET") {
      return send(res, 405, {
        error: "Method not allowed.",
      });
    }

    const files = {
      "/": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
    };

    if (!files[url.pathname]) {
      return send(res, 404, {
        error: "Page not found.",
      });
    }

    const file = files[url.pathname];

    const contentType = file.endsWith(".html")
      ? "text/html; charset=utf-8"
      : file.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8";

    res.writeHead(200, {
      "Content-Type": contentType,
    });

    fs.createReadStream(
      path.join(
        __dirname,
        "..",
        "public",
        file
      )
    ).pipe(res);

  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      send(res, 500, {
        error:
          "Unable to load inventory. Please try again.",
      });
    } else {
      res.end();
    }
  }
});

// Start the application.
if (require.main === module) {
  const port = Number(
    process.env.PORT || 3000
  );

  server.listen(
    port,
    "127.0.0.1",
    () => {
      console.log(
        `Inventory available at http://localhost:${port}`
      );
    }
  );
}

module.exports = {
  server,
  detail,
};
