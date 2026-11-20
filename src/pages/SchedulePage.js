const ScheduleController = require("../controllers/ScheduleController");

// Feature 5 – Employee Management and Scheduling (Prototype 2)
//
// <<boundary>> SchedulePage holds what the scheduling screen would show and walks
// through Use Case 05 "Manage Employee Schedule" step by step. It never talks to the
// database directly; it asks ScheduleController, which calls the domain classes in the
// order shown in the sequence diagrams.
//
// Use case steps (normal flow):
//   1. User opens the scheduling dashboard.            -> openSchedulingDashboard()
//   2. System displays employees and schedules.        -> (part of step 1)
//   3. User selects an employee.                       -> selectEmployee(employeeId)
//   4. System includes View Schedule and displays the employee's current schedule.
//                                                      -> displayEmployeeSchedule()
//   5. User selects a date or shift to modify.         -> selectShift(shiftId)
//   6. System displays the shift details for editing.  -> displayShiftDetails()
//   7. User enters new shift information.              -> enterShiftInformation(data)
//   8. System validates the entered shift information. -> submitShiftChanges()
//  10. System saves the updated schedule and displays a confirmation message.
// Alternate flows: 3a employee not found, 5a no shift selected, 6a missing shift
// details, 8a invalid shift details (the owner corrects them and submits again).
// Also: build a schedule, assign shifts, publish, cancel a shift, and the employee's
// own View Schedule (published shifts only).

function shortTime(value) {
  return value ? String(value).slice(0, 5) : "";
}

function describeShift(shift) {
  return {
    shiftId: shift.shiftId,
    scheduleId: shift.scheduleId,
    employeeId: shift.employeeId,
    shiftDate: shift.shiftDate,
    startTime: shortTime(shift.startTime),
    endTime: shortTime(shift.endTime),
    role: shift.role ?? null,
    shiftStatus: shift.shiftStatus,
  };
}

class SchedulePage {
  constructor(controller = new ScheduleController()) {
    this.controller = controller;

    // Information shown on the screen.
    this.employees = [];
    this.schedules = [];
    this.selectedEmployee = null;
    this.employeeSchedule = [];
    this.selectedSchedule = null;
    this.shiftDetails = null;

    // Data entered in the edit form.
    this.formData = {};
    this.requiredFields = [];

    // Feedback shown to the user.
    this.errorMessage = null;
    this.promptMessage = null;
    this.confirmationMessage = null;

    // Current screen.
    this.view = "IDLE";

    // Objects kept between steps (not shown).
    this._employee = null;
    this._schedule = null;
    this._shift = null;
  }

  clearMessages() {
    this.errorMessage = null;
    this.promptMessage = null;
    this.confirmationMessage = null;
  }

  // ----- Normal flow -----

  // 1-2. Open the scheduling dashboard: list the employees and the schedules.
  async openSchedulingDashboard() {
    this.clearMessages();

    const employees = await this.controller.retrieveEmployees();
    this.employees = employees.map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      role: e.role,
    }));

    const schedules = await this.controller.retrieveSchedules();
    this.schedules = schedules.map((s) => ({
      scheduleId: s.scheduleId,
      startDate: s.startDate,
      endDate: s.endDate,
    }));

    this.selectedEmployee = null;
    this.employeeSchedule = [];
    this.shiftDetails = null;
    this._employee = null;
    this._shift = null;
    this.view = "DASHBOARD";
  }

  // 3. Select an employee. Alternate flow 3a: not found -> error message.
  async selectEmployee(employeeId) {
    this.clearMessages();

    const employee = await this.controller.retrieveEmployee(employeeId);
    if (!employee) {
      this.errorMessage = this.controller.lastError;
      this.selectedEmployee = null;
      this.employeeSchedule = [];
      this.view = "EMPLOYEE_NOT_FOUND";
      return false;
    }

    this._employee = employee;
    this.selectedEmployee = {
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      role: employee.role,
    };

    await this.displayEmployeeSchedule();
    return true;
  }

  // 4. Include View Schedule: show the selected employee's current schedule.
  async displayEmployeeSchedule() {
    const shifts = await this.controller.retrieveEmployeeSchedule(this._employee);
    this.employeeSchedule = shifts.map(describeShift);
    this.view = "EMPLOYEE_SCHEDULE";
  }

  // 5. Select a shift to modify. Alternate flow 5a: none selected -> prompt.
  async selectShift(shiftId) {
    this.clearMessages();

    const listed = this.employeeSchedule.find((s) => s.shiftId === shiftId);
    if (!shiftId || !listed) {
      this.promptMessage = shiftId
        ? `Shift ${shiftId} is not in ${this.selectedEmployee?.employeeName ?? "this employee"}'s schedule. Choose a shift from the list.`
        : "Choose a shift to edit.";
      this.view = "CHOOSE_SHIFT";
      return false;
    }

    const schedule = await this.controller.retrieveSchedule(listed.scheduleId);
    const shift = schedule ? await this.controller.retrieveShift(schedule, shiftId) : null;

    if (!shift) {
      this.promptMessage = this.controller.lastError;
      this.view = "CHOOSE_SHIFT";
      return false;
    }

    this._schedule = schedule;
    this._shift = shift;
    this.selectedSchedule = {
      scheduleId: schedule.scheduleId,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
    };

    this.displayShiftDetails();
    return true;
  }

  // 6. Show the shift details in the edit form.
  displayShiftDetails() {
    this.shiftDetails = describeShift(this._shift);
    this.formData = {
      startTime: this.shiftDetails.startTime,
      endTime: this.shiftDetails.endTime,
      role: this.shiftDetails.role ?? "",
    };
    this.requiredFields = ["startTime", "endTime"];
    this.view = "EDIT_SHIFT";
  }

  // 7. Enter new shift information (start/end time, role).
  enterShiftInformation(data) {
    this.formData = { ...this.formData, ...data };
  }

  // 8-10. Validate, save and confirm.
  // 6a: missing details -> prompt for the required fields.
  // 8a: invalid details -> error; the owner corrects them and submits again.
  async submitShiftChanges() {
    this.clearMessages();

    if (!this._shift) {
      this.promptMessage = "Choose a shift to edit.";
      this.view = "CHOOSE_SHIFT";
      return false;
    }

    this.requiredFields = ["startTime", "endTime"];
    const isValid = await this.controller.submitShiftChanges(this._schedule, this._shift, this.formData);

    if (!isValid) {
      if (this.controller.missingFields.length > 0) {
        this.requiredFields = this.controller.missingFields;
        this.promptMessage = this.controller.lastError;
        this.view = "MISSING_DETAILS";
      } else {
        this.errorMessage = this.controller.lastError;
        this.view = "CORRECTION_REQUIRED";
      }
      return false;
    }

    this.confirmationMessage = this.controller.lastMessage;
    this.shiftDetails = describeShift(this._shift);
    const confirmation = this.confirmationMessage;
    await this.displayEmployeeSchedule();
    this.confirmationMessage = confirmation;
    this.view = "CONFIRMATION";
    return true;
  }

  // ----- Building and publishing a schedule -----

  // Create a new schedule period. data: { startDate, endDate, scheduleId (optional) }
  async buildSchedule(data) {
    this.clearMessages();

    const schedule = await this.controller.createSchedule(data);
    if (!schedule) {
      this.errorMessage = this.controller.lastError;
      this.view = "CORRECTION_REQUIRED";
      return null;
    }

    this._schedule = schedule;
    this.selectedSchedule = {
      scheduleId: schedule.scheduleId,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
    };
    this.confirmationMessage = this.controller.lastMessage;
    this.view = "SCHEDULE_CREATED";
    return schedule;
  }

  // Choose which schedule to work on (assign shifts / publish).
  async openSchedule(scheduleId) {
    this.clearMessages();

    const schedule = await this.controller.retrieveSchedule(scheduleId);
    if (!schedule) {
      this.errorMessage = this.controller.lastError;
      this.view = "ERROR";
      return false;
    }

    this._schedule = schedule;
    this.selectedSchedule = {
      scheduleId: schedule.scheduleId,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      shifts: (await schedule.displayShifts()).map(describeShift),
    };
    this.view = "SCHEDULE";
    return true;
  }

  // Assign a shift in the open schedule.
  // data: { employeeId, shiftDate, startTime, endTime, role (optional), shiftId (optional) }
  async assignShift(data) {
    this.clearMessages();

    if (!this._schedule) {
      this.promptMessage = "Open or build a schedule first.";
      this.view = "ERROR";
      return null;
    }

    const shift = await this.controller.assignShift(this._schedule, data);
    if (!shift) {
      if (this.controller.missingFields.length > 0) {
        this.requiredFields = this.controller.missingFields;
        this.promptMessage = this.controller.lastError;
        this.view = "MISSING_DETAILS";
      } else {
        this.errorMessage = this.controller.lastError;
        this.view = "CORRECTION_REQUIRED";
      }
      return null;
    }

    const message = this.controller.lastMessage;
    await this.openSchedule(this._schedule.scheduleId);
    this.confirmationMessage = message;
    this.view = "SHIFT_ASSIGNED";
    return shift;
  }

  // Publish the open schedule so employees can see it.
  async publishSchedule() {
    this.clearMessages();

    if (!this._schedule) {
      this.promptMessage = "Open or build a schedule first.";
      this.view = "ERROR";
      return false;
    }

    const published = await this.controller.publishSchedule(this._schedule);
    if (!published) {
      this.errorMessage = this.controller.lastError;
      this.view = "CORRECTION_REQUIRED";
      return false;
    }

    const message = this.controller.lastMessage;
    await this.openSchedule(this._schedule.scheduleId);
    this.confirmationMessage = message;
    this.view = "SCHEDULE_PUBLISHED";
    return true;
  }

  // Cancel the selected shift.
  async cancelSelectedShift() {
    this.clearMessages();

    if (!this._shift) {
      this.promptMessage = "Choose a shift to cancel.";
      this.view = "CHOOSE_SHIFT";
      return false;
    }

    const cancelled = await this.controller.cancelShift(this._shift);
    if (!cancelled) {
      this.errorMessage = this.controller.lastError;
      this.view = "CORRECTION_REQUIRED";
      return false;
    }

    const message = this.controller.lastMessage;
    this.shiftDetails = describeShift(this._shift);
    if (this._employee) await this.displayEmployeeSchedule();
    this.confirmationMessage = message;
    this.view = "SHIFT_CANCELLED";
    return true;
  }

  // ----- Employee actor: View Schedule -----

  // The employee sees only published (and completed) shifts.
  async viewMySchedule(employeeId) {
    this.clearMessages();

    const result = await this.controller.retrievePublishedSchedule(employeeId);
    if (!result) {
      this.errorMessage = this.controller.lastError;
      this.employeeSchedule = [];
      this.view = "EMPLOYEE_NOT_FOUND";
      return false;
    }

    this._employee = result.employee;
    this.selectedEmployee = {
      employeeId: result.employee.employeeId,
      employeeName: result.employee.employeeName,
      role: result.employee.role,
    };
    this.employeeSchedule = result.shifts.map(describeShift);
    this.view = "MY_SCHEDULE";
    if (this.employeeSchedule.length === 0) {
      this.promptMessage = "No published shifts yet.";
    }
    return true;
  }

  // ----- Text version of the screen (used by the demo) -----

  render() {
    const lines = [`[${this.view}]`];
    const shiftLine = (s) =>
      `  ${s.shiftId}  ${s.shiftDate}  ${s.startTime}-${s.endTime}  ${(s.role ?? "-").padEnd(11)}  ${s.shiftStatus}`;

    if (this.view === "DASHBOARD") {
      lines.push("Employees:");
      this.employees.forEach((e) => lines.push(`  ${e.employeeId}  ${e.employeeName} (${e.role})`));
      lines.push("Schedules:");
      this.schedules.forEach((s) => lines.push(`  ${s.scheduleId}  ${s.startDate} to ${s.endDate}`));
    }

    if (["EMPLOYEE_SCHEDULE", "CONFIRMATION", "MY_SCHEDULE", "SHIFT_CANCELLED"].includes(this.view) && this.selectedEmployee) {
      lines.push(`Schedule for ${this.selectedEmployee.employeeName} (${this.selectedEmployee.employeeId}):`);
      this.employeeSchedule.forEach((s) => lines.push(shiftLine(s)));
    }

    if (["SCHEDULE", "SHIFT_ASSIGNED", "SCHEDULE_PUBLISHED"].includes(this.view) && this.selectedSchedule) {
      const s = this.selectedSchedule;
      lines.push(`Schedule ${s.scheduleId} (${s.startDate} to ${s.endDate}):`);
      (s.shifts ?? []).forEach((shift) => lines.push(`${shiftLine(shift)}  (employee ${shift.employeeId})`));
    }

    if (["EDIT_SHIFT", "MISSING_DETAILS", "CORRECTION_REQUIRED"].includes(this.view) && this.shiftDetails) {
      const d = this.shiftDetails;
      lines.push(`Editing shift ${d.shiftId} on ${d.shiftDate} (saved: ${d.startTime}-${d.endTime}, ${d.role ?? "no role"})`);
      lines.push(`  Form: start ${this.formData.startTime || "____"}  end ${this.formData.endTime || "____"}  role ${this.formData.role || "____"}`);
      lines.push(`  Required: ${this.requiredFields.join(", ")}`);
    }

    if (this.errorMessage) lines.push(`ERROR: ${this.errorMessage}`);
    if (this.promptMessage) lines.push(`PROMPT: ${this.promptMessage}`);
    if (this.confirmationMessage) lines.push(`CONFIRMED: ${this.confirmationMessage}`);

    return lines.join("\n");
  }
}

module.exports = SchedulePage;
