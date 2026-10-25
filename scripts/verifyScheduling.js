const assert = require("node:assert/strict");
const sequelize = require("../src/database");

const {
  StoreOwner,
  Store,
  Employee,
  Schedule,
  EmployeeShift,
} = require("../src/models");

// Shifts this script creates. They are always removed at the end.
const TEST_SHIFT_IDS = ["SHIFT-003", "SHIFT-BAD", "SHIFT-OUT"];

function printShifts(title, shifts) {
  console.log(`\n${title}`);
  for (const s of shifts) {
    console.log(
      `  ${s.shiftId}  ${s.shiftDate}  ${s.startTime}-${s.endTime}  ${s.shiftStatus}  (employee ${s.employeeId})`
    );
  }
}

// Save the current shifts so they can be put back after the test.
async function snapshotShifts(scheduleId) {
  const shifts = await EmployeeShift.findAll({ where: { scheduleId } });
  return shifts.map((s) => s.get({ plain: true }));
}

// Remove test shifts and put the original shifts back exactly as they were.
async function restoreShifts(snapshot) {
  await EmployeeShift.destroy({ where: { shiftId: TEST_SHIFT_IDS } });

  for (const original of snapshot) {
    await EmployeeShift.update(original, {
      where: { shiftId: original.shiftId },
    });
  }
}

async function verifyScheduling() {
  let snapshot = null;

  try {
    await sequelize.authenticate();

    // Remove test shifts left over from an earlier run of this script.
    await EmployeeShift.destroy({ where: { shiftId: TEST_SHIFT_IDS } });

    // 1. The sample store exists with its owner, employees and schedule.
    const store = await Store.findOne({
      where: { storeId: "STORE-001" },
      include: [
        { model: StoreOwner, as: "owner" },
        { model: Employee, as: "employees" },
        {
          model: Schedule,
          as: "schedules",
          include: [{ model: EmployeeShift, as: "shifts" }],
        },
      ],
    });

    assert.ok(store, "STORE-001 was not found. Run npm run db:setup and npm run db:seed first.");
    assert.ok(store.owner, "Store is missing its StoreOwner (owns).");
    assert.equal(store.owner.ownerId, "OWN-001");

    const employeeIds = store.employees.map((e) => e.employeeId);
    for (const id of ["EMP-001", "EMP-002"]) {
      assert.ok(employeeIds.includes(id), `Store does not employ ${id} (employs).`);
    }
    for (const e of store.employees) {
      assert.ok(e.role, `Employee ${e.employeeId} has no role.`);
    }

    const schedule = store.schedules.find((s) => s.scheduleId === "SCH-001");
    assert.ok(schedule, "Store is missing schedule SCH-001 (has).");
    assert.ok(schedule.shifts.length >= 2, "SCH-001 should contain the 2 sample shifts.");
    console.log("Store, owner, employees and schedule found.");

    // Everything below changes data, so save the shifts first.
    snapshot = await snapshotShifts("SCH-001");
    const startingCount = snapshot.length;

    const owner = store.owner;
    const cashier = await Employee.findByPk("EMP-001");

    // 2. Schedule.addShift() adds a valid shift to the schedule.
    await schedule.addShift(
      EmployeeShift.build({
        shiftId: "SHIFT-003",
        shiftDate: "2026-11-03",
        startTime: "09:00:00",
        endTime: "17:00:00",
        employeeId: "EMP-001",
      })
    );
    const added = await EmployeeShift.findByPk("SHIFT-003");
    assert.ok(added, "addShift() did not save SHIFT-003.");
    assert.equal(added.scheduleId, "SCH-001");
    assert.equal((await schedule.displayShifts()).length, startingCount + 1);
    console.log("addShift(): SHIFT-003 added to SCH-001.");

    // 3. EmployeeShift.validate() rejects an end time before the start time.
    await assert.rejects(
      schedule.addShift(
        EmployeeShift.build({
          shiftId: "SHIFT-BAD",
          shiftDate: "2026-11-04",
          startTime: "18:00:00",
          endTime: "10:00:00",
          employeeId: "EMP-002",
        })
      ),
      /must be after start time/
    );
    assert.equal(await EmployeeShift.findByPk("SHIFT-BAD"), null, "Invalid shift was saved.");
    console.log("validate(): shift ending before it starts was rejected.");

    // 4. Schedule.addShift() rejects a shift outside the schedule period.
    await assert.rejects(
      schedule.addShift(
        EmployeeShift.build({
          shiftId: "SHIFT-OUT",
          shiftDate: "2026-12-01",
          startTime: "09:00:00",
          endTime: "17:00:00",
          employeeId: "EMP-002",
        })
      ),
      /outside the schedule period/
    );
    assert.equal(await EmployeeShift.findByPk("SHIFT-OUT"), null, "Out-of-period shift was saved.");
    console.log("addShift(): shift outside the schedule period was rejected.");

    // 5. StoreOwner.editShift() changes a shift's hours.
    await owner.editShift(await EmployeeShift.findByPk("SHIFT-002"), "13:00:00", "21:00:00");
    const edited = await EmployeeShift.findByPk("SHIFT-002");
    assert.equal(edited.startTime, "13:00:00");
    assert.equal(edited.endTime, "21:00:00");
    console.log("editShift(): SHIFT-002 changed to 13:00-21:00.");

    // 6. StoreOwner.publishSchedule() publishes every shift in the schedule.
    await owner.publishSchedule(schedule);
    const published = await schedule.displayShifts();
    assert.ok(
      published.every((s) => s.shiftStatus === "Published"),
      "publishSchedule() left a shift unpublished."
    );
    printShifts("displayShifts() after publishSchedule():", published);

    // 7. Employee.viewSchedule() returns only that employee's shifts.
    const ownShifts = await cashier.viewSchedule();
    assert.ok(ownShifts.length > 0, "EMP-001 has no shifts.");
    assert.ok(
      ownShifts.every((s) => s.employeeId === "EMP-001"),
      "viewSchedule() returned another employee's shift."
    );
    assert.ok(ownShifts.some((s) => s.shiftId === "SHIFT-003"), "viewSchedule() is missing SHIFT-003.");
    printShifts("viewSchedule() for EMP-001:", ownShifts);

    // 8. Put the sample data back and check nothing was left changed.
    await restoreShifts(snapshot);
    const restored = await snapshotShifts("SCH-001");
    assert.deepEqual(
      restored.sort((a, b) => a.shiftId.localeCompare(b.shiftId)),
      snapshot.sort((a, b) => a.shiftId.localeCompare(b.shiftId)),
      "Sample shifts were not restored."
    );
    snapshot = null;
    console.log("\nSample shifts restored to their original values.");

    console.log("\nScheduling verification successful.");
  } catch (error) {
    console.error("\nScheduling verification failed:");
    console.error(error.message);

    // Tell Node.js and automated tests that verification failed.
    process.exitCode = 1;
  } finally {
    // If a check failed part-way, still put the sample data back.
    if (snapshot) {
      try {
        await restoreShifts(snapshot);
        console.error("Sample shifts restored after the failure.");
      } catch (restoreError) {
        console.error(`Could not restore sample shifts: ${restoreError.message}`);
        process.exitCode = 1;
      }
    }
    await sequelize.close();
  }
}

verifyScheduling();
