// Small helpers shared by every page (no framework, no build step).

// Escape text before putting it in HTML.
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Call the server. Always resolves to the JSON body ({ ok, message, ... }).
export async function api(method, url, body) {
  try {
    const response = await fetch(`/api${url}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (data.ok === undefined) data.ok = response.ok;
    return data;
  } catch (error) {
    return { ok: false, message: "The server is not responding. Is `npm run demo` still running?" };
  }
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Read a form into a plain object (checkboxes -> true/false, radios -> the checked value).
export function formValues(form) {
  const values = {};
  for (const element of form.elements) {
    if (!element.name) continue;
    if (element.type === "radio") {
      if (element.checked) values[element.name] = element.value;
      continue;
    }
    values[element.name] = element.type === "checkbox" ? element.checked : element.value;
  }
  return values;
}

// Show field errors under each field ({ field: message }) and an optional message box.
export function showFormErrors(form, result) {
  clearFormErrors(form);
  const errors = result.fieldErrors || {};
  for (const [name, message] of Object.entries(errors)) {
    const input = form.elements[name];
    if (!input) continue;
    const control = input instanceof RadioNodeList ? input[0] : input;
    control.classList.add("invalid");
    control.setAttribute("aria-invalid", "true");
    const note = document.createElement("small");
    note.className = "field-error";
    note.textContent = message;
    control.closest("label, .field")?.appendChild(note);
  }
  const box = form.querySelector(".form-message");
  if (box && result.message && Object.keys(errors).length === 0) {
    box.className = "form-message error";
    box.textContent = result.message;
  }
}

export function clearFormErrors(form) {
  $$(".field-error", form).forEach((note) => note.remove());
  $$(".invalid", form).forEach((input) => {
    input.classList.remove("invalid");
    input.removeAttribute("aria-invalid");
  });
  const box = form.querySelector(".form-message");
  if (box) {
    box.className = "form-message";
    box.textContent = "";
  }
}

// A message banner, as in the wireframes: bold title, then one line of detail.
// kind: success | error | warning | info. action: optional HTML (a button).
export function banner(kind, title, detail = "", action = "") {
  if (!title && !detail) return "";
  const icon = kind === "success" ? '<span class="icon" aria-hidden="true">✓</span>' : "";
  return `<div class="banner ${kind}" role="${kind === "error" ? "alert" : "status"}">${icon}<div>${
    title ? `<strong>${esc(title)}</strong>` : ""
  }${detail ? esc(detail) : ""}</div>${action}</div>`;
}

export function toast(message, kind = "success") {
  const element = $("#toast");
  element.textContent = message;
  element.className = `show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (element.className = ""), 3500);
}

// Bottom status bar: "● text" on the left, the screen's wireframe number on the right.
// kind: ok | warn | bad | "" (grey)
export function setStatus(text, kind = "", screen = "") {
  $("#status-text").innerHTML = `<span class="sdot ${kind}"></span>${esc(text)}`;
  $("#status-screen").textContent = screen ? `Wireframe ${screen}` : "";
}

// Coloured status pill.
const PILL_STYLES = {
  IN_STOCK: "ok", LOW_STOCK: "warn", OUT_OF_STOCK: "bad",
  NOT_EXPIRING_SOON: "ok", NEAR_EXPIRY: "warn", EXPIRED: "bad",
  Active: "ok", Inactive: "muted",
  Revenue: "ok", Expense: "warn",
  Open: "info", "Pending Owner Review": "warn", Resolved: "ok",
  Draft: "muted", Published: "ok", Cancelled: "bad", Completed: "info",
  Pending: "warn", PENDING: "warn", Refunded: "ok", Rejected: "bad",
  Unread: "warn", Read: "muted",
  Good: "ok", Acceptable: "warn", Poor: "bad",
};
const PILL_LABELS = {
  IN_STOCK: "In stock", LOW_STOCK: "Low stock", OUT_OF_STOCK: "Out of stock",
  NOT_EXPIRING_SOON: "OK", NEAR_EXPIRY: "Expiring", EXPIRED: "Expired", PENDING: "Pending",
};
export function pill(value, label) {
  if (value === null || value === undefined || value === "") return "";
  return `<span class="pill ${PILL_STYLES[value] || "muted"}">${esc(label || PILL_LABELS[value] || value)}</span>`;
}

export const money = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });

// +$1,234.50 / −$1,234.50
export const signedMoney = (value) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;

export const dash = (value) => (value === null || value === undefined || value === "" ? "—" : esc(value));

// "YYYY-MM-DD" -> "MM/DD/YYYY" (the wireframes' date format).
export function fmtDate(value) {
  if (!value) return "—";
  const text = String(value).slice(0, 10);
  const [y, m, d] = text.split("-");
  return y && m && d ? `${m}/${d}/${y}` : esc(value);
}

// A timestamp -> "11/20/2026 2:14 PM".
export function fmtDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return `${date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function fmtTime(value = new Date()) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export const todayText = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// A form field. options: { type, value, required, placeholder, hint, options:[{value,label}], attrs }
export function field(name, label, options = {}) {
  const { type = "text", value = "", required = false, placeholder = "", hint = "", attrs = "" } = options;
  const star = required ? " *" : "";
  let control;
  if (type === "select") {
    control = `<select name="${name}" ${required ? "aria-required=\"true\"" : ""} ${attrs}>${(options.options || [])
      .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${esc(o.label)}</option>`)
      .join("")}</select>`;
  } else if (type === "textarea") {
    control = `<textarea name="${name}" rows="3" placeholder="${esc(placeholder)}" ${attrs}>${esc(value)}</textarea>`;
  } else {
    control = `<input type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${
      required ? "aria-required=\"true\"" : ""
    } ${attrs}>`;
  }
  return `<label class="field"><span>${esc(label)}${star}</span>${control}${hint ? `<small class="hint">${esc(hint)}</small>` : ""}</label>`;
}

// A table. columns: [{ label, render(row), num }]
export function table(columns, rows, emptyMessage = "Nothing to show yet.", rowAttrs = () => "") {
  if (!rows || rows.length === 0) return `<p class="empty">${esc(emptyMessage)}</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th${c.num ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr ${rowAttrs(row)}>${columns.map((c) => `<td${c.num ? ' class="num"' : ""}>${c.render(row)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
}

// A key figure card. noteKind: ok | warn | bad
export function stat(label, value, note = "", noteKind = "") {
  return `<div class="stat"><span class="stat-label">${esc(label)}</span><strong>${value}</strong>${
    note ? `<small class="${noteKind}">${esc(note)}</small>` : ""
  }</div>`;
}

// Page heading: breadcrumb, title (+ optional pill), subtitle, actions on the right.
// crumbs: [["Dashboard", "#/dashboard"], ["Reports"]]
export function pageHeader(title, subtitle, actions = "", crumbs = [], titleExtra = "") {
  const trail = crumbs
    .map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : esc(label)))
    .join(" / ");
  return `<div class="page-head"><div>${trail ? `<div class="crumbs">${trail}</div>` : ""}<div class="title-row"><h1>${esc(
    title
  )}</h1>${titleExtra}</div>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}</div><div class="actions">${actions}</div></div>`;
}

// Disable a button while an action runs (avoids double saves).
export async function busy(button, action) {
  if (button) button.disabled = true;
  try {
    return await action();
  } finally {
    if (button) button.disabled = false;
  }
}

// A modal dialog. Returns { root, close }. Escape and the backdrop close it.
export function openModal(innerHtml) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="backdrop"><div class="modal" role="dialog" aria-modal="true">${innerHtml}</div></div>`;
  const close = () => {
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => event.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  $(".backdrop", root).addEventListener("click", (event) => event.target.classList.contains("backdrop") && close());
  $("input, button", root)?.focus();
  return { root, close };
}

// Show `perPage` rows at a time with Prev / Next.
export function paginate(rows, page, perPage = 7) {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(page, 1), pages);
  return { rows: rows.slice((current - 1) * perPage, current * perPage), page: current, pages };
}
