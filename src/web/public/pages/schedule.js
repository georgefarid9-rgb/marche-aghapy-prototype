// Feature 5 — Employee Management and Scheduling (use case 5).
// Every action goes to SchedulePage (through /api/schedule), which returns what the
// screen shows next: lists, the selected employee or schedule, and its messages.

import {
  api, esc, $, $$, banner, pill, table, field, formValues, pageHeader, busy, todayText, setStatus, fmtDate,
} from "../ui.js";

export default async function schedule(main) {
  let view = null; // the last SchedulePage state
  let mode = "employee"; // employee | schedule | my

  main.innerHTML = `
    ${pageHeader("Employee Schedule", "Review an employee's shifts, edit or cancel a shift, build and publish schedules.", "", [["Employee Schedule"]])}
    <div class="split" style="grid-template-columns:minmax(260px,0.7fr) minmax(0,1.6fr)">
      <aside>
        <section class="card"><div class="card-head"><h2>Employees</h2></div><div class="card-body" id="employees"></div></section>
        <section class="card"><div class="card-head"><h2>Schedules</h2><button class="small" id="new-schedule">+ New</button></div><div class="card-body" id="schedules"></div></section>
        <section class="card"><div class="card-head"><div><h2>Employee view</h2><p>What an employee sees (published shifts only).</p></div></div>
          <div class="card-body"><form id="my-form" class="toolbar" style="display:flex;margin:0"><select name="employeeId" id="my-employee" aria-label="Employee"></select><button type="submit">View</button></form></div></section>
      </aside>
      <section class="card" id="panel" style="margin-top:0" aria-live="polite"></section>
    </div>`;

  // Every answer carries the employee and schedule lists. If the server cannot be
  // reached (no lists in the answer), keep the screen as it was and show the error.
  async function act(method, url, body, button) {
    const result = await busy(button, () => api(method, url, body));
    if (!result.employees) {
      view = { ...view, errorMessage: result.message || "The request failed. Please try again.", promptMessage: null, confirmationMessage: null };
    } else {
      view = result;
    }
    render();
    return result;
  }

  function messages() {
    return [
      view.confirmationMessage ? banner("success", view.confirmationMessage) : "",
      view.errorMessage ? banner("error", view.errorMessage) : "",
      view.promptMessage ? banner("info", view.promptMessage) : "",
    ].join("");
  }

  const shiftColumns = (withEmployee, editable) => [
    { label: "Date", render: (s) => fmtDate(s.shiftDate) },
    { label: "Time", render: (s) => `${esc(s.startTime)}–${esc(s.endTime)}` },
    ...(withEmployee ? [{ label: "Employee", render: (s) => esc(nameOf(s.employeeId)) }] : []),
    { label: "Role", render: (s) => (s.role ? esc(s.role) : '<span class="muted">—</span>') },
    { label: "Status", render: (s) => pill(s.shiftStatus) },
    ...(editable ? [{ label: "", render: (s) => (s.shiftStatus === "Cancelled" ? "" : `<button class="small" data-shift="${esc(s.shiftId)}">Edit</button>`) }] : []),
  ];

  // The shift being edited, named by employee and shift ID (never "the last selected one").
  function shiftUrl(d) {
    return `/schedule/employees/${encodeURIComponent(view.selectedEmployee.employeeId)}/shifts/${encodeURIComponent(d.shiftId)}`;
  }

  function nameOf(employeeId) {
    return (view.employees || []).find((e) => e.employeeId === employeeId)?.employeeName || employeeId;
  }

  function render() {
    setStatus(
      view.errorMessage || view.confirmationMessage || view.promptMessage || `${(view.employees || []).length} employees · ${(view.schedules || []).length} schedules`,
      view.errorMessage ? "bad" : view.confirmationMessage ? "ok" : ""
    );
    // Left lists.
    $("#employees").innerHTML = `<ul class="list">${(view.employees || [])
      .map(
        (e) => `<li class="clickable ${mode === "employee" && view.selectedEmployee?.employeeId === e.employeeId ? "selected" : ""}" data-employee="${esc(e.employeeId)}">
          <span><strong>${esc(e.employeeName)}</strong><br><small class="muted">${esc(e.role)} · ${esc(e.employeeId)}</small></span></li>`
      )
      .join("")}</ul>`;
    $("#schedules").innerHTML = `<ul class="list">${(view.schedules || [])
      .map(
        (s) => `<li class="clickable ${mode === "schedule" && view.selectedSchedule?.scheduleId === s.scheduleId ? "selected" : ""}" data-schedule="${esc(s.scheduleId)}">
          <span><strong>${esc(s.scheduleId)}</strong><br><small class="muted">${fmtDate(s.startDate)} to ${fmtDate(s.endDate)}</small></span></li>`
      )
      .join("")}</ul>`;
    const mySelect = $("#my-employee");
    if (!mySelect.options.length) {
      mySelect.innerHTML = (view.employees || []).map((e) => `<option value="${esc(e.employeeId)}">${esc(e.employeeName)}</option>`).join("");
    }
    $$("[data-employee]").forEach((li) =>
      li.addEventListener("click", () => {
        mode = "employee";
        act("POST", `/schedule/employees/${encodeURIComponent(li.dataset.employee)}`);
      })
    );
    $$("[data-schedule]").forEach((li) =>
      li.addEventListener("click", () => {
        mode = "schedule";
        act("GET", `/schedule/schedules/${encodeURIComponent(li.dataset.schedule)}`);
      })
    );

    const panel = $("#panel");
    const v = view.view;

    // Edit a shift (steps 6-8, 6a, 8a).
    if (["EDIT_SHIFT", "MISSING_DETAILS", "CORRECTION_REQUIRED"].includes(v) && view.shiftDetails && mode === "employee") {
      const d = view.shiftDetails;
      panel.innerHTML = `
        <div class="card-head"><div><h2>Edit shift ${esc(d.shiftId)}</h2><p>${esc(view.selectedEmployee?.employeeName || "")} · ${fmtDate(d.shiftDate)} · saved ${esc(d.startTime)}–${esc(d.endTime)}</p></div>${pill(d.shiftStatus)}</div>
        <div class="card-body">
          ${messages()}
          <form id="shift-form" novalidate>
            <div class="form-grid">
              ${field("startTime", "Start time", { type: "time", value: view.formData.startTime || "", required: true })}
              ${field("endTime", "End time", { type: "time", value: view.formData.endTime || "", required: true })}
              <div class="wide">${field("role", "Role for this shift", { value: view.formData.role || "", placeholder: "e.g. Cashier" })}</div>
            </div>
            <div class="form-actions">
              <button type="button" class="danger" id="cancel-shift">Cancel shift</button>
              <button type="button" id="back">Back</button>
              <button class="primary" type="submit">Save shift</button>
            </div>
          </form>
        </div>`;
      for (const name of view.requiredFields || []) {
        if (v === "MISSING_DETAILS") $("#shift-form").elements[name]?.classList.add("invalid");
      }
      $("#shift-form").addEventListener("submit", (event) => {
        event.preventDefault();
        act("PUT", shiftUrl(d), { ...formValues(event.target), scheduleId: d.scheduleId }, event.target.querySelector("button[type=submit]"));
      });
      $("#cancel-shift").addEventListener("click", (event) => act("POST", `${shiftUrl(d)}/cancel`, { scheduleId: d.scheduleId }, event.currentTarget));
      $("#back").addEventListener("click", () => act("POST", `/schedule/employees/${encodeURIComponent(view.selectedEmployee.employeeId)}`));
      return;
    }

    // An employee's schedule (steps 3-4, 3a, confirmation).
    if (mode === "employee" && view.selectedEmployee) {
      panel.innerHTML = `
        <div class="card-head"><div><h2>${esc(view.selectedEmployee.employeeName)}</h2><p>${esc(view.selectedEmployee.role)} · ${esc(view.selectedEmployee.employeeId)}</p></div></div>
        <div class="card-body">${messages()}${table(shiftColumns(false, true), view.employeeSchedule, "No shifts assigned yet.")}</div>`;
      $$("[data-shift]", panel).forEach((button) =>
        button.addEventListener("click", () =>
          act("POST", `/schedule/employees/${encodeURIComponent(view.selectedEmployee.employeeId)}/shifts/${encodeURIComponent(button.dataset.shift)}/select`, null, button)
        )
      );
      return;
    }

    // A schedule: assign shifts and publish.
    if (mode === "schedule" && view.selectedSchedule) {
      const s = view.selectedSchedule;
      const shifts = s.shifts || [];
      const drafts = shifts.filter((x) => x.shiftStatus === "Draft").length;
      panel.innerHTML = `
        <div class="card-head"><div><h2>Schedule ${esc(s.scheduleId)}</h2><p>${fmtDate(s.startDate)} to ${fmtDate(s.endDate)} · ${shifts.length} shift(s), ${drafts} draft</p></div>
          <button class="primary" id="publish" ${drafts === 0 ? "disabled" : ""}>Publish schedule</button></div>
        <div class="card-body">
          ${messages()}
          ${table(shiftColumns(true, false), shifts, "No shifts in this schedule yet.")}
          <form id="assign-form" class="card" style="padding:12px 14px;margin-top:14px;background:#fafbf8" novalidate>
            <h3>Assign a shift</h3>
            <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
              ${field("employeeId", "Employee", { type: "select", options: (view.employees || []).map((e) => ({ value: e.employeeId, label: e.employeeName })) })}
              ${field("shiftDate", "Date", { type: "date", value: s.startDate, required: true, attrs: `min="${esc(s.startDate)}" max="${esc(s.endDate)}"` })}
              ${field("role", "Role", { placeholder: "optional" })}
              ${field("startTime", "Start", { type: "time", value: "09:00", required: true })}
              ${field("endTime", "End", { type: "time", value: "17:00", required: true })}
            </div>
            <div class="form-actions"><button class="primary" type="submit">Assign shift</button></div>
          </form>
        </div>`;
      $("#assign-form").addEventListener("submit", (event) => {
        event.preventDefault();
        act("POST", `/schedule/schedules/${encodeURIComponent(s.scheduleId)}/shifts`, formValues(event.target), event.target.querySelector("button[type=submit]"));
      });
      $("#publish").addEventListener("click", (event) =>
        act("POST", `/schedule/schedules/${encodeURIComponent(s.scheduleId)}/publish`, null, event.currentTarget)
      );
      return;
    }

    // Employee view (published shifts).
    if (mode === "my") {
      panel.innerHTML = `
        <div class="card-head"><div><h2>My schedule — ${esc(view.selectedEmployee?.employeeName || "")}</h2><p>Only published shifts are visible to employees.</p></div></div>
        <div class="card-body">${messages()}${table(shiftColumns(false, false), view.employeeSchedule, "No published shifts yet.")}</div>`;
      return;
    }

    // New schedule form.
    if (mode === "new") {
      panel.innerHTML = `
        <div class="card-head"><h2>New schedule</h2></div>
        <div class="card-body">${messages()}
          <form id="schedule-form" novalidate>
            <div class="form-grid">
              ${field("startDate", "Start date", { type: "date", value: todayText(), required: true })}
              ${field("endDate", "End date", { type: "date", required: true })}
            </div>
            <div class="form-actions"><button class="primary" type="submit">Create schedule</button></div>
          </form></div>`;
      $("#schedule-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const created = await busy(event.target.querySelector("button[type=submit]"), () =>
          api("POST", "/schedule/schedules", formValues(event.target))
        );
        if (!created.employees) {
          view = { ...view, errorMessage: created.message || "The request failed. Please try again." };
        } else {
          view = created; // the answer already holds the new schedule and the updated lists
          if (created.ok && created.selectedSchedule) mode = "schedule";
        }
        render();
      });
      return;
    }

    panel.innerHTML = `<div class="card-head"><h2>Scheduling</h2></div><div class="card-body">${messages()}<p class="muted">Select an employee to see their shifts, or a schedule to assign and publish shifts.</p></div>`;
  }

  $("#new-schedule").addEventListener("click", () => {
    mode = "new";
    view = { ...view, errorMessage: null, promptMessage: null, confirmationMessage: null };
    render();
  });
  $("#my-form").addEventListener("submit", (event) => {
    event.preventDefault();
    mode = "my";
    act("GET", `/schedule/my/${encodeURIComponent(formValues(event.target).employeeId)}`);
  });

  const first = await api("GET", "/schedule");
  view = first.employees ? first : { employees: [], schedules: [], errorMessage: first.message };
  render();
}
