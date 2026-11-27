// Feature 1 — Products and Inventory.
// Milestone 6 scenario 1 "Update Existing Product Inventory", wireframes 1.1 to 1.5:
//   1.1 #/inventory               inventory list, search, category filter
//   1.2 #/inventory/PROD-002      product details
//   1.3 #/inventory/PROD-002/edit edit inventory form (1.4: validation errors)
//   1.5 #/inventory/PROD-002/saved updated record + restock alert
// Also #/inventory/new (record a new product) and #/inventory/alerts (restock list).
// Every save goes through InventoryPage / InventoryController (/api/inventory).

import {
  api, esc, $, $$, banner, pill, field, formValues, showFormErrors, clearFormErrors, pageHeader,
  busy, toast, dash, fmtDate, fmtDateTime, setStatus, todayText, paginate,
} from "../ui.js";

// "Updated by": the person chosen in "Signed in as" (top bar).
const currentUserName = () => document.querySelector("#signed-in-as")?.selectedOptions[0]?.textContent.split(" — ")[0] || "Bassem";
let lastSave = null; // result shown on wireframe 1.5
let listState = { search: "", category: "", page: 1 };

const searchIcon =
  '<svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export default async function inventory(main, rest = []) {
  const [first, second] = rest;
  if (!first) return showList(main);
  if (first === "search") {
    listState = { search: second || "", category: "", page: 1 };
    return showList(main);
  }
  if (first === "new") return showNew(main);
  if (first === "alerts") return showAlerts(main);
  if (second === "edit") return showEdit(main, first);
  if (second === "saved") return showSaved(main, first);
  return showDetails(main, first);
}

// ----- 1.1 Inventory list -----
async function showList(main) {
  const result = await api("GET", "/inventory");
  const all = result.inventory || [];
  const categories = [...new Set(all.map((r) => r.category).filter(Boolean))].sort();
  const low = all.filter((r) => r.inventoryStatus === "LOW_STOCK").length;
  const out = all.filter((r) => r.inventoryStatus === "OUT_OF_STOCK").length;
  setStatus(`${all.length} products · ${low} low stock · ${out} out of stock`, out ? "warn" : "ok", "1.1");

  main.innerHTML = `
    ${pageHeader("Inventory", "Search existing products and update their stock details.", "", [["Products & Inventory"]])}
    <div class="toolbar">
      <label class="searchbox">${searchIcon}<input type="search" id="search" placeholder="Search by product name, SKU or category" aria-label="Search products" value="${esc(listState.search)}"></label>
      <select id="category" aria-label="Category" style="min-width:190px">
        <option value="">All categories</option>
        ${categories.map((c) => `<option ${c === listState.category ? "selected" : ""}>${esc(c)}</option>`).join("")}
      </select>
      <button id="add" style="min-width:170px">+ Add Product</button>
    </div>
    <div id="rows"></div>`;

  function render() {
    const term = listState.search.toLowerCase();
    const matches = all.filter(
      (r) =>
        (!listState.category || r.category === listState.category) &&
        [r.productName, r.productId, r.category].some((v) => String(v ?? "").toLowerCase().includes(term))
    );
    const { rows, page, pages } = paginate(matches, listState.page);
    listState.page = page;
    $("#rows").innerHTML = `
      ${
        rows.length === 0
          ? `<div class="card"><p class="empty" style="padding:24px">No product matches your search.</p></div>`
          : `<div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Category</th><th>Qty</th><th>Reorder lvl</th><th>Expiry</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr class="clickable" data-id="${esc(r.productId)}">
              <td><strong>${esc(r.productName)}</strong></td><td>${dash(r.category)}</td><td>${esc(r.quantityOnHand)}</td>
              <td>${esc(r.reorderLevel)}</td><td class="nowrap">${fmtDate(r.expiryDate)}</td><td>${pill(r.inventoryStatus)}</td>
              <td><a class="link" href="#/inventory/${encodeURIComponent(r.productId)}/edit" data-edit>Edit</a></td></tr>`
          )
          .join("")}</tbody></table></div>`
      }
      <div class="table-foot"><span>Showing ${rows.length} of ${matches.length} products · click a row or Edit to open a product</span>
        <span class="actions"><button id="prev" ${page <= 1 ? "disabled" : ""}>Prev</button><button id="next" ${page >= pages ? "disabled" : ""}>Next</button></span></div>`;
    $$("tr[data-id]").forEach((row) =>
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-edit]")) return;
        location.hash = `#/inventory/${encodeURIComponent(row.dataset.id)}`;
      })
    );
    $("#prev").addEventListener("click", () => ((listState.page -= 1), render()));
    $("#next").addEventListener("click", () => ((listState.page += 1), render()));
  }

  $("#search").addEventListener("input", (event) => {
    listState.search = event.target.value;
    listState.page = 1;
    render();
  });
  $("#category").addEventListener("change", (event) => {
    listState.category = event.target.value;
    listState.page = 1;
    render();
  });
  $("#add").addEventListener("click", () => (location.hash = "#/inventory/new"));
  render();
}

async function loadProduct(main, productId) {
  const result = await api("GET", `/inventory/${encodeURIComponent(productId)}`);
  if (!result.ok) {
    main.innerHTML = `${pageHeader("Product not found", "", '<a class="button" href="#/inventory">Back to Inventory</a>', [
      ["Products & Inventory", "#/inventory"],
    ])}${banner("error", "Product not found", result.message)}`;
    setStatus("Product not found", "bad");
    return null;
  }
  return result;
}

function productInfoCard(product, supplierName) {
  return `<section class="card"><div class="card-head"><h2>Product information</h2></div><div class="card-body">
    <dl class="details">
      <dt>Product name</dt><dd>${esc(product.productName)}</dd>
      <dt>SKU</dt><dd>${esc(product.productId)}</dd>
      <dt>Category</dt><dd>${dash(product.category)}</dd>
      <dt>Supplier</dt><dd>${dash(supplierName)}</dd>
      <dt>Description</dt><dd>${dash(product.description)}</dd>
    </dl></div></section>`;
}

function inventoryInfoCard(inv, status, updatedBy) {
  return `<section class="card"><div class="card-head"><h2>Inventory information</h2></div><div class="card-body">
    <dl class="details">
      <dt>Quantity on hand</dt><dd>${esc(inv.quantityOnHand)} units</dd>
      <dt>Reorder level</dt><dd>${esc(inv.reorderLevel)} units</dd>
      <dt>Expiry date</dt><dd>${fmtDate(inv.expiryDate)}</dd>
      <dt>Status</dt><dd>${pill(status)}</dd>
      <dt>Last updated</dt><dd>${fmtDateTime(inv.lastUpdated)}</dd>
      ${updatedBy ? `<dt>Updated by</dt><dd>${esc(updatedBy)}</dd>` : ""}
    </dl></div></section>`;
}

// Stock status as InventoryRecord.evaluateInventoryStatus() decides it.
function statusOf(inv) {
  if (inv.quantityOnHand <= 0) return "OUT_OF_STOCK";
  return inv.quantityOnHand <= inv.reorderLevel ? "LOW_STOCK" : "IN_STOCK";
}

// ----- 1.2 Product details -----
async function showDetails(main, productId) {
  const result = await loadProduct(main, productId);
  if (!result) return;
  const p = result.product;
  const inv = p.inventoryRecord;
  setStatus("Viewing product record", "", "1.2");
  main.innerHTML = `
    ${pageHeader(p.productName, `SKU ${p.productId} · ${p.category || "No category"}`, "", [
      ["Products & Inventory", "#/inventory"],
      [p.productName],
    ], pill(statusOf(inv)))}
    <div class="grid-2">${productInfoCard(p, result.supplierName)}${inventoryInfoCard(inv, statusOf(inv))}</div>
    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Restock alerts</h2></div><div class="card-body">
      ${
        result.alerts.length
          ? result.alerts.map((a) => `<p style="margin-bottom:6px">${pill(a.alertStatus)} ${esc(a.reorderInformation)}</p>`).join("")
          : '<p class="muted">No restock alerts for this product.</p>'
      }
    </div></section>
    <div class="form-actions" style="justify-content:space-between;margin-top:20px">
      <a class="button" href="#/inventory">Back to Inventory</a>
      <a class="button primary" href="#/inventory/${encodeURIComponent(p.productId)}/edit">Edit Inventory</a>
    </div>`;
}

// ----- 1.3 Edit inventory form, 1.4 validation errors -----
const REASONS = ["Sold / used", "Received delivery", "Stock count correction", "Damaged / expired"];

async function showEdit(main, productId) {
  const result = await loadProduct(main, productId);
  if (!result) return;
  const p = result.product;
  const inv = p.inventoryRecord;
  setStatus("Editing – unsaved changes", "", "1.3");
  main.innerHTML = `
    ${pageHeader(`Edit Inventory – ${p.productName}`, "Update the stock details. Fields marked * are required.", "", [
      ["Products & Inventory", "#/inventory"],
      [p.productName, `#/inventory/${encodeURIComponent(p.productId)}`],
      ["Edit"],
    ])}
    <div id="errors"></div>
    <section class="card"><div class="card-head"><h2>Stock details</h2></div><div class="card-body">
      <form id="edit-form" novalidate>
        <p class="current">Current: ${esc(inv.quantityOnHand)} units on hand · expires ${fmtDate(inv.expiryDate)} · reorder level ${esc(inv.reorderLevel)}</p>
        <div class="form-grid">
          ${field("quantityOnHand", "New quantity on hand", { type: "number", value: inv.quantityOnHand, required: true, hint: "Whole number, 0 or more", attrs: 'min="0" step="1" inputmode="numeric"' })}
          ${field("expiryDate", "Expiry date", { type: "date", value: inv.expiryDate || "", required: true, hint: "MM/DD/YYYY – must be after today" })}
          ${field("reorderLevel", "Reorder level", { type: "number", value: inv.reorderLevel, hint: "A restock alert is created when quantity is at or below this", attrs: 'min="0" step="1"' })}
          ${field("reason", "Reason for change", { type: "select", options: REASONS.map((r) => ({ value: r, label: r })) })}
          <div class="wide">${field("note", "Note (optional)", { type: "textarea", placeholder: "e.g. Counted after weekend sales" })}</div>
        </div>
        <div class="form-actions"><a class="button" href="#/inventory/${encodeURIComponent(p.productId)}" style="min-width:90px">Cancel</a><button class="primary" type="submit">Save Changes</button></div>
      </form>
    </div></section>`;

  const form = $("#edit-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    $("#errors").innerHTML = "";
    const values = formValues(form);

    // 1.4: check the values before sending them (the controller checks them again).
    const fieldErrors = {};
    if (!/^\d+$/.test(String(values.quantityOnHand).trim())) fieldErrors.quantityOnHand = "Quantity must be a whole number of 0 or more.";
    // A product with no expiry date (e.g. non-perishable) may stay without one.
    if (!values.expiryDate && inv.expiryDate) fieldErrors.expiryDate = "Enter the expiry date.";
    else if (values.expiryDate && values.expiryDate !== inv.expiryDate && values.expiryDate <= todayText())
      fieldErrors.expiryDate = `Expiry date must be after today (${fmtDate(todayText())}).`;
    if (values.reorderLevel !== "" && !/^\d+$/.test(String(values.reorderLevel).trim())) fieldErrors.reorderLevel = "Reorder level must be a whole number of 0 or more.";
    if (Object.keys(fieldErrors).length) return showInvalid(fieldErrors);

    // Only the fields that changed are submitted (InventoryPage step 11).
    const changes = {};
    if (Number(values.quantityOnHand) !== inv.quantityOnHand) changes.quantityOnHand = values.quantityOnHand;
    if (values.reorderLevel !== "" && Number(values.reorderLevel) !== inv.reorderLevel) changes.reorderLevel = values.reorderLevel;
    if (values.expiryDate !== (inv.expiryDate || "")) changes.expiryDate = values.expiryDate;
    if (Object.keys(changes).length === 0) {
      $("#errors").innerHTML = banner("error", "Nothing to save", "Change the quantity, expiry date or reorder level first.");
      return;
    }

    const saved = await busy(form.querySelector("button[type=submit]"), () =>
      api("PUT", `/inventory/${encodeURIComponent(p.productId)}`, changes)
    );
    if (!saved.ok) {
      const serverErrors = {};
      for (const name of Object.keys(changes)) if (saved.message?.includes(name)) serverErrors[name] = saved.message;
      return showInvalid(serverErrors, saved.message);
    }
    lastSave = { before: inv, result: saved, productId: p.productId, reason: values.reason, note: values.note };
    location.hash = `#/inventory/${encodeURIComponent(p.productId)}/saved`;
  });

  function showInvalid(fieldErrors, message) {
    const count = Object.keys(fieldErrors).length;
    $("#errors").innerHTML = banner(
      "error",
      "Changes not saved",
      count
        ? `Fix the ${count} highlighted field${count > 1 ? "s" : ""}, then select Save Changes again. Nothing was changed.`
        : `${message} Nothing was changed.`
    );
    showFormErrors(form, { fieldErrors });
    setStatus(`${count || 1} error${count > 1 ? "s" : ""} – nothing saved`, "bad", "1.4");
  }
}

// ----- 1.5 Updated record + restock alert -----
async function showSaved(main, productId) {
  if (!lastSave || lastSave.productId !== productId) {
    location.hash = `#/inventory/${encodeURIComponent(productId)}`;
    return;
  }
  const { before, result } = lastSave;
  const info = result.updatedInformation;
  const inv = info.inventory;
  const alert = result.restockAlert;
  const details = await api("GET", `/inventory/${encodeURIComponent(productId)}`);
  const changes = [];
  if (before.quantityOnHand !== inv.quantityOnHand) changes.push(`Quantity updated ${before.quantityOnHand} → ${inv.quantityOnHand} units`);
  if ((before.expiryDate || "") !== (inv.expiryDate || "")) changes.push(`Expiry updated ${fmtDate(before.expiryDate)} → ${fmtDate(inv.expiryDate)}`);
  if (before.reorderLevel !== inv.reorderLevel) changes.push(`Reorder level ${before.reorderLevel} → ${inv.reorderLevel}`);
  changes.push(fmtDateTime(inv.lastUpdated || new Date()));

  setStatus(`Saved · inventory record updated${alert ? " · restock alert created" : ""}`, "ok", "1.5");
  main.innerHTML = `
    ${pageHeader(info.product.productName, "", "", [["Products & Inventory", "#/inventory"], [info.product.productName]], pill(info.stockStatus))}
    ${banner("success", "Changes saved", changes.join(" · "))}
    ${
      alert
        ? banner(
            "warning",
            "Restock alert created",
            `Quantity (${inv.quantityOnHand}) is at or below the reorder level (${inv.reorderLevel}). ${info.product.productName} was added to the restock list.`,
            '<a class="button" href="#/inventory/alerts">View Restock Alert</a>'
          )
        : ""
    }
    ${result.warningMessage ? banner("warning", "Expiry warning", result.warningMessage) : ""}
    <div class="grid-2">${productInfoCard({ ...details.product, ...info.product }, details.supplierName)}${inventoryInfoCard(
      { ...inv, lastUpdated: inv.lastUpdated || details.product?.inventoryRecord?.lastUpdated },
      info.stockStatus,
      currentUserName()
    )}</div>
    <div class="form-actions" style="justify-content:space-between;margin-top:20px">
      <a class="button" href="#/inventory">Back to Inventory</a>
      <a class="button primary" href="#/inventory" id="done">Done Reviewing</a>
    </div>`;
  $("#done").addEventListener("click", () => {
    lastSave = null;
    toast("Inventory review complete.");
  });
}

// ----- New product (scenario S-1) -----
async function showNew(main) {
  const suppliers = (await api("GET", "/inventory/suppliers")).suppliers || [];
  setStatus("New product – not saved yet", "");
  main.innerHTML = `
    ${pageHeader("Add Product", "Record a new product and its first inventory. Fields marked * are required.", "", [
      ["Products & Inventory", "#/inventory"],
      ["Add Product"],
    ])}
    <div id="errors"></div>
    <section class="card"><div class="card-head"><h2>Product and stock details</h2></div><div class="card-body">
      <form id="new-form" novalidate>
        <div class="form-grid">
          ${field("productName", "Product name", { required: true })}
          ${field("category", "Category", { required: true, placeholder: "e.g. Dairy" })}
          ${field("productId", "SKU (product ID)", { required: true, placeholder: "e.g. PROD-020" })}
          ${field("inventoryId", "Inventory ID", { required: true, placeholder: "e.g. INV-020" })}
          ${field("supplierId", "Supplier", { type: "select", options: [{ value: "", label: "— None —" }, ...suppliers.map((s) => ({ value: s.supplierId, label: s.name }))] })}
          ${field("description", "Description")}
          ${field("quantityOnHand", "Quantity on hand", { type: "number", required: true, attrs: 'min="0" step="1"' })}
          ${field("reorderLevel", "Reorder level", { type: "number", required: true, attrs: 'min="0" step="1"' })}
          ${field("expiryDate", "Expiry date", { type: "date" })}
        </div>
        <div class="form-actions"><a class="button" href="#/inventory">Cancel</a><button class="primary" type="submit">Save Product</button></div>
      </form>
    </div></section>`;
  const form = $("#new-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const values = formValues(form);
    const fieldErrors = {};
    for (const name of ["productName", "category", "productId", "inventoryId"]) if (!values[name].trim()) fieldErrors[name] = "Required.";
    for (const name of ["quantityOnHand", "reorderLevel"]) if (!/^\d+$/.test(values[name].trim())) fieldErrors[name] = "Whole number, 0 or more.";
    if (Object.keys(fieldErrors).length) {
      $("#errors").innerHTML = banner("error", "Product not saved", "Fix the highlighted fields, then select Save Product again.");
      return showFormErrors(form, { fieldErrors });
    }
    const saved = await busy(form.querySelector("button[type=submit]"), () => api("POST", "/inventory", values));
    if (!saved.ok) {
      $("#errors").innerHTML = banner("error", "Product not saved", saved.message);
      return;
    }
    lastSave = {
      before: { quantityOnHand: saved.updatedInformation.inventory.quantityOnHand, reorderLevel: saved.updatedInformation.inventory.reorderLevel, expiryDate: saved.updatedInformation.inventory.expiryDate },
      result: saved,
      productId: saved.updatedInformation.product.productId,
    };
    toast("Product recorded.");
    location.hash = `#/inventory/${encodeURIComponent(lastSave.productId)}/saved`;
  });
}

// ----- Restock list (opened by "View Restock Alert" and the bell) -----
async function showAlerts(main) {
  const [alerts, notes] = await Promise.all([api("GET", "/inventory/alerts"), api("GET", "/profiles/notifications")]);
  const list = alerts.alerts || [];
  const notifications = notes.notifications || [];
  setStatus(`${list.length} pending restock alert${list.length === 1 ? "" : "s"}`, list.length ? "warn" : "ok");
  main.innerHTML = `
    ${pageHeader("Restock Alerts", "Products at or below their reorder level, waiting for the store owner.", '<a class="button" href="#/inventory">Back to Inventory</a>', [
      ["Products & Inventory", "#/inventory"],
      ["Restock Alerts"],
    ])}
    <section class="card"><div class="card-head"><h2>Pending restock alerts</h2></div>
      ${
        list.length
          ? `<ul class="list">${list
              .map((a) => `<li><div><strong>${esc(a.inventoryId)}</strong> · ${esc(a.reorderInformation)}</div>${pill(a.alertStatus)}</li>`)
              .join("")}</ul>`
          : '<div class="card-body"><p class="muted">No pending restock alerts.</p></div>'
      }
    </section>
    <section class="card"><div class="card-head"><div><h2>Supplier delivery notifications</h2><p>Discrepancies and unplanned deliveries (Feature 3).</p></div><a class="link" href="#/profiles/notifications">Open</a></div>
      ${
        notifications.length
          ? `<ul class="list">${notifications.map((n) => `<li><div>${esc(n.message)}</div>${pill(n.notificationType === "Discrepancy" ? "Poor" : "Pending", n.notificationType)}</li>`).join("")}</ul>`
          : '<div class="card-body"><p class="muted">No unread notifications.</p></div>'
      }
    </section>`;
}
