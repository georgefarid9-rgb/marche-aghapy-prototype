const sequelize = require("../src/database");

const {
  StoreOwner,
  Store,
  Employee,
  Schedule,
  EmployeeShift,
} = require("../src/models");

function printShifts(title, shifts) {
  console.log(`\n${title}`);
  for (const s of shifts) {
    console.log(
      `  ${s.shiftId}  ${s.shiftDate}  ${s.startTime}-${s.endTime}  ${s.shiftStatus}  (employee ${s.employeeId})`
    );
  }
}

async function verifyScheduling() {
  try {
    await sequelize.authenticate();

    // 1. Read the store with its owner, employees and schedules.
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

    if (!store) {
      console.log("Store was not found. Run npm run db:setup and npm run db:seed first.");
      return;
    }

    console.dir(store.toJSON(), { depth: null });

    const owner = store.owner;
    const schedule = await Schedule.findByPk("SCH-001");
    const cashier = await Employee.findByPk("EMP-001");

    // 2. Schedule.addShift(): add a new shift for the cashier.
    //    (Remove it first so this script can be run more than once.)
    await EmployeeShift.destroy({ where: { shiftId: "SHIFT-003" } });
    const newShift = EmployeeShift.build({
      shiftId: "SHIFT-003",
      shiftDate: "2026-11-03",
      startTime: "09:00:00",
      endTime: "17:00:00",
      employeeId: "EMP-001",
    });
    await schedule.addShift(newShift);
    console.log("\naddShift(): SHIFT-003 added to SCH-001.");

    // 3. EmployeeShift.validate(): an end time before the start time is rejected.
    const badShift = EmployeeShift.build({
      shiftId: "SHIFT-BAD",
      shiftDate: "2026-11-04",
      startTime: "18:00:00",
      endTime: "10:00:00",
      employeeId: "EMP-002",
    });
    try {
      await schedule.addShift(badShift);
      console.log("validate(): ERROR - invalid shift was accepted.");
    } catch (err) {
      console.log(`validate(): invalid shift rejected -> ${err.message}`);
    }

    // 4. StoreOwner.editShift(): the owner changes SHIFT-002's hours.
    const shift2 = await EmployeeShift.findByPk("SHIFT-002");
    await owner.editShift(shift2, "13:00:00", "21:00:00");
    console.log("editShift(): SHIFT-002 changed to 13:00-21:00.");

    // 5. StoreOwner.publishSchedule(): every shift in SCH-001 becomes Published.
    await owner.publishSchedule(schedule);
    printShifts("displayShifts() after publishSchedule():", await schedule.displayShifts());

    // 6. Employee.viewSchedule(): the cashier sees only their own shifts.
    printShifts("viewSchedule() for EMP-001:", await cashier.viewSchedule());

    console.log("\nScheduling verification successful.");
  } catch (error) {
    console.error("Scheduling verification failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

verifyScheduling();
