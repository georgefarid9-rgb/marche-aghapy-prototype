// Feature 6 — Customer Support (use case 6).
// The employee looks up a customer (ID or phone), then handles complaints, support
// requests and returns; escalated cases go to the store owner. Calls /api/support.

import {
  api, esc, $, $$, banner, pill, table, field, formValues, showFormErrors, clearFormErrors,
  pageHeader, busy, toast, money, dash, setStatus, fmtDate,
} from "../ui.js";

export default async function support(main) {
  const state = { employeeId: "EMP-001", employees: [], lookup: null, query: "", panel: null, returnItem: null };

  main.innerHTML = `
    ${pageHeader("Customer Support", "Look up a customer, then handle questions, complaints and returns.", '<label class="field" style="flex-direction:row;align-items:center;gap:8px">Acting employee <select id="employee" style="width:180px"></select></label>', [["Customer Support"]])}
    <section class="card">
      <div class="card-body">
        <form id="lookup-form" class="toolbar" style="display:flex;margin:0">
          <input name="customer" type="search" placeholder="Customer ID (CUST-002) or phone (514-555-0311)" aria-label="Customer ID or phone number" style="min-width:420px">
          <button class="primary" type="submit">Look up customer</button>
        </form>
      </div>
    </section>
    <div id="result"></div>
    <section class="card" id="owner" style="margin-top:16px"></section>`;

  async function loadOwner() {
    const result = await api("GET", "/support/owner/cases");
    $("#owner").innerHTML = `
      <div class="card-head"><div><h2>Store owner: escalated cases</h2><p>Complaints escalated by employees, and missing-record flags.</p></div></div>
      <div class="card-body">
        ${table(
          [
            { label: "Case", render: (c) => `<span class="mono">${esc(c.caseId)}</span>` },
            { label: "Customer", render: (c) => dash(c.customerId) },
            { label: "Category", render: (c) => esc(c.category) },
            { label: "Description", render: (c) => esc(c.description) },
            { label: "", render: (c) => `<button class="small" data-resolve="${esc(c.caseId)}">Resolve</button>` },
          ],
          result.cases,
          "No escalated cases waiting for review."
        )}
        ${(result.missingRecords || []).length ? `<h3 style="margin:14px 0 6px">Missing-record flags</h3><ul class="list">${result.missingRecords
          .map((r) => `<li><span>${esc(r.description)}</span><small class="muted">${fmtDate(r.requestDate)}</small></li>`)
          .join("")}</ul>` : ""}
      </div>`;
    $$("[data-resolve]").forEach((button) =>
      button.addEventListener("click", async () => {
        const res = await busy(button, () => api("POST", `/support/owner/cases/${encodeURIComponent(button.dataset.resolve)}/resolve`));
        toast(res.message, res.ok ? "success" : "error");
        await loadOwner();
        if (state.lookup) await lookup(state.query);
      })
    );
  }

  async function lookup(query) {
    state.query = query;
    const result = await api("POST", "/support/assist", { customer: query, employeeId: state.employeeId });
    if (!result.ok) {
      $("#result").innerHTML = banner("error", result.message);
      return;
    }
    state.lookup = result;
    setStatus(result.missingRecord ? "No customer record found" : `Assisting ${result.customer.name} (${result.customer.customerId})`, result.missingRecord ? "warn" : "ok");
    render();
  }

  function render() {
    const r = state.lookup;
    const box = $("#result");

    // 3a: no record -> the employee can flag it for the owner.
    if (r.missingRecord) {
      box.innerHTML = `<section class="card"><div class="card-body">
        ${banner("warning", `${r.message} You can flag the missing record for the store owner.`)}
        <form id="flag-form" novalidate>
          ${field("note", "Note for the owner", { type: "textarea", required: true, placeholder: "e.g. Customer says they signed up last month; no account found." })}
          <div class="form-message"></div>
          <div class="form-actions"><button class="primary" type="submit">Flag missing record</button></div>
        </form></div></section>`;
      $("#flag-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const res = await busy(event.target.querySelector("button[type=submit]"), () =>
          api("POST", "/support/missing-record", { customer: r.customerId, note: formValues(event.target).note, employeeId: state.employeeId })
        );
        if (!res.ok) return showFormErrors(event.target, res);
        toast(res.message);
        box.innerHTML = banner("success", res.message);
        loadOwner();
      });
      return;
    }

    const c = r.customer;
    const items = r.purchaseHistory.flatMap((sale) => sale.items.map((item) => ({ ...item, saleId: sale.saleId, saleDate: sale.saleDate })));
    box.innerHTML = `
      <div class="split" style="margin-top:16px">
        <div>
          <section class="card">
            <div class="card-head"><div><h2>${esc(c.name)}</h2><p>${esc(c.customerId)} · ${dash(c.phoneNumber)} · ${dash(c.email)}</p></div></div>
            <div class="card-body">
              <h3 style="margin-bottom:8px">Purchase history</h3>
              ${table(
                [
                  { label: "Sale", render: (i) => `<span class="mono">${esc(i.saleId)}</span><br><small class="muted">${fmtDate(i.saleDate)}</small>` },
                  { label: "Product", render: (i) => `<span class="mono">${esc(i.productId)}</span>` },
                  { label: "Qty", num: true, render: (i) => `${esc(i.quantity)}${i.returnedQuantity ? ` <small class="muted">(${i.returnedQuantity} returned)</small>` : ""}` },
                  { label: "Unit price", num: true, render: (i) => money(i.unitPrice) },
                  { label: "", render: (i) => (i.quantity > i.returnedQuantity ? `<button class="small" data-return="${esc(i.saleItemId)}">Return</button>` : "") },
                ],
                items,
                "No purchases on record."
              )}
              <h3 style="margin:16px 0 8px">Complaint cases</h3>
              ${table(
                [
                  { label: "Case", render: (x) => `<span class="mono">${esc(x.caseId)}</span>` },
                  { label: "Category", render: (x) => esc(x.category) },
                  { label: "Description", render: (x) => esc(x.description) },
                  { label: "Status", render: (x) => pill(x.status) },
                  { label: "", render: (x) => (x.status === "Open" ? `<button class="small" data-escalate="${esc(x.caseId)}">Escalate to owner</button>` : "") },
                ],
                r.complaintCases,
                "No complaint cases."
              )}
              <h3 style="margin:16px 0 8px">Support requests</h3>
              ${table(
                [
                  { label: "Request", render: (x) => `<span class="mono">${esc(x.requestId)}</span><br><small class="muted">${fmtDate(x.requestDate)}</small>` },
                  { label: "Subject", render: (x) => `<strong>${esc(x.subject)}</strong><br><small class="muted">${esc(x.description || "")}</small>` },
                  { label: "Status", render: (x) => pill(x.requestStatus) },
                  { label: "", render: (x) => `<button class="small" data-note="${esc(x.requestId)}">Add note</button>` },
                ],
                r.supportRequests,
                "No support requests."
              )}
              <h3 style="margin:16px 0 8px">Returns</h3>
              ${table(
                [
                  { label: "Return", render: (x) => `<span class="mono">${esc(x.returnId)}</span>` },
                  { label: "Reason", render: (x) => esc(x.reason) },
                  { label: "Amount", num: true, render: (x) => money(x.amount) },
                  { label: "Status", render: (x) => pill(x.status) },
                ],
                r.returnRequests,
                "No returns."
              )}
            </div>
          </section>
        </div>
        <aside class="card" id="panel" aria-live="polite"></aside>
      </div>`;

    $$("[data-return]", box).forEach((b) =>
      b.addEventListener("click", () => {
        state.returnItem = items.find((i) => String(i.saleItemId) === b.dataset.return);
        state.panel = "return";
        renderPanel();
      })
    );
    $$("[data-escalate]", box).forEach((b) =>
      b.addEventListener("click", async () => {
        const res = await busy(b, () => api("POST", `/support/complaints/${encodeURIComponent(b.dataset.escalate)}/escalate`, { employeeId: state.employeeId }));
        toast(res.message, res.ok ? "success" : "error");
        await lookup(state.query);
        loadOwner();
      })
    );
    $$("[data-note]", box).forEach((b) =>
      b.addEventListener("click", () => {
        state.panel = { note: b.dataset.note };
        renderPanel();
      })
    );
    renderPanel();
  }

  function renderPanel() {
    const panel = $("#panel");
    const c = state.lookup.customer;
    const actions = `<div class="actions" style="flex-direction:column;align-items:stretch">
      <button id="p-complaint">Open a complaint case</button>
      <button id="p-request">Open a support request</button></div>`;

    let body = `<p class="muted" style="margin-bottom:12px">Choose what the customer needs. To process a return, use Return on a purchased item.</p>${actions}`;
    let title = "Assist customer";

    if (state.panel === "complaint") {
      title = "New complaint case";
      body = `<form id="p-form" novalidate>
        ${field("category", "Category", { type: "select", required: true, options: ["Product quality", "Service", "Pricing", "Other"].map((v) => ({ value: v, label: v })) })}
        ${field("description", "Description", { type: "textarea", required: true })}
        <div class="form-message"></div>
        <div class="form-actions"><button type="button" id="p-cancel">Cancel</button><button class="primary" type="submit">Open case</button></div></form>`;
    } else if (state.panel === "request") {
      title = "New support request";
      body = `<form id="p-form" novalidate>
        ${field("subject", "Subject", { required: true })}
        ${field("description", "Description", { type: "textarea", required: true })}
        <div class="form-message"></div>
        <div class="form-actions"><button type="button" id="p-cancel">Cancel</button><button class="primary" type="submit">Open request</button></div></form>`;
    } else if (state.panel === "return") {
      const i = state.returnItem;
      title = "Process a return";
      body = `<dl class="details" style="margin-bottom:12px"><dt>Sale</dt><dd class="mono">${esc(i.saleId)}</dd><dt>Product</dt><dd class="mono">${esc(i.productId)}</dd>
        <dt>Bought</dt><dd>${esc(i.quantity)} × ${money(i.unitPrice)}</dd><dt>Already returned</dt><dd>${esc(i.returnedQuantity)}</dd></dl>
        <form id="p-form" novalidate>
        ${field("quantity", "Quantity to return", { type: "number", value: 1, required: true, attrs: `min="1" max="${i.quantity - i.returnedQuantity}" step="1"` })}
        ${field("reason", "Reason", { value: "Damaged product", required: true })}
        <div class="form-message"></div>
        <div class="form-actions"><button type="button" id="p-cancel">Cancel</button><button class="primary" type="submit">Check eligibility &amp; refund</button></div></form>`;
    } else if (state.panel && state.panel.note) {
      title = `Add a note to ${state.panel.note}`;
      body = `<form id="p-form" novalidate>
        ${field("text", "Note", { type: "textarea", required: true })}
        <div class="form-message"></div>
        <div class="form-actions"><button type="button" id="p-cancel">Cancel</button><button class="primary" type="submit">Save note</button></div></form>`;
    }

    panel.innerHTML = `<div class="card-head"><div><h2>${esc(title)}</h2><p>${esc(c.name)} · ${esc(c.customerId)}</p></div></div><div class="card-body">${body}</div>`;
    $("#p-complaint")?.addEventListener("click", () => ((state.panel = "complaint"), renderPanel()));
    $("#p-request")?.addEventListener("click", () => ((state.panel = "request"), renderPanel()));
    $("#p-cancel")?.addEventListener("click", () => ((state.panel = null), renderPanel()));

    const form = $("#p-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const values = { ...formValues(form), employeeId: state.employeeId, customerId: c.customerId };
      let res;
      const button = form.querySelector("button[type=submit]");
      if (state.panel === "complaint") res = await busy(button, () => api("POST", "/support/complaints", values));
      else if (state.panel === "request") res = await busy(button, () => api("POST", "/support/requests", values));
      else if (state.panel === "return")
        res = await busy(button, () =>
          api("POST", "/support/returns", { ...values, saleId: state.returnItem.saleId, saleItemId: state.returnItem.saleItemId })
        );
      else res = await busy(button, () => api("POST", `/support/requests/${encodeURIComponent(state.panel.note)}/notes`, values));

      if (!res.ok) return showFormErrors(form, res);
      state.panel = null;
      await lookup(state.query);
      $("#panel").insertAdjacentHTML("afterbegin", `<div class="card-body" style="padding-bottom:0">${banner(res.refunded === false ? "warning" : "success", res.message)}</div>`);
      toast(res.refunded === false ? "Return not approved." : res.message, res.refunded === false ? "error" : "success");
    });
  }

  // ----- Start -----
  setStatus("Look up a customer by ID or phone number");
  const employees = await api("GET", "/support/employees");
  state.employees = employees.employees || [];
  $("#employee").innerHTML = state.employees.map((e) => `<option value="${esc(e.employeeId)}">${esc(e.employeeName)}</option>`).join("");
  $("#employee").addEventListener("change", (event) => (state.employeeId = event.target.value));
  $("#lookup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const q = formValues(event.target).customer.trim();
    if (q) lookup(q);
  });
  await loadOwner();
}
