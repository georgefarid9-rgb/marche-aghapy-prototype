// Feature 5 — Employee Management and Scheduling (use case 5).
// Every route drives the <<boundary>> SchedulePage, which asks ScheduleController to
// validate and save. The demo has one Store Owner, so one SchedulePage keeps the
// selected employee, schedule and shift between steps, like a real screen would.

const express = require("express");
const SchedulePage = require("../../pages/SchedulePage");
const { route } = require("./respond");

const router = express.Router();
const page = new SchedulePage();

// What the screen shows after each step.
function state() {
  return {
    ok: !page.errorMessage,
    view: page.view,
    employees: page.employees,
    schedules: page.schedules,
    selectedEmployee: page.selectedEmployee,
    employeeSchedule: page.employeeSchedule,
    selectedSchedule: page.selectedSchedule,
    shiftDetails: page.shiftDetails,
    formData: page.formData,
    requiredFields: page.requiredFields,
    errorMessage: page.errorMessage,
    promptMessage: page.promptMessage,
    confirmationMessage: page.confirmationMessage,
  };
}

// 1-2: open the scheduling dashboard.
router.get(
  "/",
  route(async (req, res) => {
    await page.openSchedulingDashboard();
    res.json(state());
  })
);

// 3-4 (3a): select an employee and show their schedule.
router.post(
  "/employees/:employeeId",
  route(async (req, res) => {
    await page.selectEmployee(req.params.employeeId);
    res.json(state());
  })
);

// 5-6 (5a): select a shift to edit.
router.post(
  "/shifts/:shiftId/select",
  route(async (req, res) => {
    await page.selectShift(req.params.shiftId);
    res.json(state());
  })
);

// 7-10 (6a, 8a): enter new shift information and save.
router.put(
  "/shift",
  route(async (req, res) => {
    const { startTime, endTime, role } = req.body;
    page.enterShiftInformation({ startTime, endTime, role });
    await page.submitShiftChanges();
    res.json(state());
  })
);

router.post(
  "/shift/cancel",
  route(async (req, res) => {
    await page.cancelSelectedShift();
    res.json(state());
  })
);

// Build a schedule, open it, assign shifts, publish.
router.post(
  "/schedules",
  route(async (req, res) => {
    const schedule = await page.buildSchedule({ startDate: req.body.startDate, endDate: req.body.endDate });
    if (schedule) {
      await page.openSchedule(schedule.scheduleId);
      page.confirmationMessage = `Schedule ${schedule.scheduleId} created.`;
    }
    res.json(state());
  })
);

router.get(
  "/schedules/:scheduleId",
  route(async (req, res) => {
    await page.openSchedule(req.params.scheduleId);
    res.json(state());
  })
);

router.post(
  "/schedules/:scheduleId/shifts",
  route(async (req, res) => {
    if (!page.selectedSchedule || page.selectedSchedule.scheduleId !== req.params.scheduleId) {
      await page.openSchedule(req.params.scheduleId);
    }
    const { employeeId, shiftDate, startTime, endTime, role } = req.body;
    await page.assignShift({ employeeId, shiftDate, startTime, endTime, role });
    res.json(state());
  })
);

router.post(
  "/schedules/:scheduleId/publish",
  route(async (req, res) => {
    if (!page.selectedSchedule || page.selectedSchedule.scheduleId !== req.params.scheduleId) {
      await page.openSchedule(req.params.scheduleId);
    }
    await page.publishSchedule();
    res.json(state());
  })
);

// Employee actor: View Schedule (published shifts only).
router.get(
  "/my/:employeeId",
  route(async (req, res) => {
    await page.viewMySchedule(req.params.employeeId);
    res.json(state());
  })
);

module.exports = router;
