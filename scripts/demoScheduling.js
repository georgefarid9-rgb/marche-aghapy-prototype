// Feature 5 (Prototype 2) demo: walks through Use Case 05 "Manage Employee Schedule"
// on the SchedulePage and prints what each screen would show.
// Runs on its own temporary database, so it never changes your real data.
//   npm run scheduling:demo
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const demoDir = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-demo-"));
process.env.SQLITE_PATH = path.join(demoDir, "demo.sqlite");

const sequelize = require("../src/database");
const { StoreOwner, Store, Employee, Schedule } = require("../src/models");
const ScheduleController = require("../src/controllers/ScheduleController");
const SchedulePage = require("../src/pages/SchedulePage");

let stepNumber = 0;
function show(title, page) {
  stepNumber += 1;
  console.log(`\n--- ${stepNumber}. ${title} ---`);
  console.log(page.render());
}

async function demo() {
  try {
    await sequelize.sync();

    // Sample store (same names as npm run db:seed).
    await StoreOwner.create({ ownerId: "OWN-001", ownerName: "Store Owner", phoneNumber: "514-555-0100", email: "owner@marcheaghapy.ca" });
    await Store.create({ storeId: "STORE-001", storeName: "Marché Aghapy", address: "Montréal, QC", ownerId: "OWN-001" });
    await Employee.bulkCreate([
      { employeeId: "EMP-001", employeeName: "Cashier One", phoneNumber: "514-555-0101", role: "Cashier", storeId: "STORE-001" },
      { employeeId: "EMP-002", employeeName: "Stock Clerk One", phoneNumber: "514-555-0102", role: "Stock Clerk", storeId: "STORE-001" },
    ]);
    await Schedule.create({ scheduleId: "SCH-001", startDate: "2026-11-02", endDate: "2026-11-08", storeId: "STORE-001" });

    const page = new SchedulePage(new ScheduleController("STORE-001"));

    console.log("FEATURE 5 – MANAGE EMPLOYEE SCHEDULE (Store Owner)");

    await page.openSchedulingDashboard();
    show("Owner opens the scheduling dashboard (steps 1-2)", page);

    await page.buildSchedule({ scheduleId: "SCH-002", startDate: "2026-11-23", endDate: "2026-11-29" });
    show("Owner builds next week's schedule", page);

    await page.assignShift({ shiftId: "SHIFT-101", employeeId: "EMP-001", shiftDate: "2026-11-23", startTime: "09:00", endTime: "17:00" });
    await page.assignShift({ shiftId: "SHIFT-102", employeeId: "EMP-002", shiftDate: "2026-11-23", startTime: "12:00", endTime: "20:00" });
    await page.assignShift({ shiftId: "SHIFT-103", employeeId: "EMP-001", shiftDate: "2026-11-24", startTime: "08:00", endTime: "12:00" });
    show("Owner assigns shifts to employees", page);

    await page.assignShift({ employeeId: "EMP-001", shiftDate: "2026-11-23", startTime: "15:00", endTime: "19:00" });
    show("Owner tries to give Cashier One two overlapping shifts (rejected)", page);

    await page.viewMySchedule("EMP-001");
    show("Cashier One looks at their schedule before it is published", page);

    await page.openSchedulingDashboard();
    await page.selectEmployee("EMP-999");
    show("Owner selects an employee who does not exist (alternate flow 3a)", page);

    await page.selectEmployee("EMP-001");
    show("Owner selects Cashier One; View Schedule is included (steps 3-4)", page);

    await page.selectShift(null);
    show("Owner continues without choosing a shift (alternate flow 5a)", page);

    await page.selectShift("SHIFT-101");
    show("Owner selects SHIFT-101; details shown for editing (steps 5-6)", page);

    page.enterShiftInformation({ startTime: "", endTime: "18:00" });
    await page.submitShiftChanges();
    show("Owner leaves the start time empty (alternate flow 6a)", page);

    page.enterShiftInformation({ startTime: "18:00", endTime: "10:00" });
    await page.submitShiftChanges();
    show("Owner enters an end time before the start time (sub-flow 8a: isValid = false)", page);

    page.enterShiftInformation({ startTime: "10:00", endTime: "18:00", role: "Supervisor" });
    await page.submitShiftChanges();
    show("Owner corrects the shift; it is validated, saved and confirmed (steps 7-10)", page);

    await page.openSchedule("SCH-002");
    await page.publishSchedule();
    show("Owner publishes the schedule", page);

    await page.viewMySchedule("EMP-001");
    show("Cashier One views their schedule (Employee actor)", page);

    await page.selectEmployee("EMP-001");
    await page.selectShift("SHIFT-103");
    await page.cancelSelectedShift();
    show("Owner cancels SHIFT-103", page);

    await page.viewMySchedule("EMP-001");
    show("Cashier One's schedule after the cancellation", page);

    console.log("\nDemo finished. (It used a temporary database; your real data was not changed.)");
  } catch (error) {
    console.error("\nDemo failed:");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
    fs.rmSync(demoDir, { recursive: true, force: true });
  }
}

demo();
