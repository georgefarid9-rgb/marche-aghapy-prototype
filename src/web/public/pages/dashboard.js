// Feature 2 — Dashboard and Reports.
// Milestone 6 scenario 2 "Generate and Review an Inventory Report", wireframes 2.1 to 2.7:
//   2.1 #/dashboard               dashboard (summary, sales last 7 days, needs attention)
//   2.2 #/dashboard/reports       report selection
//   2.3 #/dashboard/reports/view  generated report, filter bar
//   2.4 filtered report · 2.5 invalid filter · 2.6 no report data · 2.7 export dialog
// Every step calls the <<controller>> ReportHandler (/api/dashboard).

import {
  api, esc, $, $$, banner, pill, field, formValues, pageHeader, busy, toast, money, stat, setStatus,
  fmtDate, fmtDateTime, fmtTime, todayText, openModal, num, weekdayShort, weekdayLong,
} from "../ui.js";
import { currentLang } from "../i18n.js";

const REPORTS = [
  { type: "inventory", title: "Inventory Report", help: "Current quantity of every product and which products are low on stock" },
  { type: "sales", title: "Sales Report", help: "Sales totals by day, product and category" },
  { type: "expiryRestock", title: "Expiry & Restock Report", help: "Products expiring soon and products that need restocking" },
];
const titleOf = (type) => REPORTS.find((r) => r.type === type)?.title || "Report";
const STATUS_ORDER = { OUT_OF_STOCK: 0, LOW_STOCK: 1, IN_STOCK: 2 };

// The open report survives moving between 2.2 and 2.3 (like ReportHandler on the server).
let current = null; // { base, rows, filter, filterError, chip }
let selectedType = "inventory";

export default async function dashboard(main, rest = []) {
  if (rest[0] === "reports" && rest[1] === "view" && current) return showReport(main);
  if (rest[0] === "reports") return showSelection(main);
  return showDashboard(main);
}

// ----- 2.1 Dashboard -----
async function showDashboard(main) {
  const [summary, week, inv] = await Promise.all([
    api("GET", "/dashboard"),
    api("GET", "/dashboard/sales-week"),
    api("GET", "/inventory"),
  ]);
  const items = inv.inventory || [];
  const dayName = weekdayLong(new Date(`${todayText()}T12:00:00`));
  setStatus(summary.ok ? `Data refreshed ${fmtTime()}` : "Dashboard data unavailable", summary.ok ? "" : "bad", "2.1");

  const attention = items
    .filter((r) => r.inventoryStatus !== "IN_STOCK" || ["NEAR_EXPIRY", "EXPIRED"].includes(r.expiryStatus))
    .sort((a, b) => (STATUS_ORDER[a.inventoryStatus] ?? 3) - (STATUS_ORDER[b.inventoryStatus] ?? 3))
    .slice(0, 5);
  const days = week.days || [];
  const max = Math.max(1, ...days.map((d) => d.total));
  // Short bar labels in CAD: $2.0k / 2,0 k$ (the caption says the chart is in CAD).
  const fr = currentLang() === "fr";
  const short = (n) =>
    n >= 1000
      ? fr ? `${(n / 1000).toFixed(1).replace(".", ",")} k$` : `$${(n / 1000).toFixed(1)}k`
      : fr ? `${Math.round(n)} $` : `$${Math.round(n)}`;

  main.innerHTML = `
    ${pageHeader("Dashboard", `Store overview for ${dayName}, ${fmtDate(todayText())}`, '<a class="button primary" href="#/dashboard/reports">Reports</a>', [["Dashboard"]])}
    ${summary.dataStatus === "Unavailable" ? banner("warning", "Some data is unavailable", summary.message) : ""}
    ${!summary.ok && summary.message ? banner("error", "Dashboard not refreshed", summary.message) : ""}
    <div class="stats">
      ${stat("Inventory items", items.length, `${summary.lowStockCount ?? 0} low stock`, "warn")}
      ${stat("Today's sales", money(summary.totalSalesToday ?? 0), "Recorded sales today", "ok")}
      ${stat("Expiring in 7 days", summary.nearExpiryCount ?? 0, "products", "warn")}
      ${stat("Open restock alerts", summary.pendingRestockCount ?? 0, "needs action", "bad")}
    </div>
    <div class="split">
      <section class="card"><div class="card-head"><h2>Sales – last 7 days</h2></div><div class="card-body">
        <div class="bars" role="img" aria-label="Daily total of recorded sales for the last 7 days">
          ${days
            .map(
              (d, i) => `<div class="bar ${i === days.length - 1 ? "today" : ""}">${short(d.total)}<span class="fill" style="height:${Math.round((d.total / max) * 85)}%"></span></div>`
            )
            .join("")}
        </div>
        <div class="bar-labels">${days.map((d) => `<span>${esc(weekdayShort(d.date))}</span>`).join("")}</div>
        <p class="note">Daily total of recorded sales (CAD).</p>
      </div></section>
      <section class="card"><div class="card-head"><h2>Needs attention</h2></div>
        ${
          attention.length
            ? `<ul class="list">${attention
                .map((r) => {
                  const expiring = ["NEAR_EXPIRY", "EXPIRED"].includes(r.expiryStatus) && r.inventoryStatus === "IN_STOCK";
                  const detail = expiring ? `Expires ${fmtDate(r.expiryDate)}` : `${r.quantityOnHand} left · reorder level ${r.reorderLevel}`;
                  const tag = r.inventoryStatus === "OUT_OF_STOCK" ? pill("OUT_OF_STOCK", "Out") : r.inventoryStatus === "LOW_STOCK" ? pill("LOW_STOCK", "Low") : pill("NEAR_EXPIRY", "Expiring");
                  return `<li class="clickable" data-id="${esc(r.productId)}"><div><strong>${esc(r.productName)}</strong><small>${esc(detail)}</small></div>${tag}</li>`;
                })
                .join("")}</ul>`
            : '<div class="card-body"><p class="muted">Nothing needs attention.</p></div>'
        }
        <div class="card-body" style="border-top:1px solid var(--line)"><a class="link" href="#/inventory/alerts">View all alerts</a></div>
      </section>
    </div>`;
  $$("[data-id]", main).forEach((li) => li.addEventListener("click", () => (location.hash = `#/inventory/${encodeURIComponent(li.dataset.id)}`)));
}

// ----- 2.2 Report selection -----
async function showSelection(main) {
  await api("GET", "/dashboard/reports"); // ReportHandler.viewReports()
  const monthStart = `${todayText().slice(0, 8)}01`;
  setStatus(`${titleOf(selectedType)} selected`, "", "2.2");
  main.innerHTML = `
    ${pageHeader("Reports", "Choose a report type, then generate it.", "", [["Dashboard", "#/dashboard"], ["Reports"]])}
    <div id="errors"></div>
    <form id="report-form">
      <section class="card"><div class="card-head"><h2>Available reports</h2></div><div class="card-body">
        <div class="choices">
          ${REPORTS.map(
            (r) => `<label class="choice"><input type="radio" name="reportType" value="${r.type}" ${r.type === selectedType ? "checked" : ""}><span><strong>${esc(r.title)}</strong><small>${esc(r.help)}</small></span></label>`
          ).join("")}
        </div>
        <div class="form-grid" id="period" style="margin-top:14px">
          ${field("periodStart", "Period start", { type: "date", value: monthStart })}
          ${field("periodEnd", "Period end", { type: "date", value: todayText() })}
        </div>
      </div></section>
      <div class="form-actions" style="justify-content:space-between;margin-top:8px">
        <a class="button" href="#/dashboard">Back to Dashboard</a>
        <button class="primary" type="submit">Generate Report</button>
      </div>
    </form>`;

  const form = $("#report-form");
  const syncPeriod = () => $("#period").classList.toggle("hidden", selectedType !== "sales");
  syncPeriod();
  form.addEventListener("change", () => {
    selectedType = formValues(form).reportType;
    setStatus(`${titleOf(selectedType)} selected`, "", "2.2");
    syncPeriod();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(form);
    const periodStart = values.reportType === "sales" ? values.periodStart : monthStart;
    const periodEnd = values.reportType === "sales" ? values.periodEnd : todayText();
    const result = await busy(form.querySelector("button[type=submit]"), () =>
      api("POST", "/dashboard/reports", { reportType: values.reportType, periodStart, periodEnd })
    );
    if (!result.ok && result.reportStatus !== "noData") {
      $("#errors").innerHTML = banner("error", "Report not generated", result.message);
      setStatus("Report not generated", "bad", "2.2");
      return;
    }
    current = { base: result, rows: sortRows(result.reportType, result.rows || []), filter: {}, filterError: null, chip: null };
    location.hash = "#/dashboard/reports/view";
  });
}

function sortRows(type, rows) {
  if (type !== "inventory") return rows;
  return [...rows].sort((a, b) => (STATUS_ORDER[a.inventoryStatus] ?? 3) - (STATUS_ORDER[b.inventoryStatus] ?? 3));
}

function countsOf(rows) {
  return {
    units: rows.reduce((sum, r) => sum + (Number(r.quantityOnHand) || 0), 0),
    low: rows.filter((r) => r.inventoryStatus === "LOW_STOCK").length,
    out: rows.filter((r) => r.inventoryStatus === "OUT_OF_STOCK").length,
  };
}

// ----- 2.3 report · 2.4 filtered · 2.5 invalid filter · 2.6 no data -----
function showReport(main) {
  const report = current.base;
  const isInventory = report.reportType === "inventory";
  const rows = current.rows;
  const allRows = report.rows || [];
  const noData = allRows.length === 0 || rows.length === 0;
  const productNames = [...new Set(allRows.map((r) => r.productName).filter(Boolean))].sort();
  const categories = [...new Set(allRows.map((r) => r.category).filter(Boolean))].sort();
  const f = current.filter;

  if (current.filterError) setStatus("1 filter error – filter not applied", "bad", "2.5");
  else if (noData) setStatus("No data – export unavailable", "warn", "2.6");
  else if (current.chip) setStatus(`Filter applied · ${rows.length} products`, "ok", "2.4");
  else setStatus(`Report generated · ${rows.length} ${isInventory ? "products" : "rows"}`, "", "2.3");

  const c = countsOf(allRows);
  const summaryLine = isInventory
    ? `${allRows.length} products · ${num(c.units)} units in stock · ${c.low} low stock · ${c.out} out of stock (low-stock products listed first)`
    : (report.summary || []).slice(3).join(" · ");

  main.innerHTML = `
    ${pageHeader(
      titleOf(report.reportType),
      noData && !current.chip && !current.filterError ? "No data available for this report" : `Generated ${fmtDateTime(report.generatedDate)} · ${isInventory ? "current stock levels" : `${fmtDate(report.periodStart)} to ${fmtDate(report.periodEnd)}`}`,
      `<button id="export" ${noData ? "disabled" : ""}>Export</button><button id="back">Back to Dashboard</button>`,
      [["Dashboard", "#/dashboard"], ["Reports", "#/dashboard/reports"], [titleOf(report.reportType)]]
    )}
    <form id="filter-form" class="card" style="padding:12px 16px;margin-bottom:16px" novalidate>
      <div style="display:grid;grid-template-columns:${isInventory ? "1.3fr 1fr 0.8fr auto" : "1fr 1fr 1.2fr 1fr auto"};gap:16px;align-items:end">
        ${isInventory ? "" : field("startDate", "From", { type: "date", value: f.startDate || "" })}
        ${isInventory ? "" : field("endDate", "To", { type: "date", value: f.endDate || "" })}
        <label class="field"><span>Product</span><input name="product" list="product-list" placeholder="All products" value="${esc(f.product || "")}" autocomplete="off"></label>
        <datalist id="product-list">${productNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        ${field("category", "Category", { type: "select", value: f.category || "", options: [{ value: "", label: "All categories" }, ...categories.map((x) => ({ value: x, label: x }))] })}
        ${isInventory ? field("stockStatus", "Stock status", { type: "select", value: f.stockStatus || "", options: [{ value: "", label: "All" }, { value: "IN_STOCK", label: "In stock" }, { value: "LOW_STOCK", label: "Low stock" }, { value: "OUT_OF_STOCK", label: "Out of stock" }] }) : ""}
        <button class="primary" type="submit">Apply Filter</button>
      </div>
    </form>
    ${current.filterError ? `<p class="inline-error">Filter not applied – still showing the unfiltered report</p>` : ""}
    ${
      noData
        ? `<p style="font-weight:600;margin-bottom:10px">Generated ${fmtDateTime(report.generatedDate)}</p>
           <section class="card"><div class="empty-state">
             <div class="glyph" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 10h18" stroke="currentColor" stroke-width="1.6"/></svg></div>
             <h2>No ${isInventory ? "inventory" : "report"} data to show</h2>
             <p>No ${isInventory ? "inventory information" : "records"} matches the selected report criteria. Change the filters or go back to Reports.</p>
             <div class="actions" style="justify-content:center">${current.chip ? '<button id="clear2">Clear filter</button>' : ""}<a class="button" href="#/dashboard/reports">Back to Reports</a></div>
           </div></section>`
        : `${
            current.chip
              ? `<div class="chip">${esc(current.chip)} <button type="button" class="link" id="clear">Clear filter</button></div>`
              : current.filterError
              ? ""
              : `<p style="font-weight:600;margin-bottom:10px">${esc(summaryLine)}</p>`
          }
          ${isInventory ? inventoryTable(rows) : genericTable(report.columns || [], rows)}
          <div class="table-foot"><span>Showing ${rows.length} of ${allRows.length} ${isInventory ? "products" : "rows"}</span></div>`
    }`;

  const form = $("#filter-form");
  if (current.filterError) {
    const input = form.elements.product;
    input.classList.add("invalid");
    input.closest("label").insertAdjacentHTML("beforeend", `<small class="field-error">${esc(current.filterError)}</small>`);
  }
  form.addEventListener("submit", (event) => applyFilter(event, main, productNames));
  $("#clear")?.addEventListener("click", () => clearFilter(main));
  $("#clear2")?.addEventListener("click", () => clearFilter(main));
  $("#export").addEventListener("click", () => openExport());
  $("#back").addEventListener("click", async () => {
    if (report.reportId) await api("POST", `/dashboard/reports/${encodeURIComponent(report.reportId)}/close`); // alternate flow 10b
    current = null;
    location.hash = "#/dashboard";
  });
}

function inventoryTable(rows) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Product</th><th>Category</th><th>Qty on hand</th><th>Reorder level</th><th>Status</th></tr></thead>
    <tbody>${rows
      .map((r) => `<tr><td><strong>${esc(r.productName)}</strong></td><td>${esc(r.category ?? "—")}</td><td>${esc(r.quantityOnHand)}</td><td>${esc(r.reorderLevel)}</td><td>${pill(r.inventoryStatus)}</td></tr>`)
      .join("")}</tbody></table></div>`;
}

function genericTable(columns, rows) {
  return `<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${/Status$/.test(c.key) ? pill(r[c.key]) : esc(r[c.key] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

async function applyFilter(event, main, productNames) {
  event.preventDefault();
  const form = event.target;
  const values = formValues(form);
  current.filter = values;
  const allRows = current.base.rows || [];

  // 2.5: the product must be one of the report's products.
  let productId = null;
  if (values.product && values.product.trim()) {
    const match = allRows.find(
      (r) => r.productName?.toLowerCase() === values.product.trim().toLowerCase() || r.productId?.toLowerCase() === values.product.trim().toLowerCase()
    );
    if (!match) {
      current.filterError = `Product '${values.product.trim()}' does not exist. Choose a product from the list.`;
      current.rows = sortRows(current.base.reportType, allRows);
      current.chip = null;
      return showReport(main);
    }
    productId = match.productId;
  }

  const criteria = { startDate: values.startDate || null, endDate: values.endDate || null, productId, category: values.category || null };
  let rows = allRows;
  if (Object.values(criteria).some(Boolean) && !current.base.reportId) {
    current.filterError = "There is no report data to filter. Go back to Reports and choose another report or period.";
    current.chip = null;
    return showReport(main);
  }
  if (Object.values(criteria).some(Boolean)) {
    // 8a / 8b: ReportFilter validates the criteria, then the report applies them.
    const result = await busy(form.querySelector("button[type=submit]"), () => api("POST", `/dashboard/reports/${encodeURIComponent(current.base.reportId)}/filter`, criteria));
    if (!result.ok) {
      current.filterError = result.message;
      current.rows = sortRows(current.base.reportType, allRows);
      current.chip = null;
      return showReport(main);
    }
    rows = result.rows || [];
  }
  if (values.stockStatus) rows = rows.filter((r) => r.inventoryStatus === values.stockStatus);

  current.filterError = null;
  current.rows = sortRows(current.base.reportType, rows);
  const parts = [];
  if (values.product) parts.push(`Product = ${values.product.trim()}`);
  if (values.category) parts.push(`Category = ${values.category}`);
  if (values.stockStatus) parts.push(`Status = ${{ IN_STOCK: "In stock", LOW_STOCK: "Low stock", OUT_OF_STOCK: "Out of stock" }[values.stockStatus]}`);
  if (values.startDate || values.endDate) parts.push(`Dates = ${fmtDate(values.startDate)} to ${fmtDate(values.endDate)}`);
  const c = countsOf(rows);
  current.chip = parts.length
    ? `Filtered: ${parts.join(", ")} · ${rows.length} of ${allRows.length} ${current.base.reportType === "inventory" ? `products · ${c.low} low stock · ${c.out} out of stock` : "rows"}`
    : null;
  showReport(main);
}

async function clearFilter(main) {
  // Regenerate the report so the export no longer uses the filter.
  const { reportType, periodStart, periodEnd } = current.base;
  const previousId = current.base.reportId;
  const result = await api("POST", "/dashboard/reports", { reportType, periodStart, periodEnd });
  if (result.ok) {
    current.base = result;
    if (previousId) api("POST", `/dashboard/reports/${encodeURIComponent(previousId)}/close`); // the old copy is no longer used
  }
  current.filter = {};
  current.filterError = null;
  current.chip = null;
  current.rows = sortRows(current.base.reportType, current.base.rows || []);
  showReport(main);
}

// ----- 2.7 Export dialog -----
function openExport() {
  const report = current.base;
  const slug = [report.reportType === "expiryRestock" ? "expiry-restock" : report.reportType, "report", current.filter.category, todayText()]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  const scope = current.chip ? current.chip.replace(/^Filtered: /, "") : `${(report.rows || []).length} rows`;
  setStatus("Choose a format, then Export", "", "2.7");
  const { root, close } = openModal(`
    <div class="modal-head"><h2>Export ${esc(titleOf(report.reportType))}</h2><p>${esc(scope)} · as of ${fmtDate(todayText())}</p></div>
    <form id="export-form">
      <span class="field"><span>Format *</span></span>
      <div class="choices cards">
        <label class="choice"><input type="radio" name="format" value="PDF" checked><span><strong>PDF</strong><small>Best for printing and sharing</small></span></label>
        <label class="choice"><input type="radio" name="format" value="CSV"><span><strong>CSV</strong><small>Opens in Excel or Google Sheets</small></span></label>
      </div>
      ${field("fileName", "File name", { value: slug })}
      <div class="form-message"></div>
      <div class="form-actions"><button type="button" id="cancel-export">Cancel</button><button class="primary" type="submit">Export</button></div>
    </form>`);
  $("#cancel-export", root).addEventListener("click", () => {
    close();
    setStatus(`Report generated · ${current.rows.length} rows`, "", "2.3");
  });
  $("#export-form", root).addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.target);
    const result = await busy(event.target.querySelector("button[type=submit]"), () => api("POST", `/dashboard/reports/${encodeURIComponent(report.reportId)}/export`, { format: values.format }));
    if (!result.ok) {
      const box = $(".form-message", root);
      box.className = "form-message error";
      box.textContent = result.message;
      return;
    }
    close();
    const link = document.createElement("a");
    link.href = `/api/dashboard/exports/${encodeURIComponent(result.fileName)}?name=${encodeURIComponent(values.fileName)}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast(`Exported ${values.fileName}.${values.format.toLowerCase()}`);
    setStatus(`Exported as ${values.format}`, "ok", "2.7");
  });
}
