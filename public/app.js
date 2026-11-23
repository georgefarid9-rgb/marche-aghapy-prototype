
const app = document.querySelector("#app");

let records = [];
let suppliers = [];
let page = 1;
let query = "";
let category = "";
let selected = null;

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const label = (value) => ({
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  NO_EXPIRY_DATE: "No expiry date",
  NOT_EXPIRING_SOON: "Not expiring soon",
  NEAR_EXPIRY: "Near expiry",
  EXPIRED: "Expired",
})[value] || value;

const badge = (value) =>
  `<span class="badge ${esc(value)}">${esc(label(value))}</span>`;

async function api(url, options = {}) {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Check that the application is running, then retry."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an unexpected response. Please retry."
    );
  }

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

function shell(title, subtitle, content) {
  app.innerHTML = `
    <div class="crumb">
      Back Office / Products &amp; Inventory / ${esc(title)}
    </div>

    <div class="heading">
      <div>
        <h1>${esc(title)}</h1>
        <p class="subtitle">${esc(subtitle)}</p>
      </div>
    </div>

    ${content}
  `;
}

function errorPage(error) {
  shell(
    "Inventory",
    "Manage your products and stock.",
    `
      <div class="notice error" role="alert">
        ${esc(error.message)}
      </div>

      <button id="retry">
        Retry loading inventory
      </button>
    `
  );

  document.querySelector("#retry").onclick = load;
}

async function load() {
  shell(
    "Inventory",
    "Search products and update stock.",
    '<div class="card">Loading inventory…</div>'
  );

  try {
    [records, suppliers] = await Promise.all([
      api("/api/inventory"),
      api("/api/suppliers"),
    ]);

    list();
  } catch (error) {
    errorPage(error);
  }
}

function list() {
  const categories = [
    ...new Set(records.map((record) => record.category)),
  ].sort();

  const filtered = records.filter(
    (record) =>
      (!category || record.category === category) &&
      [
        record.productName,
        record.productId,
        record.category,
      ].some((value) =>
        String(value)
          .toLowerCase()
          .includes(query.toLowerCase())
      )
  );

  const pages = Math.max(
    1,
    Math.ceil(filtered.length / 10)
  );

  page = Math.min(page, pages);

  const rows = filtered
    .slice((page - 1) * 10, page * 10)
    .map(
      (record) => `
        <tr>
          <td>
            <strong>${esc(record.productName)}</strong>
            <br>
            <span class="muted">
              ${esc(record.productId)}
            </span>
          </td>

          <td>${esc(record.category)}</td>
          <td>${esc(record.quantityOnHand)}</td>
          <td>${esc(record.reorderLevel)}</td>

          <td>
            ${esc(record.expiryDate || "—")}

            ${
              ["EXPIRED", "NEAR_EXPIRY"].includes(
                record.expiryStatus
              )
                ? `
                  <span class="expiry">
                    ${badge(record.expiryStatus)}
                  </span>
                `
                : ""
            }
          </td>

          <td>${badge(record.stockStatus)}</td>

          <td>
            <button data-id="${esc(record.productId)}">
              View
            </button>
          </td>
        </tr>
      `
    )
    .join("");

  shell(
    "Inventory",
    "Search products and update stock.",
    `
      <div class="card">
        <div class="toolbar">
          <input
            id="search"
            aria-label="Search products"
            placeholder="Search name, ID or category"
            value="${esc(query)}"
          >

          <select
            id="category"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>

            ${categories
              .map(
                (item) => `
                  <option
                    value="${esc(item)}"
                    ${item === category ? "selected" : ""}
                  >
                    ${esc(item)}
                  </option>
                `
              )
              .join("")}
          </select>

          <button class="primary" id="add">
            + Add Product
          </button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Reorder Lvl</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>${rows}</tbody>
          </table>
        </div>

        ${
          filtered.length
            ? ""
            : `
              <div class="empty">
                ${
                  records.length
                    ? "No products match your search or filter."
                    : "No inventory yet. Add a product to get started."
                }
              </div>
            `
        }

        <div class="pagination">
          <button
            id="prev"
            ${page === 1 ? "disabled" : ""}
          >
            Previous
          </button>

          <span>
            Page ${page} of ${pages}
            · ${filtered.length} product(s)
          </span>

          <button
            id="next"
            ${page === pages ? "disabled" : ""}
          >
            Next
          </button>
        </div>
      </div>
    `
  );

  document.querySelector("#search").oninput = (event) => {
    query = event.target.value;
    page = 1;

    list();

    const input = document.querySelector("#search");

    input.focus();
    input.setSelectionRange(query.length, query.length);
  };

  document.querySelector("#category").onchange = (event) => {
    category = event.target.value;
    page = 1;
    list();
  };

  document.querySelector("#add").onclick = () => form();

  document.querySelector("#prev").onclick = () => {
    page--;
    list();
  };

  document.querySelector("#next").onclick = () => {
    page++;
    list();
  };

  document.querySelectorAll("[data-id]").forEach((button) => {
    button.onclick = () => open(button.dataset.id);
  });
}

async function open(id) {
  shell(
    "Product Details",
    "Loading product…",
    ""
  );

  try {
    selected = await api(
      "/api/inventory/" + encodeURIComponent(id)
    );

    details(false);
  } catch (error) {
    errorPage(error);
  }
}

function detailFields(fields) {
  return (
    '<dl class="details">' +
    fields
      .map(
        ([key, value, html]) => `
          <div>
            <dt>${esc(key)}</dt>
            <dd>${html ? value : esc(value)}</dd>
          </div>
        `
      )
      .join("") +
    "</dl>"
  );
}

// Show inventory health for every product,
// including products without active alerts.
function inventoryCheck(
  inventory,
  stockStatus,
  expiryStatus,
  alert
) {
  const lowStock = [
    "LOW_STOCK",
    "OUT_OF_STOCK",
  ].includes(stockStatus);

  const expiryRisk = [
    "NEAR_EXPIRY",
    "EXPIRED",
  ].includes(expiryStatus);

  const needsAttention =
    lowStock || expiryRisk || Boolean(alert);

  let daysRemaining = null;

  if (inventory.expiryDate) {
    const currentDate = new Date()
      .toISOString()
      .slice(0, 10);

    const start = Date.parse(
      `${currentDate}T00:00:00Z`
    );

    const end = Date.parse(
      `${inventory.expiryDate}T00:00:00Z`
    );

    if (Number.isFinite(end)) {
      daysRemaining = Math.round(
        (end - start) / 86400000
      );
    }
  }

  let expiryExplanation =
    "No expiry date recorded.";

  if (inventory.expiryDate) {
    if (expiryStatus === "EXPIRED") {
      expiryExplanation =
        "The expiry date has passed.";
    } else if (expiryStatus === "NEAR_EXPIRY") {
      expiryExplanation =
        daysRemaining === null
          ? "This product is approaching expiry."
          : `Expires in ${daysRemaining} day(s).`;
    } else {
      expiryExplanation =
        "The product is not approaching expiry.";
    }
  }

  const actions = [];

  if (lowStock) {
    actions.push(
      "Review the stock level and arrange replenishment if needed."
    );
  }

  if (expiryStatus === "NEAR_EXPIRY") {
    actions.push(
      "Check the expiring items. Prioritize selling or rotating this stock before its expiry date."
    );
  }

  if (expiryStatus === "EXPIRED") {
    actions.push(
      "Inspect the affected stock and remove expired products from sale."
    );
  }

  if (!actions.length && alert) {
    actions.push(
      "Review the pending alert and confirm whether action is still required."
    );
  }

  if (!actions.length) {
    actions.push(
      "No action is required based on the current stock and expiry conditions."
    );
  }

  const suggestedQuantity = Number(
    alert?.recommendedQuantity
  );

  const showReorderQuantity =
    lowStock &&
    alert &&
    Number.isFinite(suggestedQuantity) &&
    suggestedQuantity > 0;

  return `
    <section
      class="card inventory-check ${
        needsAttention
          ? "needs-review"
          : "healthy"
      }"
      aria-label="Inventory status and recommendations"
    >
      <div class="inventory-check-header">
        <h2>Inventory check</h2>

        <span class="inventory-check-status">
          ${
            needsAttention
              ? "Attention needed"
              : "No action needed"
          }
        </span>
      </div>

      <p>
        ${
          needsAttention
            ? "This product has an inventory condition that needs reviewing."
            : "This product is currently within its stock and expiry conditions."
        }
      </p>

      <div class="inventory-check-grid">
        <div class="inventory-check-item">
          <strong>Stock level</strong>

          <div>${badge(stockStatus)}</div>

          <p>
            <strong>
              ${esc(inventory.quantityOnHand)}
            </strong>
            units available
          </p>

          <p>
            Reorder threshold:
            <strong>
              ${esc(inventory.reorderLevel)}
            </strong>
            units
          </p>
        </div>

        <div class="inventory-check-item">
          <strong>Expiry</strong>

          <div>${badge(expiryStatus)}</div>

          <p>${esc(expiryExplanation)}</p>

          <p>
            Expiry date:
            <strong>
              ${esc(inventory.expiryDate || "Not recorded")}
            </strong>
          </p>
        </div>
      </div>

      <div class="inventory-check-action">
        <strong>
          ${
            needsAttention
              ? "What to do next"
              : "Current assessment"
          }
        </strong>

        ${actions
          .map(
            (action) => `<p>${esc(action)}</p>`
          )
          .join("")}

        ${
          showReorderQuantity
            ? `
              <p>
                <strong>
                  System suggested reorder:
                </strong>
                ${esc(suggestedQuantity)} units.
                Review the quantity before ordering.
              </p>
            `
            : ""
        }
      </div>

      ${
        alert
          ? `
            <p class="inventory-check-footnote">
              Alert status: Pending
            </p>
          `
          : ""
      }
    </section>
  `;
}

// Product Details and Updated Record screens.
function details(saved = false) {
  const {
    product: p,
    inventory: i,
    stockStatus: s,
    expiryStatus: x,
    alert: a,
  } = selected;

  const productInfo = detailFields([
    ["Product ID", p.productId],
    ["Category", p.category],
    ["Description", p.description || "—"],
    [
      "Supplier",
      p.supplier?.supplierName || "Not assigned",
    ],
  ]);

  const inventoryInfo = detailFields([
    ["Inventory ID", i.inventoryId],
    ["Quantity on hand", i.quantityOnHand],
    ["Reorder level", i.reorderLevel],
    [
      "Expiry date",
      i.expiryDate || "Not recorded",
    ],
    ["Stock status", badge(s), true],
    ["Expiry status", badge(x), true],
    [
      "Last updated",
      i.lastUpdated
        ? new Date(i.lastUpdated).toLocaleString()
        : "—",
    ],
  ]);

  shell(
    saved
      ? "Updated Record"
      : "Product Details",
    saved
      ? "Review the saved information."
      : "Review product and inventory information.",
    `
      ${
        saved
          ? `
            <div class="notice" role="status">
              Changes saved successfully.
            </div>
          `
          : ""
      }

      <section class="card">
        <h2>
          Product details · ${esc(p.productName)}
        </h2>

        ${productInfo}
      </section>

      <section class="card">
        <h2>Inventory information</h2>

        ${inventoryInfo}
      </section>

      ${inventoryCheck(i, s, x, a)}

      <div class="actions">
        <button id="back">
          Back to Inventory
        </button>

        ${
          saved
            ? `
              <button
                id="done"
                class="primary"
              >
                Done Reviewing
              </button>
            `
            : `
              <button
                id="edit"
                class="primary"
              >
                Edit
              </button>
            `
        }
      </div>
    `
  );

  document.querySelector("#back").onclick = load;

  if (saved) {
    document.querySelector("#done").onclick = () => {
      query = "";
      category = "";
      page = 1;

      load();
    };
  } else {
    document.querySelector("#edit").onclick = () =>
      form(selected);
  }
}

// Create or edit product and inventory data.
// Both Product ID and Inventory ID are editable.
function form(record) {
  const isNew = !record;

  const p = record?.product || {};
  const i = record?.inventory || {};

  const fields = [
    [
      "productId",
      "Product ID",
      "text",
      p.productId,
    ],
    [
      "inventoryId",
      "Inventory ID",
      "text",
      i.inventoryId,
    ],
    [
      "productName",
      "Product name",
      "text",
      p.productName,
    ],
    [
      "category",
      "Category",
      "text",
      p.category,
    ],
    [
      "description",
      "Description",
      "text",
      p.description,
    ],
    [
      "supplierId",
      "Supplier",
      "select",
      p.supplierId,
    ],
    [
      "quantityOnHand",
      isNew
        ? "Initial quantity"
        : "Quantity on hand",
      "number",
      i.quantityOnHand,
    ],
    [
      "reorderLevel",
      "Reorder level",
      "number",
      i.reorderLevel,
    ],
    [
      "expiryDate",
      "Expiry date",
      "date",
      i.expiryDate,
    ],
  ];

  shell(
    isNew ? "Add Product" : "Edit",
    isNew
      ? "Record a product and its initial stock."
      : `Update product and inventory information for ${p.productName}.`,
    `
      <div class="card">
        <div id="summary"></div>

        <form id="form" novalidate>
          <div class="grid">
            ${fields
              .map(
                ([
                  name,
                  title,
                  type,
                  value,
                ]) => `
                  <div class="field">
                    <label for="${name}">
                      ${esc(title)}
                      ${
                        [
                          "productId",
                          "inventoryId",
                          "productName",
                          "category",
                          "quantityOnHand",
                          "reorderLevel",
                        ].includes(name)
                          ? " *"
                          : ""
                      }
                    </label>

                    ${
                      type === "select"
                        ? `
                          <select
                            id="${name}"
                            name="${name}"
                          >
                            <option value="">
                              Not assigned
                            </option>

                            ${suppliers
                              .map(
                                (supplier) => `
                                  <option
                                    value="${esc(supplier.supplierId)}"
                                    ${
                                      supplier.supplierId === value
                                        ? "selected"
                                        : ""
                                    }
                                  >
                                    ${esc(supplier.supplierName)}
                                  </option>
                                `
                              )
                              .join("")}
                          </select>
                        `
                        : `
                          <input
                            id="${name}"
                            name="${name}"
                            type="${type}"
                            value="${esc(value)}"
                            ${
                              type === "number"
                                ? 'min="0" step="1" inputmode="numeric"'
                                : ""
                            }
                          >
                        `
                    }

                    <div
                      class="field-error"
                      id="error-${name}"
                    ></div>
                  </div>
                `
              )
              .join("")}
          </div>

          <div class="actions">
            <button
              type="button"
              id="cancel"
            >
              Cancel
            </button>

            <button
              class="primary"
              type="submit"
            >
              ${
                isNew
                  ? "Create Product"
                  : "Save Changes"
              }
            </button>
          </div>
        </form>
      </div>
    `
  );

  document.querySelector("#cancel").onclick = () =>
    isNew
      ? load()
      : details(false);

  document.querySelector("#form").onsubmit =
    async (event) => {
      event.preventDefault();

      const formElement = event.currentTarget;

      const data = Object.fromEntries(
        new FormData(formElement)
      );

      const errors = {};

      // Validate required fields.
      for (const name of [
        "productId",
        "inventoryId",
        "productName",
        "category",
      ]) {
        data[name] = data[name].trim();

        if (!data[name]) {
          errors[name] = "This field is required.";
        }
      }

      // Validate inventory numbers.
      for (const name of [
        "quantityOnHand",
        "reorderLevel",
      ]) {
        if (
          !/^\d+$/.test(data[name]) ||
          !Number.isSafeInteger(Number(data[name]))
        ) {
          errors[name] =
            "Enter a whole number of zero or greater.";
        } else {
          data[name] = Number(data[name]);
        }
      }

      data.expiryDate = data.expiryDate || null;
      data.description = data.description || null;
      data.supplierId = data.supplierId || null;

      // Display validation errors.
      for (const [name] of fields) {
        const element = formElement.elements[name];

        const message = document.querySelector(
          "#error-" + name
        );

        element.classList.toggle(
          "invalid",
          Boolean(errors[name])
        );

        element.setAttribute(
          "aria-invalid",
          String(Boolean(errors[name]))
        );

        element.setAttribute(
          "aria-describedby",
          "error-" + name
        );

        message.textContent = errors[name] || "";
      }

      const summary =
        document.querySelector("#summary");

      if (Object.keys(errors).length) {
        summary.innerHTML = `
          <div
            class="notice error"
            role="alert"
          >
            Please correct the highlighted fields
            before saving.
          </div>
        `;

        formElement.elements[
          Object.keys(errors)[0]
        ].focus();

        return;
      }

      // Confirm changes to either primary key.
      if (
        !isNew &&
        (
          data.productId !== p.productId ||
          data.inventoryId !== i.inventoryId
        )
      ) {
        const confirmed = window.confirm(
          "Confirm identifier changes?\n\n" +
          `Product ID: ${p.productId} → ${data.productId}\n` +
          `Inventory ID: ${i.inventoryId} → ${data.inventoryId}\n\n` +
          "Other changes on this form will be saved at the same time."
        );

        if (!confirmed) {
          return;
        }
      }

      const button = formElement.querySelector(
        '[type="submit"]'
      );

      button.disabled = true;
      summary.innerHTML = "";

      try {
        const endpoint = isNew
          ? "/api/inventory"
          : "/api/inventory/" +
            encodeURIComponent(p.productId);

        selected = await api(endpoint, {
          method: isNew ? "POST" : "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        details(true);
      } catch (error) {
        summary.innerHTML = `
          <div
            class="notice error"
            role="alert"
          >
            ${esc(error.message)}
          </div>
        `;

        const field =
          /Product ID already exists/i.test(error.message)
            ? "productId"
            : /Inventory ID already exists/i.test(
                error.message
              )
              ? "inventoryId"
              : /Supplier does not exist/i.test(
                  error.message
                )
                ? "supplierId"
                : null;

        if (field && formElement.elements[field]) {
          formElement.elements[field].classList.add(
            "invalid"
          );

          formElement.elements[field].setAttribute(
            "aria-invalid",
            "true"
          );

          document.querySelector(
            "#error-" + field
          ).textContent = error.message;

          formElement.elements[field].focus();
        }

        button.disabled = false;
      }
    };
}

// Sidebar navigation.
document
  .querySelector("nav a")
  .addEventListener("click", (event) => {
    event.preventDefault();

    query = "";
    category = "";
    page = 1;

    load();
  });

// Load the application.
load();
