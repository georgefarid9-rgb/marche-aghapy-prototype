// Feature 3 — Supplier and Customer Profile Management (use case 3).
// Find or create a profile, edit it with validation (2S.1-2S.3, 5a), record a delivery
// (6, 6a, 6b), review the supplier performance report (8-9, 9a) and the owner's
// notifications. Calls the Feature 3 classes through /api/profiles.

import {
  api, esc, $, $$, banner, pill, table, field, formValues, showFormErrors, clearFormErrors,
  pageHeader, busy, toast, dash, stat, money, todayText, setStatus, fmtDate,
} from "../ui.js";

const fmtRate = (value) => (value === null || value === undefined ? "—" : `${value}%`);
const fmtDays = (value) => (value === null || value === undefined ? "—" : `${value} day${value === 1 ? "" : "s"}`);

export default async function profiles(main, rest = []) {
  const state = {
    tab: ["customers", "notifications"].includes(rest[0]) ? rest[0] : "suppliers",
    suppliers: [],
    customers: [],
    notifications: [],
    employees: [],
    selected: null, // { type, id }
    detail: null,
    panel: "help", // help | supplier | customer | newSupplier | newCustomer
    findMessage: null,
    prefill: {},
  };

  main.innerHTML = `
    ${pageHeader("Supplier & Customer Profiles", "Find, create and update profiles, record deliveries and review supplier performance.", "", [["Supplier & Customer Profiles"]])}
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="suppliers">Suppliers</button>
      <button role="tab" data-tab="customers">Customers</button>
      <button role="tab" data-tab="notifications">Owner notifications <span class="count" id="notif-count">0</span></button>
    </div>
    <div class="split" style="grid-template-columns:minmax(0,1.2fr) minmax(400px,1fr)">
      <section class="card" id="list"></section>
      <aside class="card" id="panel" aria-live="polite"></aside>
    </div>`;

  // ----- Data -----

  async function loadLists() {
    const [suppliers, customers, notifications] = await Promise.all([
      api("GET", "/profiles/suppliers"),
      api("GET", "/profiles/customers"),
      api("GET", "/profiles/notifications"),
    ]);
    state.suppliers = suppliers.suppliers || [];
    state.customers = customers.customers || [];
    state.notifications = notifications.notifications || [];
    $("#notif-count").textContent = state.notifications.length;
    $("#notif-count").classList.toggle("hidden", state.notifications.length === 0);
  }

  async function openProfile(type, id) {
    state.selected = { type, id };
    const result = await api("GET", `/profiles/${type === "supplier" ? "suppliers" : "customers"}/${encodeURIComponent(id)}`);
    if (!result.ok) {
      toast(result.message, "error");
      return;
    }
    state.detail = result;
    state.panel = type;
    renderList();
    renderPanel();
  }

  // ----- Left side: tabs and lists -----

  function renderTabs() {
    $$(".tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === state.tab);
      b.setAttribute("aria-selected", b.dataset.tab === state.tab);
    });
  }

  function renderList() {
    renderTabs();
    const counts = { suppliers: state.suppliers.length, customers: state.customers.length, notifications: state.notifications.length };
    setStatus(
      state.tab === "notifications"
        ? `${counts.notifications} unread notification${counts.notifications === 1 ? "" : "s"}`
        : `${counts[state.tab]} ${state.tab}`,
      state.tab === "notifications" && counts.notifications ? "warn" : ""
    );
    const list = $("#list");

    if (state.tab === "notifications") {
      list.innerHTML = `
        <div class="card-head"><div><h2>Owner notifications</h2><p>Delivery discrepancies (6a) and unplanned deliveries (6b) waiting for the store owner.</p></div></div>
        <div class="card-body">${
          state.notifications.length === 0
            ? '<p class="empty">No unread notifications.</p>'
            : `<ul class="list">${state.notifications
                .map(
                  (n) => `<li><div><span class="pill ${n.notificationType === "Discrepancy" ? "bad" : "warn"}">${esc(
                    n.notificationType
                  )}</span> <span class="muted mono">${esc(n.recordId)}</span><br>${esc(n.message)}<br><small class="muted">${esc(
                    new Date(n.sentDate).toLocaleString()
                  )}</small></div><button class="small" data-read="${esc(n.notificationId)}">Mark as read</button></li>`
                )
                .join("")}</ul>`
        }</div>`;
      $$("[data-read]", list).forEach((button) =>
        button.addEventListener("click", async () => {
          await busy(button, () => api("POST", `/profiles/notifications/${encodeURIComponent(button.dataset.read)}/read`));
          toast("Notification marked as read.");
          await loadLists();
          renderList();
        })
      );
      return;
    }

    const isSupplier = state.tab === "suppliers";
    list.innerHTML = `
      <div class="card-head">
        <div><h2>${isSupplier ? "Suppliers" : "Customers"}</h2><p>${isSupplier ? "Find a supplier by name." : "Find a customer by phone number."}</p></div>
        <button class="primary" id="new-profile">+ New ${isSupplier ? "supplier" : "customer"}</button>
      </div>
      <div class="card-body">
        <form class="toolbar" id="find-form" style="display:flex">
          <input name="q" type="search" placeholder="${isSupplier ? "Supplier name, e.g. Nile Valley Imports" : "Phone number, e.g. 514-555-0311"}" aria-label="Search" value="${esc(state.findQuery || "")}">
          <button type="submit">Find profile</button>
        </form>
        ${state.findMessage ? state.findMessage : ""}
        <div id="rows"></div>
      </div>`;

    const rows = isSupplier ? state.suppliers : state.customers;
    $("#rows").innerHTML = isSupplier
      ? table(
          [
            { label: "Supplier", render: (s) => `<strong>${esc(s.partnerName)}</strong><br><span class="muted mono">${esc(s.supplierId)}</span>` },
            { label: "Lead time", render: (s) => fmtDays(s.leadTimeDays) },
            { label: "Terms", render: (s) => dash(s.paymentTerms) },
            { label: "Avg fill rate", num: true, render: (s) => fmtRate(s.averageFillRate) },
            { label: "Status", render: (s) => pill(s.partnerStatus) },
          ],
          rows,
          "No suppliers yet.",
          (s) => `class="clickable ${state.selected?.id === s.supplierId ? "selected" : ""}" data-open="${esc(s.supplierId)}"`
        )
      : table(
          [
            { label: "Customer", render: (c) => `<strong>${esc(c.partnerName)}</strong><br><span class="muted mono">${esc(c.customerId)}</span>` },
            { label: "Phone", render: (c) => dash(c.phoneNumber) },
            { label: "Email", render: (c) => dash(c.email) },
            { label: "Status", render: (c) => pill(c.partnerStatus) },
          ],
          rows,
          "No customers yet.",
          (c) => `class="clickable ${state.selected?.id === c.customerId ? "selected" : ""}" data-open="${esc(c.customerId)}"`
        );

    $$("[data-open]", list).forEach((row) =>
      row.addEventListener("click", () => openProfile(isSupplier ? "supplier" : "customer", row.dataset.open))
    );
    $("#new-profile").addEventListener("click", () => {
      state.prefill = {};
      state.panel = isSupplier ? "newSupplier" : "newCustomer";
      state.selected = null;
      renderList();
      renderPanel();
    });

    // Step 2: find the profile. 2a: not found -> offer to create it.
    $("#find-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const q = formValues(event.target).q.trim();
      state.findQuery = q;
      const result = await api("GET", isSupplier ? `/profiles/suppliers/find?name=${encodeURIComponent(q)}` : `/profiles/customers/find?phone=${encodeURIComponent(q)}`);
      if (result.ok) {
        state.findMessage = null;
        await openProfile(isSupplier ? "supplier" : "customer", isSupplier ? result.supplierId : result.customerId);
        return;
      }
      state.findMessage = result.notFound
        ? `<div class="banner info">${esc(result.message)} <button class="link" id="create-from-find">Create this profile</button></div>`
        : banner("error", result.message);
      renderList();
      $("#create-from-find")?.addEventListener("click", () => {
        state.prefill = isSupplier ? { partnerName: q } : { phoneNumber: q };
        state.panel = isSupplier ? "newSupplier" : "newCustomer";
        state.findMessage = null;
        renderList();
        renderPanel();
      });
    });
  }

  // ----- Right side: detail and forms -----

  function renderPanel() {
    const panel = $("#panel");
    if (state.panel === "help") {
      panel.innerHTML = `<div class="card-head"><h2>Profile</h2></div><div class="card-body"><p class="muted">Select a profile in the list, find one by ${
        state.tab === "customers" ? "phone number" : "name"
      }, or create a new one.</p></div>`;
      return;
    }
    if (state.panel === "newSupplier" || state.panel === "newCustomer") return renderNewForm(panel);
    if (state.panel === "supplier") return renderSupplier(panel);
    if (state.panel === "customer") return renderCustomer(panel);
  }

  function renderNewForm(panel) {
    const isSupplier = state.panel === "newSupplier";
    const p = state.prefill || {};
    panel.innerHTML = `
      <div class="card-head"><div><h2>New ${isSupplier ? "supplier" : "customer"} profile</h2><p>The details are validated before anything is saved.</p></div></div>
      <div class="card-body">
        <form id="new-form" novalidate>
          ${
            isSupplier
              ? `${field("partnerName", "Supplier name", { required: true, value: p.partnerName || "" })}
                 ${field("contactInformation", "Contact information", { placeholder: "email · phone" })}
                 <div class="form-grid">
                   ${field("leadTimeDays", "Lead time (days)", { type: "number", attrs: 'min="0" step="1"' })}
                   ${field("paymentTerms", "Payment terms", { placeholder: "e.g. Net 30" })}
                 </div>`
              : `${field("partnerName", "Customer name", { required: true })}
                 <div class="form-grid">
                   ${field("phoneNumber", "Phone number", { required: true, value: p.phoneNumber || "", placeholder: "514-555-0000" })}
                   ${field("email", "Email", { type: "email", placeholder: "name@example.com" })}
                 </div>`
          }
          <div class="form-message"></div>
          <div class="form-actions"><button type="button" id="cancel">Cancel</button><button class="primary" type="submit">Save profile</button></div>
        </form>
      </div>`;
    $("#cancel").addEventListener("click", () => {
      state.panel = "help";
      renderPanel();
    });
    const form = $("#new-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const result = await busy(form.querySelector("button[type=submit]"), () =>
        api("POST", isSupplier ? "/profiles/suppliers" : "/profiles/customers", formValues(form))
      );
      if (!result.ok) {
        showFormErrors(form, result); // 5a duplicate, invalid email, ...
        return;
      }
      toast(result.message);
      await loadLists();
      await openProfile(isSupplier ? "supplier" : "customer", isSupplier ? result.supplierId : result.customerId);
    });
  }

  function profileHeader(profile, title, subtitle) {
    const next = profile.partnerStatus === "Active" ? "Inactive" : "Active";
    return `<div class="card-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
      <div class="actions">${pill(profile.partnerStatus)}<button class="small" id="status" data-next="${next}">${next === "Inactive" ? "Deactivate" : "Activate"}</button></div></div>`;
  }

  function bindStatusAndEdit(profile, type) {
    $("#status").addEventListener("click", async (event) => {
      const result = await busy(event.currentTarget, () =>
        api("POST", `/profiles/partners/${encodeURIComponent(profile.partnerId)}/status`, { partnerStatus: event.currentTarget.dataset.next })
      );
      toast(result.message, result.ok ? "success" : "error");
      await loadLists();
      await openProfile(type, type === "supplier" ? profile.supplierId : profile.customerId);
    });
    const form = $("#edit-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const result = await busy(form.querySelector("button[type=submit]"), () =>
        api("PUT", `/profiles/partners/${encodeURIComponent(profile.partnerId)}`, formValues(form))
      );
      if (!result.ok) {
        showFormErrors(form, result); // 2S.3 invalid: nothing saved
        return;
      }
      toast("Profile saved.");
      await loadLists();
      await openProfile(type, type === "supplier" ? profile.supplierId : profile.customerId);
    });
  }

  function renderSupplier(panel) {
    const { profile, report, deliveries } = state.detail;
    panel.innerHTML = `
      ${profileHeader(profile, profile.partnerName, `${profile.supplierId} · ${profile.partnerId}`)}
      <div class="card-body">
        <h3 style="margin-bottom:8px">Performance report</h3>
        ${report.message ? banner("info", report.message) : ""}
        <div class="stats" style="grid-template-columns:repeat(3,1fr)">
          ${stat("Avg lead time", fmtDays(report.averageLeadTime), `Agreed ${fmtDays(report.agreedLeadTimeDays)}`)}
          ${stat("On-time rate", fmtRate(report.onTimeDeliveryRate), "Planned only", report.onTimeDeliveryRate !== null && report.onTimeDeliveryRate < 80 ? "warn" : "")}
          ${stat("Avg fill rate", fmtRate(report.averageFillRate), `${report.deliveriesRecorded} deliveries`, report.averageFillRate !== null && report.averageFillRate < 95 ? "warn" : "")}
        </div>

        <h3 style="margin:6px 0 8px">Profile</h3>
        <form id="edit-form" novalidate>
          ${field("partnerName", "Supplier name", { value: profile.partnerName, required: true })}
          ${field("contactInformation", "Contact information", { value: profile.contactInformation || "" })}
          <div class="form-grid">
            ${field("leadTimeDays", "Lead time (days)", { type: "number", value: profile.leadTimeDays ?? "", attrs: 'min="0" step="1"' })}
            ${field("paymentTerms", "Payment terms", { value: profile.paymentTerms || "" })}
          </div>
          <div class="form-message"></div>
          <div class="form-actions"><button class="primary" type="submit">Save changes</button></div>
        </form>

        <div class="section-title" style="margin-top:18px"><h3>Deliveries</h3><button class="small" id="toggle-delivery">+ Record delivery</button></div>
        <div id="delivery-box" class="hidden"></div>
        ${table(
          [
            { label: "Date", render: (d) => `<span class="nowrap">${fmtDate(d.deliveryDate)}</span>${d.isUnplanned ? '<br><span class="pill warn">Unplanned</span>' : ""}` },
            { label: "Ord / rec", render: (d) => `${dash(d.quantityOrdered)} / ${esc(d.quantityReceived)}` },
            { label: "Delay", num: true, render: (d) => (d.deliveryDelay === null ? "—" : `${d.deliveryDelay} d`) },
            { label: "Fill", num: true, render: (d) => fmtRate(d.fillRate) },
            { label: "Condition", render: (d) => `${pill(d.conditionRating)}${d.discrepancy ? '<br><span class="pill bad">Discrepancy</span>' : ""}` },
          ],
          deliveries,
          "No deliveries recorded for this supplier."
        )}
      </div>`;
    bindStatusAndEdit(profile, "supplier");

    $("#toggle-delivery").addEventListener("click", async () => {
      if (state.employees.length === 0) state.employees = (await api("GET", "/profiles/employees")).employees || [];
      const box = $("#delivery-box");
      box.classList.toggle("hidden");
      if (box.classList.contains("hidden")) return;
      box.innerHTML = `
        <form id="delivery-form" class="card" style="padding:12px 14px;margin-bottom:12px;background:#fafbf8" novalidate>
          <label class="check"><input type="checkbox" name="isUnplanned" id="unplanned"> Unplanned delivery (no purchase order)</label>
          <div class="form-grid">
            ${field("deliveryDate", "Delivery date", { type: "date", value: todayText(), required: true })}
            <div class="planned">${field("expectedDeliveryDate", "Expected date (PO)", { type: "date", required: true })}</div>
            <div class="planned">${field("quantityOrdered", "Quantity ordered", { type: "number", required: true, attrs: 'min="1" step="1"' })}</div>
            ${field("quantityReceived", "Quantity received", { type: "number", required: true, attrs: 'min="0" step="1"' })}
            ${field("conditionRating", "Condition", { type: "select", options: ["Good", "Acceptable", "Poor"].map((v) => ({ value: v, label: v })) })}
            ${field("employeeId", "Received by", { type: "select", options: state.employees.map((e) => ({ value: e.employeeId, label: e.employeeName })) })}
          </div>
          <div class="form-message"></div>
          <div class="form-actions"><button class="primary" type="submit">Save delivery</button></div>
        </form>`;
      const form = $("#delivery-form");
      $("#unplanned").addEventListener("change", (event) =>
        $$(".planned", form).forEach((el) => el.classList.toggle("hidden", event.target.checked))
      );
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearFormErrors(form);
        const result = await busy(form.querySelector("button[type=submit]"), () =>
          api("POST", `/profiles/suppliers/${encodeURIComponent(profile.supplierId)}/deliveries`, formValues(form))
        );
        if (!result.ok) {
          showFormErrors(form, result);
          return;
        }
        toast(result.message, "success");
        await loadLists();
        await openProfile("supplier", profile.supplierId);
      });
    });
  }

  function renderCustomer(panel) {
    const { profile, purchaseHistory } = state.detail;
    panel.innerHTML = `
      ${profileHeader(profile, profile.partnerName, `${profile.customerId} · customer since ${fmtDate(profile.createdDate)}`)}
      <div class="card-body">
        <form id="edit-form" novalidate>
          ${field("partnerName", "Customer name", { value: profile.partnerName, required: true })}
          <div class="form-grid">
            ${field("phoneNumber", "Phone number", { value: profile.phoneNumber || "", required: true })}
            ${field("email", "Email", { type: "email", value: profile.email || "" })}
          </div>
          <div class="form-message"></div>
          <div class="form-actions"><button class="primary" type="submit">Save changes</button></div>
        </form>
        <h3 style="margin:18px 0 8px">Purchase history</h3>
        ${table(
          [
            { label: "Sale", render: (s) => `<span class="mono">${esc(s.saleId)}</span>` },
            { label: "Date", render: (s) => fmtDate(s.saleDate) },
            { label: "Payment", render: (s) => dash(s.paymentMethod) },
            { label: "Total", num: true, render: (s) => money(s.totalAmount) },
          ],
          purchaseHistory,
          "No purchases yet."
        )}
      </div>`;
    bindStatusAndEdit(profile, "customer");
  }

  // ----- Start -----

  $$(".tabs button").forEach((button) =>
    button.addEventListener("click", async () => {
      state.tab = button.dataset.tab;
      state.findMessage = null;
      state.findQuery = "";
      if (state.tab === "notifications") await loadLists();
      renderList();
      if (state.tab !== "notifications" && !(state.panel === "supplier" && state.tab === "suppliers") && !(state.panel === "customer" && state.tab === "customers")) {
        state.panel = "help";
        state.selected = null;
        renderPanel();
      }
    })
  );

  await loadLists();
  renderList();
  renderPanel();
}
