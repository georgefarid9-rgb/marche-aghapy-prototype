// Feature 4 — Accounting.
// Milestone 6 scenario 3 "Record Daily Sales Revenue", wireframes 3.1 to 3.5:
//   3.1 #/accounting          accounting dashboard (month to date) and recent transactions
//   3.2 #/accounting/new      record transaction form with ledger preview (3.3: errors)
//   3.4 #/accounting/saved    confirmation and updated profit and loss
//   3.5 #/accounting/history  transaction history (ledger) with running balance
// Saving goes through Revenue / Expense -> categorize() -> Ledger.addTransaction().

import {
  api, esc, $, $$, banner, pill, field, formValues, showFormErrors, clearFormErrors, pageHeader, busy,
  money, signedMoney, stat, setStatus, fmtDate, fmtDateTime, todayText,
} from "../ui.js";
import { currentLang } from "../i18n.js";

const CATEGORIES = {
  Revenue: ["Daily sales", "Catering", "Other income"],
  Expense: ["Supplier payment", "Rent", "Utilities", "Wages", "Other expense"],
};

let lastSaved = null; // { before, after, transaction } for wireframe 3.4

export default async function accounting(main, rest = []) {
  const data = await api("GET", "/accounting");
  if (!data.ok) {
    main.innerHTML = pageHeader("Accounting", "", "", [["Accounting"]]) + banner("error", "Accounting is unavailable", data.message);
    setStatus("Accounting unavailable", "bad");
    return;
  }
  data.transactions.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  if (rest[0] === "new") return showForm(main, data);
  if (rest[0] === "saved" && lastSaved) return showSaved(main);
  if (rest[0] === "history") return showHistory(main, data);
  return showDashboard(main, data);
}

// Month-to-date figures, from the ledger's transactions.
function monthFigures(data, month = todayText().slice(0, 7)) {
  const inMonth = data.transactions.filter((t) => String(t.date).startsWith(month));
  const revenue = inMonth.filter((t) => t.transactionType === "Revenue").reduce((s, t) => s + t.amount, 0);
  const expenses = inMonth.filter((t) => t.transactionType === "Expense").reduce((s, t) => s + t.amount, 0);
  return { revenue, expenses, net: revenue - expenses, balance: data.summary.currentBalance };
}

const monthName = (month = todayText().slice(0, 7)) =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString(currentLang() === "fr" ? "fr-CA" : "en-US", { month: "long", year: "numeric" });

function yesterday() {
  const d = new Date(`${todayText()}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function amountCell(t) {
  return `<span class="${t.transactionType === "Revenue" ? "pos" : "neg"}">${signedMoney(t.transactionType === "Revenue" ? t.amount : -t.amount)}</span>`;
}

// ----- 3.1 Accounting dashboard -----
function showDashboard(main, data) {
  const m = monthFigures(data);
  const y = yesterday();
  const revY = data.transactions.filter((t) => t.date === y && t.transactionType === "Revenue").reduce((s, t) => s + t.amount, 0);
  const expY = data.transactions.filter((t) => t.date === y && t.transactionType === "Expense").reduce((s, t) => s + t.amount, 0);
  const lastEntry = data.transactions[0]?.date;
  setStatus(`Ledger up to date · last entry ${fmtDate(lastEntry)}`, "", "3.1");

  main.innerHTML = `
    ${pageHeader("Accounting", `Financial summary – ${monthName()} (month to date)`, '<a class="button primary" href="#/accounting/new">+ Record Transaction</a>', [["Accounting"]])}
    <div class="stats">
      ${stat("Revenue (MTD)", money(m.revenue), `${signedMoney(revY)} yesterday`, "ok")}
      ${stat("Expenses (MTD)", money(m.expenses), `${money(expY)} yesterday`)}
      ${stat("Net profit / loss", money(m.net), m.net >= 0 ? "Profit" : "Loss", m.net >= 0 ? "ok" : "bad")}
      ${stat("Ledger balance", money(m.balance), `as of ${fmtDate(lastEntry || todayText())}`)}
    </div>
    <section class="card"><div class="card-head"><h2>Recent transactions</h2><a class="link" href="#/accounting/history">View transaction history</a></div>
      <div class="card-body">${transactionsTable(data.transactions.slice(0, 5), false)}</div></section>`;
}

function transactionsTable(rows, withExtras, highlightId = null, balances = {}) {
  if (!rows.length) return '<p class="empty">No transactions match.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Date</th>${withExtras ? "<th>ID</th>" : ""}<th>Type</th><th>Category</th><th>Description</th><th>Amount</th>${withExtras ? "<th>Balance</th>" : ""}</tr></thead>
    <tbody>${rows
      .map(
        (t) => `<tr class="${t.transactionId === highlightId ? "highlight" : ""}"><td class="nowrap"><strong>${fmtDate(t.date)}</strong></td>${
          withExtras ? `<td class="mono">${esc(t.transactionId)}</td>` : ""
        }<td>${pill(t.transactionType)}</td><td>${esc(t.category)}</td><td>${esc(t.description)}</td><td class="nowrap">${amountCell(t)}</td>${
          withExtras ? `<td class="nowrap ${t.transactionId === highlightId ? "strong" : ""}">${money(balances[t.transactionId])}</td>` : ""
        }</tr>`
      )
      .join("")}</tbody></table></div>`;
}

// ----- 3.2 Transaction form, 3.3 validation errors -----
function showForm(main, data) {
  setStatus("New transaction – not saved yet", "", "3.2");
  let type = "Revenue";
  main.innerHTML = `
    ${pageHeader("Record Transaction", "Enter a revenue or expense. Fields marked * are required.", "", [["Accounting", "#/accounting"], ["Record Transaction"]])}
    <div id="errors"></div>
    <div class="split-r">
      <section class="card"><div class="card-head"><h2>Transaction details</h2></div><div class="card-body">
        <form id="tx-form" novalidate>
          <div class="field"><span>Transaction type *</span>
            <div class="choices row plain">
              <label class="choice"><input type="radio" name="transactionType" value="Revenue" checked><span><strong>Revenue</strong><small>Money coming in, e.g. daily sales</small></span></label>
              <label class="choice"><input type="radio" name="transactionType" value="Expense"><span><strong>Expense</strong><small>Money going out</small></span></label>
            </div>
          </div>
          <div class="form-grid">
            ${field("amount", "Amount (CAD)", { type: "number", required: true, placeholder: "0.00", attrs: 'min="0.01" step="0.01" inputmode="decimal"' })}
            ${field("date", "Date", { type: "date", value: todayText(), required: true })}
            <div class="wide" id="category-box"></div>
            <div class="wide">${field("description", "Description (optional)", { type: "textarea", placeholder: "e.g. Friday register total" })}</div>
            ${field("source", "Source / paid to (optional)", { placeholder: "e.g. Register" })}
          </div>
          <div class="form-actions"><a class="button" href="#/accounting" style="min-width:90px">Cancel</a><button class="primary" type="submit">Save Transaction</button></div>
        </form>
      </div></section>
      <section class="card"><div class="card-head"><h2>Ledger preview</h2></div><div class="card-body">
        <dl class="preview" id="preview"></dl>
        <p class="note">Nothing is posted to the ledger until you select Save Transaction.</p>
      </div></section>
    </div>`;

  const form = $("#tx-form");
  const renderCategory = (keep) => {
    $("#category-box").innerHTML = field("category", "Category", {
      type: "select",
      required: true,
      value: keep || (type === "Revenue" ? "Daily sales" : ""),
      options: [{ value: "", label: "Select a category" }, ...CATEGORIES[type].map((c) => ({ value: c, label: c }))],
      hint: `${type} categories: ${CATEGORIES[type].join(", ")}`,
    });
  };
  const renderPreview = () => {
    const amount = Number(form.elements.amount.value);
    const valid = amount > 0;
    const signed = type === "Revenue" ? amount : -amount;
    $("#preview").innerHTML = `
      <dt>Current balance</dt><dd>${money(data.summary.currentBalance)}</dd>
      <dt>This transaction</dt><dd class="${valid ? (signed >= 0 ? "pos" : "neg") : ""}">${valid ? signedMoney(signed) : "—"}</dd>
      <dt class="total">Balance after saving</dt><dd class="total">${valid ? money(data.summary.currentBalance + signed) : "—"}</dd>`;
  };
  renderCategory();
  renderPreview();
  form.addEventListener("input", renderPreview);
  form.addEventListener("change", (event) => {
    if (event.target.name === "transactionType") {
      type = event.target.value;
      renderCategory();
      renderPreview();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    $("#errors").innerHTML = "";
    const values = formValues(form);
    const before = monthFigures(data);
    const result = await busy(form.querySelector("button[type=submit]"), () => api("POST", "/accounting/transactions", values));
    if (!result.ok) {
      $("#errors").innerHTML = banner("error", "Transaction not saved", result.message); // 4a
      showFormErrors(form, { fieldErrors: result.fieldErrors || {} });
      const count = Object.keys(result.fieldErrors || {}).length || 1;
      setStatus(`${count} error${count > 1 ? "s" : ""} – nothing saved`, "bad", "3.3");
      return;
    }
    result.transactions.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    const saved = result.transactions.find((t) => t.transactionId === result.transactionId);
    lastSaved = { before, after: monthFigures(result), transaction: saved };
    location.hash = "#/accounting/saved";
  });
}

// ----- 3.4 Confirmation + updated profit and loss -----
function showSaved(main) {
  const { before, after, transaction: t } = lastSaved;
  setStatus("Saved · ledger updated", "ok", "3.4");
  const change = (a, b) => (Math.abs(b - a) < 0.005 ? "—" : signedMoney(b - a));
  const row = (label, key) =>
    `<tr><td><strong>${label}</strong></td><td>${money(before[key])}</td><td>${change(before[key], after[key])}</td><td class="${
      Math.abs(after[key] - before[key]) >= 0.005 ? (after[key] > before[key] ? "pos" : "neg") : "strong"
    }"><strong>${money(after[key])}</strong></td></tr>`;
  main.innerHTML = `
    ${pageHeader("Accounting", "", "", [["Accounting", "#/accounting"], ["Record Transaction"], ["Saved"]])}
    ${banner(
      "success",
      "Transaction saved",
      `${t.transactionType} of ${money(t.amount)} · ${t.category} · ${fmtDate(t.date)} was recorded as ${t.transactionId} and posted to the ledger.`
    )}
    <section class="card"><div class="card-head"><h2>Updated profit and loss – ${monthName(String(t.date).slice(0, 7))} (month to date)</h2></div><div class="card-body">
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Before</th><th>This transaction</th><th>After</th></tr></thead>
        <tbody>${row("Revenue", "revenue")}${row("Expenses", "expenses")}${row("Net profit / loss", "net")}${row("Ledger balance", "balance")}</tbody>
      </table></div>
      <p class="note">Totals update as soon as the transaction is saved.</p>
    </div></section>
    <div class="form-actions" style="justify-content:space-between;margin-top:20px">
      <span class="actions"><a class="button" href="#/accounting/history">View Transaction History</a><a class="button" href="#/accounting/new">Record Another</a></span>
      <a class="button primary" href="#/dashboard">Back to Dashboard</a>
    </div>`;
}

// ----- 3.5 Transaction history (ledger) -----
function showHistory(main, data) {
  // Running balance, oldest first (revenue adds, expenses subtract).
  const oldestFirst = [...data.transactions].reverse();
  const balances = {};
  let running = 0;
  for (const t of oldestFirst) {
    running += t.transactionType === "Revenue" ? t.amount : -t.amount;
    balances[t.transactionId] = Math.round(running * 100) / 100;
  }
  const months = [...new Set(data.transactions.map((t) => String(t.date).slice(0, 7)))].sort().reverse();
  const highlightId = lastSaved?.transaction?.transactionId || null;
  const state = { type: "", month: months[0] || todayText().slice(0, 7), q: "" };

  main.innerHTML = `
    ${pageHeader("Transaction History", "Ledger – all transactions, newest first", "", [["Accounting", "#/accounting"], ["Transaction History"]])}
    <div class="toolbar" style="align-items:end">
      <label class="field" style="width:200px"><span>Type</span><select id="f-type"><option value="">All types</option><option>Revenue</option><option>Expense</option></select></label>
      <label class="field" style="width:200px"><span>Period</span><select id="f-month">${months.map((m) => `<option value="${m}">${esc(monthName(m))}</option>`).join("")}<option value="">All periods</option></select></label>
      <label class="searchbox" style="margin-top:auto"><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input type="search" id="f-q" placeholder="Search description or transaction ID" aria-label="Search transactions"></label>
    </div>
    <div id="history"></div>
    <div style="margin-top:20px"><a class="button" href="#/accounting">Back to Accounting Dashboard</a></div>`;

  const render = () => {
    const q = state.q.toLowerCase();
    const inPeriod = data.transactions.filter((t) => !state.month || String(t.date).startsWith(state.month));
    const rows = inPeriod.filter(
      (t) => (!state.type || t.transactionType === state.type) && (!q || `${t.description} ${t.transactionId} ${t.category}`.toLowerCase().includes(q))
    );
    $("#history").innerHTML = `${transactionsTable(rows, true, highlightId, balances)}
      <div class="table-foot"><span>Showing ${rows.length} of ${inPeriod.length} transactions${state.month ? ` in ${monthName(state.month)}` : ""}${
      highlightId && rows.some((t) => t.transactionId === highlightId) ? " · new transaction highlighted" : ""
    }</span></div>`;
  };
  $("#f-type").addEventListener("change", (e) => ((state.type = e.target.value), render()));
  $("#f-month").addEventListener("change", (e) => ((state.month = e.target.value), render()));
  $("#f-q").addEventListener("input", (e) => ((state.q = e.target.value), render()));
  render();
  const latest = data.transactions[0];
  setStatus(latest ? `${latest.transactionId} recorded ${fmtDate(latest.date)}` : "No transactions yet", "ok", "3.5");
}
