// Feature 5 — Employee Management and Scheduling (use case 5).
// Every route drives the <<boundary>> SchedulePage, which asks ScheduleController to
// validate and save.
//
// Each request builds its own SchedulePage and names everything it works on in the URL:
// the employee and shift being edited or cancelled, or the schedule being assigned to or
// published. Nothing is remembered between requests, so two browser tabs can never edit,
// cancel or publish each other's selection. Before any change the page re-selects the
// employee, checks that the shift is in that employee's schedule (and in the named
// schedule), or opens the schedule; if that fails, nothing is changed.

const express = require("express");
const SchedulePage = require("../../pages/SchedulePage");
const { route } = require("./respond");

const router = express.Router();

// HTTP status for what the page shows: a lookup that failed is 404, a prompt or a rule
// that was broken is 400, anything else is 200.
const NOT_FOUND_VIEWS = ["EMPLOYEE_NOT_FOUND", "ERROR"];
const INVALID_VIEWS = ["CHOOSE_SHIFT", "MISSING_DETAILS", "CORRECTION_REQUIRED"];

function statusOf(page) {
  if (NOT_FOUND_VIEWS.includes(page.view)) return 404;
  if (INVALID_VIEWS.includes(page.view)) return 400;
  return 200;
}

// What the screen shows after each step. The employee and schedule lists are always
// included, so the screen keeps them even after an error.
async function send(res, page, status = statusOf(page)) {
  const [employees, schedules] = await Promise.all([
    page.controller.retrieveEmployees(),
    page.controller.retrieveSchedules(),
  ]);
  res.status(status).json({
    ok: status < 400,
    view: page.view,
    employees: employees.map((e) => ({ employeeId: e.employeeId, employeeName: e.employeeName, role: e.role })),
    schedules: schedules.map((s) => ({ scheduleId: s.scheduleId, startDate: s.startDate, endDate: s.endDate })),
    selectedEmployee: page.selectedEmployee,
    employeeSchedule: page.employeeSchedule,
    selectedSchedule: page.selectedSchedule,
    shiftDetails: page.shiftDetails,
    formData: page.formData,
    requiredFields: page.requiredFields,
    errorMessage: page.errorMessage,
    promptMessage: page.promptMessage,
    confirmationMessage: page.confirmationMessage,
    message: page.errorMessage || page.promptMessage || page.confirmationMessage || null,
  });
}

// Select the employee, then the shift, checking that the shift is in that employee's
// schedule and, when the request names one, in that schedule. Returns false (and the
// page holds the reason) when anything does not match.
async function selectEmployeeShift(page, { employeeId, shiftId, scheduleId }) {
  if (!(await page.selectEmployee(employeeId))) return false;
  if (!(await page.selectShift(shiftId))) return false;
  if (scheduleId && page.shiftDetails.scheduleId !== scheduleId) {
    page.shiftDetails = null;
    page.promptMessage = `Shift ${shiftId} is not in schedule ${scheduleId}. Choose a shift from the list.`;
    page.view = "CHOOSE_SHIFT";
    return false;
  }
  return true;
}

// 1-2: open the scheduling dashboard.
router.get(
  "/",
  route(async (req, res) => {
    const page = new SchedulePage();
    await page.openSchedulingDashboard();
    await send(res, page);
  })
);

// 3-4 (3a): select an employee and show their schedule.
router.post(
  "/employees/:employeeId",
  route(async (req, res) => {
    const page = new SchedulePage();
    await page.selectEmployee(req.params.employeeId);
    await send(res, page);
  })
);

// 5-6 (5a): select one of this employee's shifts to edit.
router.post(
  "/employees/:employeeId/shifts/:shiftId/select",
  route(async (req, res) => {
    const page = new SchedulePage();
    await selectEmployeeShift(page, { ...req.params, scheduleId: req.body?.scheduleId });
    await send(res, page);
  })
);

// 7-10 (6a, 8a): enter new shift information for this employee's shift and save.
router.put(
  "/employees/:employeeId/shifts/:shiftId",
  route(async (req, res) => {
    const page = new SchedulePage();
    if (!(await selectEmployeeShift(page, { ...req.params, scheduleId: req.body?.scheduleId }))) {
      await send(res, page);
      return;
    }
    const { startTime, endTime, role } = req.body || {};
    page.enterShiftInformation({ startTime, endTime, role });
    await page.submitShiftChanges();
    await send(res, page);
  })
);

// Cancel this employee's shift.
router.post(
  "/employees/:employeeId/shifts/:shiftId/cancel",
  route(async (req, res) => {
    const page = new SchedulePage();
    if (!(await selectEmployeeShift(page, { ...req.params, scheduleId: req.body?.scheduleId }))) {
      await send(res, page);
      return;
    }
    await page.cancelSelectedShift();
    await send(res, page);
  })
);

// Build a schedule and open it. The answer holds the new schedule (selectedSchedule),
// so the screen does not need to ask for it again.
router.post(
  "/schedules",
  route(async (req, res) => {
    const page = new SchedulePage();
    const schedule = await page.buildSchedule({ startDate: req.body?.startDate, endDate: req.body?.endDate });
    if (!schedule) {
      await send(res, page);
      return;
    }
    await page.openSchedule(schedule.scheduleId);
    page.confirmationMessage = `Schedule ${schedule.scheduleId} created. Assign shifts, then publish it.`;
    page.view = "SCHEDULE_CREATED";
    await send(res, page, 201);
  })
);

router.get(
  "/schedules/:scheduleId",
  route(async (req, res) => {
    const page = new SchedulePage();
    await page.openSchedule(req.params.scheduleId);
    await send(res, page);
  })
);

// Assign a shift in this schedule. Stops if the schedule cannot be opened.
router.post(
  "/schedules/:scheduleId/shifts",
  route(async (req, res) => {
    const page = new SchedulePage();
    if (!(await page.openSchedule(req.params.scheduleId))) {
      await send(res, page);
      return;
    }
    const { employeeId, shiftDate, startTime, endTime, role } = req.body || {};
    await page.assignShift({ employeeId, shiftDate, startTime, endTime, role });
    await send(res, page);
  })
);

// Publish this schedule. Stops if the schedule cannot be opened.
router.post(
  "/schedules/:scheduleId/publish",
  route(async (req, res) => {
    const page = new SchedulePage();
    if (!(await page.openSchedule(req.params.scheduleId))) {
      await send(res, page);
      return;
    }
    await page.publishSchedule();
    await send(res, page);
  })
);

// Employee actor: View Schedule (published shifts only).
router.get(
  "/my/:employeeId",
  route(async (req, res) => {
    const page = new SchedulePage();
    await page.viewMySchedule(req.params.employeeId);
    await send(res, page);
  })
);

module.exports = router;
