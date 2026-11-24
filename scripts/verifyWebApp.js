// npm run web:check
//
// Tests the web demo's JSON routes (src/web/api) on a temporary database built with
// setupDatabase + seedDatabase + seedDemoData. It starts the server on a free port,
// calls the routes the screens use (including the error cases), then deletes the
// temporary database. The team's main and demo databases are never touched.

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
  const call = async (method, url, body) => {
    const response = await fetch(base + url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    console.log("\nWeb demo routes");

    // Feature 2
    let r = await call("GET", "/dashboard");
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.lowStockCount, "number");
    pass(`dashboard summary: ${r.data.lowStockCount} low-stock, ${r.data.pendingRestockCount} pending restock`);
    r = await call("POST", "/dashboard/reports", { reportType: "inventory", periodStart: "2026-01-01", periodEnd: "2026-12-31" });
    assert.equal(r.data.ok, true);
    assert.ok(r.data.rows.length >= 6);
    pass(`inventory report generated (${r.data.rows.length} rows)`);
    r = await call("POST", "/dashboard/reports/filter", { startDate: "2026-12-31", endDate: "2026-01-01" });
    assert.equal(r.status, 400);
    pass("invalid filter is rejected (8b)");
    r = await call("POST", "/dashboard/reports/filter", { category: "Dairy" });
    assert.equal(r.data.rows.length, 7);
    pass("filter by category Dairy shows 7 products (8a, wireframe 2.4)");
    r = await call("POST", "/dashboard/reports/export", { format: "CSV" });
    assert.equal(r.data.ok, true);
    const download = await fetch(`${base}/dashboard/exports/${r.data.fileName}?name=inventory-report-dairy`);
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /inventory-report-dairy\.csv/);
    pass("report exported as CSV and downloaded with the chosen file name (wireframe 2.7)");
    r = await call("GET", "/dashboard/sales-week");
    assert.equal(r.data.days.length, 7);
    assert.ok(r.data.days.some((d) => d.total > 0));
    pass("sales for the last 7 days come from the ledger (wireframe 2.1)");

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
    pass("daily revenue recorded and the balance was recalculated (+$1000)");
    r = await call("POST", "/accounting/transactions", { transactionType: "Expense", amount: "50", category: "Utilities", date: "2026-11-23", description: "" });
    assert.equal(r.status, 201);
    assert.equal(r.data.transactions.find((t) => t.transactionId === r.data.transactionId).description, "Utilities");
    pass("description is optional (wireframe 3.2): the category is stored instead");

    // Feature 5
    r = await call("GET", "/schedule");
    assert.ok(r.data.employees.length >= 3);
    r = await call("POST", "/schedule/employees/EMP-003");
    assert.ok(r.data.employeeSchedule.length >= 2);
    r = await call("POST", `/schedule/shifts/${r.data.employeeSchedule[0].shiftId}/select`);
    r = await call("PUT", "/schedule/shift", { startTime: "10:00", endTime: "09:00" });
    assert.equal(r.data.view, "CORRECTION_REQUIRED");
    pass("shift ending before it starts is rejected (8a)");
    r = await call("PUT", "/schedule/shift", { startTime: "10:00", endTime: "18:00" });
    assert.equal(r.data.view, "CONFIRMATION");
    pass("shift updated and confirmed");
    r = await call("POST", "/schedule/schedules/SCH-002/publish");
    assert.equal(r.data.view, "SCHEDULE_PUBLISHED");
    pass("schedule SCH-002 published");

    // Feature 6
    r = await call("POST", "/support/assist", { customer: "514-555-0311" });
    assert.equal(r.data.customer.customerId, "CUST-002");
    pass("customer found by phone number");
    const item = r.data.purchaseHistory[0].items[0];
    r = await call("POST", "/support/returns", { customerId: "CUST-002", saleId: "SALE-002", saleItemId: item.saleItemId, quantity: "1", reason: "Damaged" });
    assert.equal(r.data.refunded, true);
    pass(`return refunded ($${r.data.amount})`);
    r = await call("POST", "/support/complaints", { customerId: "CUST-002", category: "Service", description: "Long wait at checkout." });
    assert.equal(r.status, 201);
    const caseId = r.data.message.match(/CASE-[A-Z0-9-]+/)[0];
    await call("POST", `/support/complaints/${caseId}/escalate`, {});
    r = await call("GET", "/support/owner/cases");
    assert.ok(r.data.cases.some((c) => c.caseId === caseId));
    pass("complaint opened and escalated to the owner (5a)");
    r = await call("POST", "/support/assist", { customer: "CUST-999" });
    assert.equal(r.data.missingRecord, true);
    pass("unknown customer is reported as a missing record (3a)");

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
