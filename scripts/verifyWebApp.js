// npm run web:check
//
// Tests the web demo's JSON routes (src/web/api) on a temporary database built with
// setupDatabase + seedDatabase + seedDemoData. It starts the server on a free port,
// calls the routes the screens use (including the error cases), then deletes the
// temporary database and exported files. The team's main and demo databases are never
// touched.
//
// Also covers the PR #21 review fixes: alerts reconciled when only the date changes,
// scheduling and reports isolated per request (two "tabs"), the Feature 6 roles (403s),
// inbox totals, input checks and duplicate guards, and sales that match Accounting.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert/strict");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TEMP_DATABASE = path.join(os.tmpdir(), `marche-web-check-${Date.now()}.sqlite`);
const TEMP_EXPORTS = fs.mkdtempSync(path.join(os.tmpdir(), "marche-web-exports-"));

process.env.SQLITE_PATH = TEMP_DATABASE;
process.env.REPORT_EXPORT_DIR = TEMP_EXPORTS;
for (const script of ["setupDatabase.js", "seedDatabase.js", "seedDemoData.js"]) {
  execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, env: process.env, stdio: "ignore" });
}

const sequelize = require("../src/database");
const { createApp } = require("../src/web/server");

let passed = 0;
function pass(message) {
  passed += 1;
  console.log(`  PASS  ${message}`);
}

async function main() {
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  // as: who is "signed in" (X-Signed-In-As), as the top bar sends it.
  const call = async (method, url, body, as = "OWN-001") => {
    const response = await fetch(base + url, {
      method,
      headers: { "X-Signed-In-As": as, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  const asEmployee = (method, url, body) => call(method, url, body, "EMP-001");

  try {
    console.log("\nWeb demo routes");

    // Feature 2
    // Three tabs open the dashboard at the same time on a new day: all three succeed.
    const opened = await Promise.all([1, 2, 3].map(() => call("GET", "/dashboard")));
    assert.ok(opened.every((o) => o.status === 200 && o.data.totalSalesToday === opened[0].data.totalSalesToday));
    pass("three tabs opening the dashboard together all get the same summary");
    let r = await call("GET", "/dashboard");
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.lowStockCount, "number");
    pass(`dashboard summary: ${r.data.lowStockCount} low-stock, ${r.data.pendingRestockCount} pending restock`);
    r = await call("GET", "/dashboard/reports");
    assert.deepEqual(r.data.reportTypes, ["inventory", "sales", "expiryRestock"]);
    pass("report types are Inventory, Sales and Expiry & Restock only (no Financial)");
    r = await call("POST", "/dashboard/reports", { reportType: "financial", periodStart: "2026-01-01", periodEnd: "2026-12-31" });
    assert.equal(r.status, 400);
    pass("a financial report is refused by ReportHandler.selectReport");
    r = await call("POST", "/dashboard/reports", { reportType: "inventory", periodStart: "2026-01-01", periodEnd: "2026-12-31" });
    assert.equal(r.data.ok, true);
    assert.equal(r.data.rows.length, 14);
    assert.equal(r.data.rows.reduce((sum, row) => sum + Number(row.quantityOnHand), 0), 237);
    const tabA = r.data.reportId;
    pass(`inventory report generated: 14 products, 237 units (${tabA})`);
    r = await call("POST", "/dashboard/reports", { reportType: "inventory", periodStart: "2026-01-01", periodEnd: "2026-12-31" });
    const tabB = r.data.reportId;
    assert.notEqual(tabA, tabB);
    r = await call("POST", `/dashboard/reports/${tabA}/filter`, { startDate: "2026-12-31", endDate: "2026-01-01" });
    assert.equal(r.status, 400);
    pass("invalid filter is rejected (8b)");
    r = await call("POST", `/dashboard/reports/${tabA}/filter`, { category: "Dairy" });
    assert.equal(r.data.rows.length, 7);
    pass("filter by category Dairy shows 7 products (8a, wireframe 2.4)");
    r = await call("POST", `/dashboard/reports/${tabB}/export`, { format: "CSV" });
    let csv = fs.readFileSync(path.join(TEMP_EXPORTS, r.data.fileName), "utf8");
    const dataRows = (text) => text.split(/\r?\n/).filter((line) => /^INV-/.test(line));
    assert.equal(dataRows(csv).length, 14, "the other tab's export is not filtered");
    pass("a second tab's report is not changed by the first tab's filter");
    r = await call("POST", `/dashboard/reports/${tabA}/export`, { format: "CSV" });
    assert.equal(r.data.ok, true);
    csv = fs.readFileSync(path.join(TEMP_EXPORTS, r.data.fileName), "utf8");
    assert.equal(dataRows(csv).length, 7, "export follows the Dairy filter");
    assert.ok(dataRows(csv).every((line) => line.includes(",Dairy,")));
    const download = await fetch(`${base}/dashboard/exports/${r.data.fileName}?name=inventory-report-dairy`);
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /inventory-report-dairy\.csv/);
    pass("filtered report exported as CSV (Dairy only) and downloaded with the chosen file name (2.7)");
    r = await call("POST", `/dashboard/reports/${tabA}/close`);
    assert.equal(r.data.ok, true);
    r = await call("POST", `/dashboard/reports/${tabA}/export`, { format: "PDF" });
    assert.equal(r.status, 404);
    r = await call("POST", "/dashboard/reports/REP-NOPE/filter", { category: "Dairy" });
    assert.equal(r.status, 404);
    pass("a closed or unknown report ID is refused (404), other reports are unaffected");

    // Feature 2: sales agree across screens.
    const { Transaction, Sale } = require("../src/models");
    const registers = await Transaction.findAll({ where: { transactionType: "Revenue", category: "Daily sales" } });
    for (const entry of registers) {
      const day = String(entry.date).slice(0, 10);
      const sales = await Sale.findAll({ where: { saleDate: day }, include: [{ association: "items" }] });
      const cents = sales.reduce((sum, sale) => sum + Math.round(sale.totalAmount * 100), 0);
      assert.equal(cents, Math.round(entry.amount * 100), `sales on ${day} add up to the register total`);
      assert.ok(sales.length >= 15 && sales.length <= 40, `15 to 40 sales on ${day}`);
      for (const sale of sales) {
        const lines = sale.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice * 100), 0);
        assert.equal(lines, Math.round(sale.totalAmount * 100), `${sale.saleId} total = its items`);
      }
    }
    pass(`sales match every "Daily sales" register total to the cent (${registers.length} days)`);
    r = await call("GET", "/dashboard/sales-week");
    assert.equal(r.data.days.length, 7);
    const week = Object.fromEntries(r.data.days.map((d) => [d.date, d.total]));
    for (const entry of registers) {
      const day = String(entry.date).slice(0, 10);
      if (day in week) assert.equal(week[day], Number(entry.amount));
    }
    const summary = (await call("GET", "/dashboard")).data;
    assert.equal(week[r.data.days[6].date], summary.totalSalesToday);
    pass("the 7-day chart reads Sale records: it matches Accounting and the Today's sales tile");

    // Feature 1
    r = await call("GET", "/inventory");
    assert.ok(r.data.inventory.find((p) => p.productId === "PROD-002").category === "Dairy");
    pass("inventory list includes each product's category and supplier (wireframe 1.1)");
    r = await call("PUT", "/inventory/PROD-002", { quantityOnHand: "-2" });
    assert.equal(r.status, 400);
    pass("negative quantity is rejected, nothing saved (AC-05)");
    r = await call("PUT", "/inventory/PROD-002", { quantityOnHand: "3" });
    assert.equal(r.data.ok, true);
    assert.equal(r.data.updatedInformation.inventory.quantityOnHand, 3);
    assert.ok(r.data.restockAlert, "a restock alert should be generated");
    pass("inventory updated to 3 and a restock alert was generated (AC-06 to AC-08)");

    // Feature 3
    r = await call("POST", "/profiles/suppliers", { partnerName: "Nile Valley Imports", leadTimeDays: "-1" });
    assert.equal(r.status, 400);
    assert.ok(r.data.fieldErrors.partnerName && r.data.fieldErrors.leadTimeDays);
    pass("duplicate supplier name and negative lead time are rejected (5a)");
    r = await call("POST", "/profiles/suppliers", { partnerName: "Cairo Spice Traders", leadTimeDays: "12", paymentTerms: "Net 45" });
    assert.equal(r.status, 201);
    pass(`new supplier profile created (${r.data.supplierId})`);
    r = await call("GET", `/profiles/suppliers/find?name=${encodeURIComponent("Unknown Supplier")}`);
    assert.equal(r.status, 404);
    assert.equal(r.data.notFound, true);
    pass("unknown supplier is reported as not found (2a)");
    r = await call("PUT", "/profiles/partners/BP-006", { phoneNumber: "514-555-0311", email: "bad" });
    assert.equal(r.status, 400);
    assert.ok(r.data.fieldErrors.phoneNumber && r.data.fieldErrors.email);
    pass("customer update with a taken phone number and a bad email is rejected (2S.3)");
    r = await call("POST", "/profiles/suppliers/SUP-002/deliveries", {
      deliveryDate: "2026-11-20",
      expectedDeliveryDate: "2026-11-18",
      quantityOrdered: "50",
      quantityReceived: "42",
      conditionRating: "Good",
      employeeId: "EMP-002",
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.notification.notificationType, "Discrepancy");
    pass("short delivery recorded and the owner was notified (6a)");
    r = await call("POST", "/profiles/suppliers/SUP-003/deliveries", {
      deliveryDate: "2026-11-21",
      isUnplanned: true,
      quantityReceived: "10",
      employeeId: "EMP-002",
    });
    assert.equal(r.data.notification.notificationType, "Unplanned delivery");
    pass("unplanned delivery recorded and the owner was notified (6b)");
    r = await call("GET", "/profiles/suppliers/SUP-002");
    assert.equal(r.data.report.deliveriesRecorded, 3);
    assert.notEqual(r.data.report.onTimeDeliveryRate, null);
    pass(`performance report: lead time ${r.data.report.averageLeadTime} d, on-time ${r.data.report.onTimeDeliveryRate}%, fill ${r.data.report.averageFillRate}%`);
    r = await call("GET", "/profiles/notifications");
    assert.equal(r.data.notifications.length, 2);
    pass("owner sees 2 unread notifications");

    // Feature 4
    r = await call("POST", "/accounting/transactions", { transactionType: "Revenue", amount: "", category: "", date: "", description: "" });
    assert.equal(r.status, 400);
    pass("incomplete transaction is rejected (4a)");
    const before = (await call("GET", "/accounting")).data.summary.currentBalance;
    r = await call("POST", "/accounting/transactions", {
      transactionType: "Revenue",
      amount: "1000",
      category: "Daily sales",
      date: "2026-11-23",
      description: "Daily sales revenue",
      source: "Register",
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.summary.currentBalance, before + 1000);
    assert.match(r.data.message, /\$1000\.00 CAD/);
    pass("daily revenue recorded, balance recalculated (+$1000), message in CAD");
    r = await call("POST", "/accounting/transactions", { transactionType: "Expense", amount: "50", category: "Utilities", date: "2026-11-23", description: "" });
    assert.equal(r.status, 201);
    assert.equal(r.data.transactions.find((t) => t.transactionId === r.data.transactionId).description, "Utilities");
    pass("description is optional (wireframe 3.2): the category is stored instead");

    // Feature 5: every change names the employee, shift or schedule it works on.
    r = await call("GET", "/schedule");
    assert.ok(r.data.employees.length >= 3);
    r = await call("POST", "/schedule/employees/EMP-003");
    assert.ok(r.data.employeeSchedule.length >= 2);
    const [shiftA, shiftB] = r.data.employeeSchedule;
    r = await call("POST", `/schedule/employees/EMP-003/shifts/${shiftA.shiftId}/select`);
    assert.equal(r.data.view, "EDIT_SHIFT");
    r = await call("PUT", `/schedule/employees/EMP-003/shifts/${shiftA.shiftId}`, { startTime: "10:00", endTime: "09:00" });
    assert.equal(r.status, 400);
    assert.equal(r.data.ok, false);
    assert.equal(r.data.view, "CORRECTION_REQUIRED");
    pass("shift ending before it starts is rejected (8a, HTTP 400)");
    r = await call("PUT", `/schedule/employees/EMP-003/shifts/${shiftA.shiftId}`, { startTime: "", endTime: "" });
    assert.equal(r.status, 400);
    assert.equal(r.data.ok, false);
    assert.equal(r.data.view, "MISSING_DETAILS");
    pass("missing shift details prompt (6a) is not reported as a success");
    // Two tabs: tab 1 selects shift A, tab 2 selects shift B and saves; then tab 1 saves.
    await call("POST", `/schedule/employees/EMP-003/shifts/${shiftA.shiftId}/select`);
    await call("POST", `/schedule/employees/EMP-003/shifts/${shiftB.shiftId}/select`);
    r = await call("PUT", `/schedule/employees/EMP-003/shifts/${shiftB.shiftId}`, { startTime: "11:00", endTime: "19:00" });
    assert.equal(r.data.view, "CONFIRMATION");
    r = await call("PUT", `/schedule/employees/EMP-003/shifts/${shiftA.shiftId}`, { startTime: "10:00", endTime: "18:00" });
    assert.equal(r.data.view, "CONFIRMATION");
    const { EmployeeShift } = require("../src/models");
    assert.equal(String((await EmployeeShift.findByPk(shiftA.shiftId)).startTime).slice(0, 5), "10:00");
    assert.equal(String((await EmployeeShift.findByPk(shiftB.shiftId)).startTime).slice(0, 5), "11:00");
    pass("two tabs editing different shifts each update only their own shift");
    r = await call("PUT", `/schedule/employees/EMP-001/shifts/${shiftA.shiftId}`, { startTime: "07:00", endTime: "15:00" });
    assert.equal(r.status, 400);
    assert.equal(String((await EmployeeShift.findByPk(shiftA.shiftId)).startTime).slice(0, 5), "10:00");
    r = await call("PUT", `/schedule/employees/EMP-003/shifts/${shiftA.shiftId}`, { scheduleId: "SCH-NOPE", startTime: "07:00", endTime: "15:00" });
    assert.equal(r.status, 400);
    r = await call("POST", `/schedule/employees/EMP-001/shifts/${shiftA.shiftId}/cancel`);
    assert.equal(r.status, 400);
    assert.notEqual((await EmployeeShift.findByPk(shiftA.shiftId)).shiftStatus, "Cancelled");
    pass("a shift that is not the named employee's (or schedule's) is never edited or cancelled");
    r = await call("POST", "/schedule/schedules/SCH-NOPE/shifts", { employeeId: "EMP-001", shiftDate: "2026-11-24", startTime: "09:00", endTime: "17:00" });
    assert.equal(r.status, 404);
    r = await call("POST", "/schedule/schedules/SCH-NOPE/publish");
    assert.equal(r.status, 404);
    const { Schedule } = require("../src/models");
    assert.ok(await Schedule.findByPk("SCH-002"));
    assert.equal((await call("GET", "/schedule/my/EMP-003")).data.employeeSchedule.length, 0);
    pass("an invalid schedule ID stops assigning and publishing (404); no other schedule is changed");
    r = await call("POST", "/schedule/schedules", { startDate: "2026-12-07", endDate: "2026-12-13" });
    assert.equal(r.status, 201);
    assert.ok(r.data.selectedSchedule && r.data.schedules.some((s) => s.scheduleId === r.data.selectedSchedule.scheduleId));
    pass("a new schedule is returned with the updated list, ready to use");
    r = await call("POST", "/schedule/schedules/SCH-002/publish");
    assert.equal(r.data.view, "SCHEDULE_PUBLISHED");
    pass("schedule SCH-002 published");

    // Feature 6: roles, input checks, duplicates, inbox totals.
    r = await call("POST", "/support/assist", { customer: "CUST-002" });
    assert.equal(r.status, 403);
    assert.match(r.data.message, /employee/);
    pass("the store owner gets 403 on employee actions");
    r = await asEmployee("GET", "/support/owner/inbox");
    assert.equal(r.status, 403);
    assert.match(r.data.message, /Only the store owner/);
    pass("an employee gets 403 on the owner inbox");
    r = await asEmployee("POST", "/support/assist", { customer: "514-555-0311" });
    assert.equal(r.status, 400);
    assert.ok(r.data.fieldErrors.customer);
    assert.match(r.data.message, /\(Error in src\/web\/api\/support\.js, line \d+\)$/);
    pass("a phone with dashes is refused, the customer box is marked, the message ends with file and line");
    r = await asEmployee("POST", "/support/assist", { customer: "5145550311" });
    assert.equal(r.data.customer.customerId, "CUST-002");
    pass("customer found by digits-only phone number");
    const item = r.data.purchaseHistory.find((sale) => sale.saleId === "SALE-002").items[0];
    r = await asEmployee("POST", "/support/returns", { customerId: "CUST-002", saleId: "SALE-002", saleItemId: item.saleItemId, quantity: "1.5", reason: "Damaged" });
    assert.equal(r.status, 400);
    assert.ok(r.data.fieldErrors.quantity);
    pass("a quantity that is not a whole number is refused and the box is marked");
    r = await asEmployee("POST", "/support/returns", { customerId: "CUST-002", saleId: "SALE-002", saleItemId: item.saleItemId, quantity: "1", reason: "Damaged" });
    assert.equal(r.data.refunded, true);
    assert.match(r.data.message, /CAD/);
    pass(`return refunded ($${r.data.amount} CAD)`);
    r = await asEmployee("POST", "/support/assist", { customer: "CUST-002" });
    const refundedLine = r.data.purchaseHistory.find((sale) => sale.saleId === "SALE-002").items.find((i) => i.saleItemId === item.saleItemId);
    assert.equal(refundedLine.returnedQuantity, 1);
    const old = r.data.purchaseHistory.find((sale) => sale.saleDate < "2026-11-01" || Date.parse(sale.saleDate) < Date.now() - 31 * 864e5);
    r = await asEmployee("POST", "/support/returns", { customerId: "CUST-002", saleId: old.saleId, saleItemId: old.items[0].saleItemId, quantity: "1", reason: "Changed mind" });
    assert.equal(r.data.refunded, false);
    assert.match(r.data.message, /30-day return window/);
    pass("purchase history shows the return; an old sale is refused (outside the 30-day window)");
    r = await asEmployee("POST", "/support/assist", { customer: "CUST-003" });
    const full = r.data.purchaseHistory.flatMap((sale) => sale.items.map((i) => ({ ...i, saleId: sale.saleId }))).find((i) => i.returnedQuantity === i.quantity);
    assert.ok(full, "demo data has a fully returned item");
    r = await asEmployee("POST", "/support/returns", { customerId: "CUST-003", saleId: full.saleId, saleItemId: full.saleItemId, quantity: "1", reason: "Again" });
    assert.equal(r.data.refunded, false);
    r = await asEmployee("POST", "/support/assist", { customer: "CUST-004" });
    assert.equal(r.data.customer.phoneNumber, null);
    pass("demo data covers a fully returned item and a customer with no phone number");
    r = await asEmployee("POST", "/support/complaints", { customerId: "CUST-002", category: "Service", description: "x".repeat(501) });
    assert.equal(r.status, 400);
    assert.ok(r.data.fieldErrors.description);
    r = await asEmployee("POST", "/support/complaints", { customerId: "CUST-002", category: "Service", description: "Long wait at checkout." });
    assert.equal(r.status, 201);
    const caseId = r.data.caseId;
    r = await asEmployee("POST", "/support/complaints", { customerId: "CUST-002", category: "Service", description: "Long wait at checkout." });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /identical complaint/);
    pass("an over-long description and an identical open complaint are refused");
    r = await call("POST", `/support/owner/cases/${caseId}/resolve`);
    assert.equal(r.status, 400);
    assert.match(r.data.message, /not escalated/);
    pass("resolveCase refuses a case that is not escalated");
    await asEmployee("POST", `/support/complaints/${caseId}/escalate`, {});
    r = await call("GET", "/support/owner/inbox");
    assert.ok(r.data.cases.some((c) => c.caseId === caseId));
    const t = r.data.totals;
    assert.equal(t.escalatedComplaints, r.data.cases.length);
    assert.equal(t.total, t.escalatedComplaints + t.missingRecords + t.deliveryNotices + t.restockAlerts);
    assert.ok(t.deliveryNotices >= 2 && t.restockAlerts >= 1);
    pass(`complaint escalated; inbox totals: ${t.escalatedComplaints} escalated, ${t.missingRecords} missing, ${t.deliveryNotices} delivery, ${t.restockAlerts} restock = ${t.total}`);
    r = await call("POST", `/support/owner/cases/${caseId}/resolve`);
    assert.equal(r.data.ok, true);
    r = await asEmployee("POST", "/support/assist", { customer: "CUST-002" });
    assert.equal(r.data.complaintCases.find((c) => c.caseId === caseId).status, "Resolved");
    pass("the owner resolves the case and the employee sees it as Resolved");
    r = await asEmployee("POST", "/support/requests", { customerId: "CUST-002", subject: "Hours", description: "Holiday hours?" });
    assert.equal(r.status, 201);
    r = await asEmployee("POST", "/support/requests", { customerId: "CUST-002", subject: "Hours", description: "Holiday hours?" });
    assert.equal(r.status, 400);
    pass("an identical open support request is refused");
    r = await asEmployee("POST", "/support/assist", { customer: "CUST-999" });
    assert.equal(r.data.missingRecord, true);
    r = await asEmployee("POST", "/support/missing-record", { customer: "CUST-999", note: "Says they signed up." });
    assert.equal(r.status, 201);
    const flagId = r.data.requestId;
    r = await asEmployee("POST", "/support/missing-record", { customer: "CUST-999", note: "Asked again." });
    assert.equal(r.status, 200);
    assert.equal(r.data.requestId, flagId);
    pass("unknown customer is a missing record (3a); flagging it twice returns the same flag");
    r = await call("POST", "/support/assist", { customer: "CUST-002" }, "");
    assert.equal(r.status, 403);
    pass("a request with no signed-in person is refused");

    // Feature 1: alerts are reconciled when only the date changes.
    const { InventoryRecord, RestockAlert } = require("../src/models");
    const { resetReconciliation } = require("../src/utils/alertReconciliation");
    await InventoryRecord.update({ expiryDate: "2026-01-01" }, { where: { inventoryId: "INV-013" }, hooks: false });
    assert.equal(await RestockAlert.count({ where: { inventoryId: "INV-013", alertStatus: "PENDING" } }), 0);
    resetReconciliation(); // as if a new day started
    r = await call("GET", "/inventory/alerts");
    assert.equal(r.data.alerts.filter((a) => a.inventoryId === "INV-013").length, 1);
    await Promise.all([call("GET", "/inventory"), call("GET", "/dashboard"), call("GET", "/inventory/alerts")]);
    resetReconciliation();
    await call("GET", "/inventory");
    assert.equal(await RestockAlert.count({ where: { inventoryId: "INV-013", alertStatus: "PENDING" } }), 1);
    pass("an item that expired with no inventory update gets one alert in the demo (no duplicates)");

    console.log(`\nWeb demo verification successful (${passed} checks passed).`);
  } catch (error) {
    console.error("\nWeb demo verification FAILED:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
    await sequelize.close();
    fs.rmSync(TEMP_DATABASE, { force: true });
    fs.rmSync(TEMP_EXPORTS, { recursive: true, force: true });
  }
}

main();
