const { Store, StoreOwner, Schedule, EmployeeShift } = require("../models");
const generateId = require("../utils/generateId");

// Feature 5 – Employee Management and Scheduling (Prototype 2)
//
// <<controller>> ScheduleController sits between SchedulePage (what the user sees)
// and the problem-domain classes. Each method makes the calls in the same order as
// the Feature 5 sequence diagrams:
//   listEmployees() -> findEmployee(employeeId) -> viewSchedule() -> findShift(shiftId)
//   -> editShift(aShift) -> updateShift(startTime, endTime) -> validate() -> isValid
//   -> [isValid = true]: save()
//
// Results are returned to the page. Problems are reported in lastError (and
// missingFields for alternate flow 6a) instead of being thrown, so the page can show
// the right message.

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

// "9:00" is not accepted; "09:00" becomes "09:00:00" (the format stored in the database).
function normaliseTime(value) {
  const text = String(value).trim();
  return text.length === 5 ? `${text}:00` : text;
}

function shortTime(value) {
  return String(value).slice(0, 5);
}

class ScheduleController {
  constructor(storeId = "STORE-001") {
    this.storeId = storeId;
    this.store = null;
    this.owner = null;

    this.lastError = null;
    this.lastMessage = null;
    this.missingFields = [];
  }

  resetFeedback() {
    this.lastError = null;
    this.lastMessage = null;
    this.missingFields = [];
  }

  // Load the store and its owner once.
  async loadStore() {
    if (!this.store) {
      this.store = await Store.findByPk(this.storeId, {
        include: [{ model: StoreOwner, as: "owner" }],
      });

      if (!this.store) {
        throw new Error(`Store ${this.storeId} was not found. Run npm run db:setup and npm run db:seed first.`);
      }

      this.owner = this.store.owner;
    }

    return this.store;
  }

  // ----- Checks used before anything is saved -----

  // Alternate flow 6a: shift details missing -> prompt for the required fields.
  checkRequiredFields(data, fields) {
    this.missingFields = fields.filter((field) => isBlank(data[field]));

    if (this.missingFields.length > 0) {
      this.lastError = `Please fill in the required field(s): ${this.missingFields.join(", ")}.`;
      return false;
    }

    return true;
  }

  checkTimeFormat(data, fields) {
    for (const field of fields) {
      if (!TIME_PATTERN.test(String(data[field]).trim())) {
        this.lastError = `${field} must be a time such as 09:00 (24-hour clock).`;
        return false;
      }
    }
    return true;
  }

  checkDateFormat(data, fields) {
    for (const field of fields) {
      if (!DATE_PATTERN.test(String(data[field]).trim())) {
        this.lastError = `${field} must be a date such as 2026-11-23 (YYYY-MM-DD).`;
        return false;
      }
    }
    return true;
  }

  // An employee cannot work two shifts that overlap on the same day.
  async findOverlappingShift(employeeId, shiftDate, startTime, endTime, ignoreShiftId = null) {
    const sameDay = await EmployeeShift.findAll({ where: { employeeId, shiftDate } });

    return (
      sameDay.find(
        (other) =>
          other.shiftId !== ignoreShiftId &&
          other.shiftStatus !== "Cancelled" &&
          other.startTime < endTime &&
          startTime < other.endTime
      ) || null
    );
  }

  // ----- Normal flow (sequence diagram order) -----

  // SD step: listEmployees() : Employee[]
  async retrieveEmployees() {
    const store = await this.loadStore();
    return store.listEmployees();
  }

  // Schedules of the store, newest first (shown on the scheduling dashboard).
  async retrieveSchedules() {
    const store = await this.loadStore();
    return store.getSchedules({ order: [["startDate", "DESC"]] });
  }

  async retrieveSchedule(scheduleId) {
    this.resetFeedback();
    const store = await this.loadStore();
    const [schedule] = await store.getSchedules({ where: { scheduleId } });

    if (!schedule) {
      this.lastError = `Schedule ${scheduleId} was not found.`;
      return null;
    }

    return schedule;
  }

  // SD step: findEmployee(employeeId) : Employee
  // Alternate flow 3a: anEmployee = null -> the system displays an error message.
  async retrieveEmployee(employeeId) {
    this.resetFeedback();
    const store = await this.loadStore();

    if (isBlank(employeeId)) {
      this.lastError = "Select an employee from the list.";
      return null;
    }

    const employee = await store.findEmployee(employeeId);

    if (!employee) {
      this.lastError = `Employee ${employeeId} was not found. Select an employee from the list.`;
    }

    return employee;
  }

  // SD step: viewSchedule() : EmployeeShift[]  (the owner sees every shift, including drafts)
  async retrieveEmployeeSchedule(employee) {
    return employee.viewSchedule();
  }

  // SD step: findShift(shiftId) : EmployeeShift
  // Alternate flow 5a: shiftId = null -> the system prompts the owner to choose a shift.
  async retrieveShift(schedule, shiftId) {
    this.resetFeedback();

    if (isBlank(shiftId)) {
      this.lastError = "Choose a shift to edit.";
      return null;
    }

    const shift = await schedule.findShift(shiftId);

    if (!shift) {
      this.lastError = `Shift ${shiftId} is not in schedule ${schedule.scheduleId}. Choose a shift from the schedule.`;
    }

    return shift;
  }

  // SD steps: editShift(aShift) -> updateShift(startTime, endTime) -> validate()
  //           -> isValid -> [isValid = true]: save()
  // data: { startTime, endTime, role (optional) }
  // Returns isValid. Alternate flow 6a (missing details) and sub-flow 8a (invalid
  // details) return false with lastError set; nothing is saved.
  async submitShiftChanges(schedule, shift, data) {
    this.resetFeedback();
    await this.loadStore();

    if (!this.checkRequiredFields(data, ["startTime", "endTime"])) return false;
    if (!this.checkTimeFormat(data, ["startTime", "endTime"])) return false;

    if (shift.shiftStatus === "Cancelled" || shift.shiftStatus === "Completed") {
      this.lastError = `Shift ${shift.shiftId} is ${shift.shiftStatus.toLowerCase()} and cannot be edited.`;
      return false;
    }

    const startTime = normaliseTime(data.startTime);
    const endTime = normaliseTime(data.endTime);

    // Only look for overlaps when the times themselves make sense;
    // otherwise validate() reports the problem (sub-flow 8a).
    if (startTime < endTime) {
      const overlap = await this.findOverlappingShift(
        shift.employeeId,
        shift.shiftDate,
        startTime,
        endTime,
        shift.shiftId
      );

      if (overlap) {
        this.lastError =
          `Employee ${shift.employeeId} already works shift ${overlap.shiftId} from ` +
          `${shortTime(overlap.startTime)} to ${shortTime(overlap.endTime)} on ${overlap.shiftDate}.`;
        return false;
      }
    }

    const oldRole = shift.role;
    if (data.role !== undefined) {
      shift.role = isBlank(data.role) ? null : String(data.role).trim();
    }

    shift.startTime = startTime;
    shift.endTime = endTime;

    const isValid = await this.owner.editShift(shift);

    if (!isValid) {
      shift.role = oldRole;
      this.lastError = shift.validationMessage;
      return false;
    }

    await schedule.save();

    this.lastMessage =
      `Shift ${shift.shiftId} on ${shift.shiftDate} updated to ` +
      `${shortTime(shift.startTime)}-${shortTime(shift.endTime)}` +
      `${shift.role ? ` (${shift.role})` : ""}. Schedule ${schedule.scheduleId} saved.`;
    return true;
  }

  // ----- Building and publishing the schedule -----

  // Create a new schedule period for the store. data: { startDate, endDate, scheduleId (optional) }
  async createSchedule(data) {
    this.resetFeedback();
    const store = await this.loadStore();

    if (!this.checkRequiredFields(data, ["startDate", "endDate"])) return null;
    if (!this.checkDateFormat(data, ["startDate", "endDate"])) return null;

    const scheduleId = isBlank(data.scheduleId) ? generateId("SCH") : String(data.scheduleId).trim();

    if (await Schedule.findByPk(scheduleId)) {
      this.lastError = `Schedule ${scheduleId} already exists.`;
      return null;
    }

    const schedule = Schedule.build({
      scheduleId,
      startDate: String(data.startDate).trim(),
      endDate: String(data.endDate).trim(),
      storeId: store.storeId,
    });

    try {
      await schedule.validate();
      await schedule.save();
    } catch (error) {
      this.lastError = error.message;
      return null;
    }

    this.lastMessage = `Schedule ${schedule.scheduleId} created for ${schedule.startDate} to ${schedule.endDate}.`;
    return schedule;
  }

  // Assign a shift to an employee in a schedule.
  // data: { employeeId, shiftDate, startTime, endTime, role (optional), shiftId (optional) }
  // The role defaults to the employee's own role.
  async assignShift(schedule, data) {
    this.resetFeedback();
    const store = await this.loadStore();

    if (!this.checkRequiredFields(data, ["employeeId", "shiftDate", "startTime", "endTime"])) return null;
    if (!this.checkDateFormat(data, ["shiftDate"])) return null;
    if (!this.checkTimeFormat(data, ["startTime", "endTime"])) return null;

    const employee = await store.findEmployee(String(data.employeeId).trim());
    if (!employee) {
      this.lastError = `Employee ${data.employeeId} was not found. Select an employee from the list.`;
      return null;
    }

    const shiftDate = String(data.shiftDate).trim();
    const startTime = normaliseTime(data.startTime);
    const endTime = normaliseTime(data.endTime);

    if (startTime < endTime) {
      const overlap = await this.findOverlappingShift(employee.employeeId, shiftDate, startTime, endTime);
      if (overlap) {
        this.lastError =
          `Employee ${employee.employeeId} already works shift ${overlap.shiftId} from ` +
          `${shortTime(overlap.startTime)} to ${shortTime(overlap.endTime)} on ${overlap.shiftDate}.`;
        return null;
      }
    }

    const shiftId = isBlank(data.shiftId) ? generateId("SHIFT") : String(data.shiftId).trim();
    if (await EmployeeShift.findByPk(shiftId)) {
      this.lastError = `Shift ${shiftId} already exists.`;
      return null;
    }

    const shift = EmployeeShift.build({
      shiftId,
      shiftDate,
      startTime,
      endTime,
      role: isBlank(data.role) ? employee.role : String(data.role).trim(),
      employeeId: employee.employeeId,
    });

    try {
      await schedule.addShift(shift);
    } catch (error) {
      this.lastError = error.message;
      return null;
    }

    this.lastMessage =
      `Shift ${shift.shiftId} assigned to ${employee.employeeName} on ${shift.shiftDate}, ` +
      `${shortTime(shift.startTime)}-${shortTime(shift.endTime)} (${shift.role}).`;
    return shift;
  }

  // StoreOwner.publishSchedule(schedule): all valid shifts become visible to employees.
  async publishSchedule(schedule) {
    this.resetFeedback();
    await this.loadStore();

    try {
      await this.owner.publishSchedule(schedule);
    } catch (error) {
      this.lastError = `Schedule ${schedule.scheduleId} was not published: ${error.message}`;
      return false;
    }

    const published = (await schedule.displayShifts()).filter((s) => s.shiftStatus === "Published");
    this.lastMessage = `Schedule ${schedule.scheduleId} published: ${published.length} shift(s) are now visible to employees.`;
    return true;
  }

  // Cancel one shift (it disappears from the employee's schedule).
  async cancelShift(shift) {
    this.resetFeedback();

    const cancelled = await shift.cancelShift();
    if (!cancelled) {
      this.lastError = shift.validationMessage;
      return false;
    }

    this.lastMessage = `Shift ${shift.shiftId} on ${shift.shiftDate} was cancelled.`;
    return true;
  }

  // ----- Employee actor: View Schedule -----

  // An employee only sees shifts after the owner has published them.
  async retrievePublishedSchedule(employeeId) {
    const employee = await this.retrieveEmployee(employeeId);
    if (!employee) return null;

    const shifts = await employee.viewSchedule();
    return {
      employee,
      shifts: shifts.filter((s) => EmployeeShift.VISIBLE_TO_EMPLOYEE.includes(s.shiftStatus)),
    };
  }
}

module.exports = ScheduleController;
