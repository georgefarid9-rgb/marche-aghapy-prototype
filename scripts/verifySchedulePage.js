// Feature 5 (Prototype 2): end-to-end check of SchedulePage + ScheduleController.
// Runs on its own temporary database, so it never changes your real data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-schedule-"));
process.env.SQLITE_PATH = path.join(testDir, "test.sqlite");

const sequelize = require("../src/database");
const { StoreOwner, Store, Employee, Schedule, EmployeeShift } = require("../src/models");
const ScheduleController = require("../src/controllers/ScheduleController");
const SchedulePage = require("../src/pages/SchedulePage");

function step(text) {
  console.log(`OK  ${text}`);
}

async function savedShift(shiftId) {
  return EmployeeShift.findByPk(shiftId);
}

async function run() {
  try {
    await sequelize.sync();

    await StoreOwner.create({ ownerId: "T-OWN", ownerName: "Test Owner", phoneNumber: "514-555-0000", email: "owner@test.ca" });
    await Store.create({ storeId: "T-STORE", storeName: "Test Store", address: "Montréal, QC", ownerId: "T-OWN" });
    await Employee.bulkCreate([
      { employeeId: "T-EMP-1", employeeName: "Ana Cashier", phoneNumber: "514-555-0001", role: "Cashier", storeId: "T-STORE" },
      { employeeId: "T-EMP-2", employeeName: "Ben Stock", phoneNumber: "514-555-0002", role: "Stock Clerk", storeId: "T-STORE" },
    ]);
    await Schedule.create({ scheduleId: "T-SCH-OLD", startDate: "2026-11-16", endDate: "2026-11-22", storeId: "T-STORE" });

    const page = new SchedulePage(new ScheduleController("T-STORE"));

    // ---------- 1-2. Scheduling dashboard ----------
    await page.openSchedulingDashboard();
    assert.equal(page.view, "DASHBOARD");
    assert.deepEqual(page.employees.map((e) => e.employeeId), ["T-EMP-1", "T-EMP-2"]);
    assert.deepEqual(page.schedules.map((s) => s.scheduleId), ["T-SCH-OLD"]);
    step("1-2  Dashboard lists the store's employees and schedules.");

    // ---------- Build a schedule ----------
    assert.equal(await page.buildSchedule({ startDate: "2026-11-23" }), null);
    assert.match(page.errorMessage, /required field\(s\): endDate/);
    step("Build schedule: missing end date is prompted.");

    assert.equal(await page.buildSchedule({ startDate: "2026-11-29", endDate: "2026-11-23" }), null);
    assert.match(page.errorMessage, /must be on or before end date/);
    step("Build schedule: start date after end date is rejected.");

    assert.equal(await page.buildSchedule({ startDate: "23/11/2026", endDate: "2026-11-29" }), null);
    assert.match(page.errorMessage, /YYYY-MM-DD/);
    step("Build schedule: wrong date format is rejected.");

    const built = await page.buildSchedule({ scheduleId: "T-SCH-1", startDate: "2026-11-23", endDate: "2026-11-29" });
    assert.ok(built);
    assert.equal(page.view, "SCHEDULE_CREATED");
    assert.ok(await Schedule.findByPk("T-SCH-1"));
    step("Build schedule: T-SCH-1 created for 2026-11-23 to 2026-11-29.");

    // ---------- Assign shifts ----------
    assert.ok(await page.assignShift({ shiftId: "T-SH-1", employeeId: "T-EMP-1", shiftDate: "2026-11-23", startTime: "09:00", endTime: "17:00" }));
    assert.equal((await savedShift("T-SH-1")).role, "Cashier", "Role should default to the employee's role.");
    assert.ok(await page.assignShift({ shiftId: "T-SH-2", employeeId: "T-EMP-2", shiftDate: "2026-11-23", startTime: "12:00", endTime: "20:00", role: "Receiving" }));
    assert.ok(await page.assignShift({ shiftId: "T-SH-3", employeeId: "T-EMP-1", shiftDate: "2026-11-24", startTime: "08:00", endTime: "12:00" }));
    assert.equal(page.view, "SHIFT_ASSIGNED");
    assert.equal(page.selectedSchedule.shifts.length, 3);
    step("Assign shift: 3 shifts assigned (role defaults to the employee's role).");

    assert.equal(await page.assignShift({ employeeId: "T-EMP-1", shiftDate: "2026-11-23", startTime: "15:00", endTime: "19:00" }), null);
    assert.match(page.errorMessage, /already works shift T-SH-1/);
    step("Assign shift: overlapping shift for the same employee is rejected.");

    assert.equal(await page.assignShift({ employeeId: "T-EMP-1", shiftDate: "2026-12-05", startTime: "09:00", endTime: "17:00" }), null);
    assert.match(page.errorMessage, /outside the schedule period/);
    step("Assign shift: date outside the schedule period is rejected.");

    assert.equal(await page.assignShift({ employeeId: "T-EMP-1", shiftDate: "2026-11-25", endTime: "17:00" }), null);
    assert.equal(page.view, "MISSING_DETAILS");
    assert.deepEqual(page.requiredFields, ["startTime"]);
    step("Assign shift: missing start time is prompted (6a).");

    assert.equal(await page.assignShift({ employeeId: "T-EMP-9", shiftDate: "2026-11-25", startTime: "09:00", endTime: "17:00" }), null);
    assert.match(page.errorMessage, /T-EMP-9 was not found/);
    step("Assign shift: unknown employee is rejected (3a).");

    // ---------- Employee cannot see draft shifts ----------
    await page.viewMySchedule("T-EMP-1");
    assert.equal(page.view, "MY_SCHEDULE");
    assert.equal(page.employeeSchedule.length, 0, "Draft shifts must not be visible to the employee.");
    step("View Schedule (employee): draft shifts are not visible yet.");

    // ---------- 3. Select employee (3a) ----------
    await page.openSchedulingDashboard();
    assert.equal(await page.selectEmployee("T-EMP-9"), false);
    assert.equal(page.view, "EMPLOYEE_NOT_FOUND");
    assert.match(page.errorMessage, /not found/);
    step("3a   Unknown employee shows an error message.");

    assert.equal(await page.selectEmployee("T-EMP-1"), true);
    assert.equal(page.view, "EMPLOYEE_SCHEDULE");
    // 4. View Schedule (the owner also sees draft shifts)
    assert.deepEqual(page.employeeSchedule.map((s) => s.shiftId), ["T-SH-1", "T-SH-3"]);
    step("3-4  Employee selected; their schedule (including drafts) is displayed.");

    // ---------- 5. Select shift (5a) ----------
    assert.equal(await page.selectShift(null), false);
    assert.equal(page.view, "CHOOSE_SHIFT");
    assert.match(page.promptMessage, /Choose a shift/);
    assert.equal(await page.selectShift("T-SH-2"), false, "Another employee's shift must not be selectable here.");
    assert.equal(page.view, "CHOOSE_SHIFT");
    step("5a   No shift / wrong shift prompts the owner to choose a shift.");

    assert.equal(await page.selectShift("T-SH-1"), true);
    // 6. Shift details for editing
    assert.equal(page.view, "EDIT_SHIFT");
    assert.deepEqual(page.formData, { startTime: "09:00", endTime: "17:00", role: "Cashier" });
    step("5-6  Shift T-SH-1 selected; details shown in the edit form.");

    // ---------- 7-10 with 6a and 8a ----------
    page.enterShiftInformation({ startTime: "" });
    assert.equal(await page.submitShiftChanges(), false);
    assert.equal(page.view, "MISSING_DETAILS");
    assert.deepEqual(page.requiredFields, ["startTime"]);
    step("6a   Missing start time prompts for the required field.");

    page.enterShiftInformation({ startTime: "18:00", endTime: "10:00" });
    assert.equal(await page.submitShiftChanges(), false);
    assert.equal(page.view, "CORRECTION_REQUIRED");
    assert.match(page.errorMessage, /must be after start time/);
    let saved = await savedShift("T-SH-1");
    assert.equal(saved.startTime, "09:00:00");
    assert.equal(saved.endTime, "17:00:00");
    step("8a   End before start is rejected (isValid = false); nothing saved.");

    page.enterShiftInformation({ startTime: "25:00", endTime: "26:00" });
    assert.equal(await page.submitShiftChanges(), false);
    assert.match(page.errorMessage, /24-hour clock/);
    step("8a   Impossible time is rejected.");

    // 8a corrected: the owner fixes the shift and submits again.
    page.enterShiftInformation({ startTime: "10:00", endTime: "18:00", role: "Supervisor" });
    assert.equal(await page.submitShiftChanges(), true);
    assert.equal(page.view, "CONFIRMATION");
    assert.match(page.confirmationMessage, /T-SH-1 .* updated to 10:00-18:00 \(Supervisor\)/);
    saved = await savedShift("T-SH-1");
    assert.equal(saved.startTime, "10:00:00");
    assert.equal(saved.endTime, "18:00:00");
    assert.equal(saved.role, "Supervisor");
    step("7-10 Corrected shift is saved and a confirmation message is shown.");

    // ---------- Publish ----------
    assert.equal(await page.openSchedule("T-SCH-1"), true);
    assert.equal(await page.publishSchedule(), true);
    assert.equal(page.view, "SCHEDULE_PUBLISHED");
    assert.ok(page.selectedSchedule.shifts.every((s) => s.shiftStatus === "Published"));
    assert.match(page.confirmationMessage, /3 shift\(s\) are now visible/);
    step("Publish: every shift in T-SCH-1 is published.");

    await page.viewMySchedule("T-EMP-1");
    assert.deepEqual(page.employeeSchedule.map((s) => s.shiftId), ["T-SH-1", "T-SH-3"]);
    assert.equal(page.employeeSchedule[0].startTime, "10:00");
    step("View Schedule (employee): published shifts are now visible.");

    // ---------- Cancel a shift ----------
    await page.selectEmployee("T-EMP-1");
    await page.selectShift("T-SH-3");
    assert.equal(await page.cancelSelectedShift(), true);
    assert.equal(page.view, "SHIFT_CANCELLED");
    assert.equal((await savedShift("T-SH-3")).shiftStatus, "Cancelled");
    assert.equal(await page.cancelSelectedShift(), false);
    assert.match(page.errorMessage, /already cancelled/);
    step("Cancel: T-SH-3 cancelled; cancelling again is refused.");

    await page.selectShift("T-SH-3");
    page.enterShiftInformation({ startTime: "09:00", endTime: "11:00" });
    assert.equal(await page.submitShiftChanges(), false);
    assert.match(page.errorMessage, /cancelled and cannot be edited/);
    step("Cancel: a cancelled shift cannot be edited.");

    await page.viewMySchedule("T-EMP-1");
    assert.deepEqual(page.employeeSchedule.map((s) => s.shiftId), ["T-SH-1"]);
    step("View Schedule (employee): cancelled shift no longer shown.");

    // Republishing keeps the cancelled shift cancelled.
    await page.openSchedule("T-SCH-1");
    await page.publishSchedule();
    assert.equal((await savedShift("T-SH-3")).shiftStatus, "Cancelled");
    step("Publish again: cancelled shift stays cancelled.");

    // ---------- Overlap when editing ----------
    await page.selectEmployee("T-EMP-1");
    await page.selectShift("T-SH-1");
    assert.ok(await page.assignShift({ shiftId: "T-SH-4", employeeId: "T-EMP-1", shiftDate: "2026-11-23", startTime: "18:00", endTime: "22:00" }));
    await page.selectEmployee("T-EMP-1");
    await page.selectShift("T-SH-4");
    page.enterShiftInformation({ startTime: "16:00", endTime: "22:00" });
    assert.equal(await page.submitShiftChanges(), false);
    assert.match(page.errorMessage, /already works shift T-SH-1/);
    assert.equal((await savedShift("T-SH-4")).startTime, "18:00:00");
    step("Edit: moving a shift so it overlaps another shift is rejected.");

    console.log("\nSchedulePage verification successful.");
  } catch (error) {
    console.error("\nSchedulePage verification failed:");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

run();
