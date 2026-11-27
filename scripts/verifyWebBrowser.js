// npm run web:browser-check
//
// Browser-level smoke tests for the six-feature web demo (npm run demo), using the
// Playwright development dependency the project already has (same style as
// scripts/verifyInventoryBrowser.js). Each feature's main flow is clicked through in a real
// (headless) Chromium window, and the results are checked on screen and in the database.
//
// It uses a TEMPORARY database (setupDatabase + seedDatabase + seedDemoData) and a
// temporary export folder, both deleted at the end, so the team's main database and the
// normal demo database are never touched and the test can be run again and again.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aghapy-web-browser-"));
process.env.SQLITE_PATH = path.join(dir, "test.sqlite");
process.env.REPORT_EXPORT_DIR = path.join(dir, "exports");
for (const script of ["setupDatabase.js", "seedDatabase.js", "seedDemoData.js"]) {
  execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, env: process.env, stdio: "ignore" });
}

const { chromium } = require("playwright");
const sequelize = require("../src/database");
const { createApp } = require("../src/web/server");
const { InventoryRecord, RestockAlert, EmployeeShift, Transaction, ComplaintCase, Ledger } = require("../src/models");

let passed = 0;
function pass(message) {
  passed += 1;
  console.log(`  PASS  ${message}`);
}

let server;
let browser;

// A new browser window (its own tab storage), signed in as `as`, in English.
async function newWindow(base, as = "OWN-001") {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await context.addInitScript((who) => {
    sessionStorage.setItem("signedInAs", sessionStorage.getItem("signedInAs") || who);
    localStorage.setItem("lang", localStorage.getItem("lang") || "en");
  }, as);
  // The fonts come from the internet; the test does not need them.
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (error) => page.errors.push(error.message));
  await page.goto(base);
  return page;
}

async function go(page, hash) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.locator("#main .loading").waitFor({ state: "detached" }).catch(() => {});
}

async function run() {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true });

  // ----- Feature 1: Products and Inventory -----
  console.log("\nFeature 1 – Product and Inventory Management");
  let page = await newWindow(base);
  await go(page, "#/inventory");
  await page.getByLabel("Search products").fill("Feta");
  await page.getByRole("row").filter({ hasText: "Feta Cheese 400g" }).click();
  await page.getByRole("heading", { name: "Feta Cheese 400g" }).waitFor();
  pass("inventory page opens, a product is found by search and selected");
  await page.getByRole("link", { name: "Edit Inventory" }).click();
  await page.getByLabel("New quantity on hand").fill("-3");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.getByText("Quantity must be a whole number of 0 or more.").waitFor();
  assert.equal((await InventoryRecord.findByPk("INV-002")).quantityOnHand, 12);
  pass("an invalid quantity (-3) is rejected and nothing is saved");
  await page.getByLabel("New quantity on hand").fill("4");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
  await page.getByText("Restock alert created", { exact: true }).waitFor();
  assert.equal((await InventoryRecord.findByPk("INV-002")).quantityOnHand, 4);
  assert.equal(await RestockAlert.count({ where: { inventoryId: "INV-002", alertStatus: "PENDING" } }), 1);
  pass("a valid update (4) is saved and the restock alert is displayed");
  assert.deepEqual(page.errors, []);
  await page.context().close();

  // ----- Feature 2: Dashboard and Reports -----
  console.log("\nFeature 2 – Dashboard and Reports");
  page = await newWindow(base);
  await go(page, "#/dashboard");
  await page.getByRole("heading", { name: "Sales – last 7 days" }).waitFor();
  await page.getByText("Daily total of recorded sales (CAD).").waitFor();
  assert.match(await page.locator(".stat", { hasText: "Today's sales" }).innerText(), /\$31\.97 CAD/);
  pass("dashboard opens; Today's sales shows $31.97 CAD and the chart reads recorded sales");
  await page.getByRole("link", { name: "Reports" }).first().click();
  await page.getByRole("heading", { name: "Available reports" }).waitFor();
  assert.equal(await page.getByText("Financial Report").count(), 0);
  pass("the Reports page offers 3 report types (no Financial Report)");
  await page.getByText("Sales Report", { exact: true }).click();
  await page.getByLabel("Period start").fill("2026-12-31");
  await page.getByLabel("Period end").fill("2026-01-01");
  await page.getByRole("button", { name: "Generate Report" }).click();
  await page.locator("#errors").getByText("Report not generated").waitFor();
  pass("an invalid date range (start after end) is rejected");
  await page.getByText("Inventory Report", { exact: true }).click();
  await page.getByRole("button", { name: "Generate Report" }).click();
  const units = await InventoryRecord.sum("quantityOnHand"); // 237 in the demo data, minus Feature 1's update above
  await page.locator("#main").getByText(`14 products · ${units} units in stock`, { exact: false }).waitFor();
  pass(`inventory report generated: 14 products, ${units} units`);
  await page.getByLabel("Category").selectOption("Dairy");
  await page.getByRole("button", { name: "Apply Filter" }).click();
  await page.locator("#main .chip").getByText(/Filtered: Category = Dairy · 7 of 14/).waitFor();
  pass("category filter Dairy applied (7 of 14 products)");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByText("CSV", { exact: true }).click();
  await page.getByLabel("File name").fill("dairy-check");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).last().click()]);
  assert.equal(download.suggestedFilename(), "dairy-check.csv");
  const csv = fs.readFileSync(await download.path(), "utf8");
  const rows = csv.split(/\r?\n/).filter((line) => /^INV-/.test(line));
  assert.equal(rows.length, 7);
  assert.ok(rows.every((line) => line.includes(",Dairy,")));
  assert.ok(csv.includes("Inventory Report"));
  pass("the exported CSV is the Inventory Report with the Dairy filter (7 rows)");
  assert.deepEqual(page.errors, []);
  await page.context().close();

  // ----- Feature 3: Supplier and Customer Profiles -----
  console.log("\nFeature 3 – Supplier and Customer Profiles");
  page = await newWindow(base);
  await go(page, "#/profiles");
  await page.getByRole("searchbox", { name: "Search", exact: true }).fill("Nile Valley Imports");
  await page.getByRole("button", { name: "Find profile" }).click();
  await page.getByRole("heading", { name: "Nile Valley Imports" }).waitFor();
  pass("an existing supplier profile is found by name");
  const leadTime = page.getByLabel("Lead time (days)");
  await leadTime.fill("-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.locator(".field-error").first().waitFor();
  pass("invalid information (negative lead time) is rejected");
  await leadTime.fill("9");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.locator("#toast", { hasText: "Profile saved." }).waitFor();
  pass("a valid update is saved");
  await page.getByRole("button", { name: "+ Record delivery" }).click();
  await page.getByLabel("Expected date (PO)").fill("2026-11-18");
  await page.getByLabel("Quantity ordered").fill("50");
  await page.getByLabel("Quantity received").fill("41");
  await page.getByRole("button", { name: "Save delivery" }).click();
  await page.locator("#toast").filter({ hasText: /owner was notified: Discrepancy/ }).waitFor();
  pass("a delivery discrepancy is recorded and the notification is shown");
  await go(page, "#/profiles/notifications");
  await page.locator("#main").getByText(/Nile Valley Imports/).first().waitFor();
  assert.deepEqual(page.errors, []);
  pass("the owner notification appears in Owner notifications");
  await page.context().close();

  // ----- Feature 4: Accounting -----
  console.log("\nFeature 4 – Accounting");
  page = await newWindow(base);
  await go(page, "#/accounting");
  await page.getByText("Ledger balance").waitFor();
  const moneyTexts = await page.locator(".stat strong").allInnerTexts();
  assert.ok(moneyTexts.every((text) => /CAD$/.test(text)), `CAD on every figure: ${moneyTexts}`);
  pass("the accounting dashboard opens and every amount is shown in CAD");
  const ledger = await Ledger.findOne();
  const before = Number((await ledger.reload()).currentBalance);
  await page.getByRole("link", { name: "+ Record Transaction" }).click();
  await page.getByRole("button", { name: "Save Transaction" }).click();
  await page.locator("#main").getByText("Transaction not saved").first().waitFor();
  pass("an invalid (empty) transaction is rejected");
  await page.getByLabel("Amount (CAD)").fill("1250.40");
  await page.getByLabel("Category").selectOption("Daily sales");
  await page.getByRole("button", { name: "Save Transaction" }).click();
  await page.locator("#main").getByText("Transaction saved").first().waitFor();
  const after = Number((await ledger.reload()).currentBalance);
  assert.equal(Math.round((after - before) * 100), 125040);
  await page.getByText("$1,250.40 CAD").first().waitFor();
  pass("daily sales revenue recorded; the balance went up by exactly $1,250.40 CAD");
  assert.deepEqual(page.errors, []);
  await page.context().close();

  // ----- Feature 5: Employee Management and Scheduling -----
  console.log("\nFeature 5 – Employee Management and Scheduling");
  const tab1 = await newWindow(base);
  const tab2 = await newWindow(base);
  for (const p of [tab1, tab2]) {
    await go(p, "#/schedule");
    await p.locator("#employees").getByText("Mina Boutros").click();
    await p.getByRole("heading", { name: "Mina Boutros" }).waitFor();
  }
  pass("an employee is selected in two independent windows");
  const shifts = await EmployeeShift.findAll({ where: { employeeId: "EMP-003" }, order: [["shiftDate", "ASC"]] });
  await tab1.locator(`[data-shift="${shifts[0].shiftId}"]`).click();
  await tab2.locator(`[data-shift="${shifts[1].shiftId}"]`).click();
  await tab1.getByRole("heading", { name: `Edit shift ${shifts[0].shiftId}` }).waitFor();
  await tab2.getByRole("heading", { name: `Edit shift ${shifts[1].shiftId}` }).waitFor();
  pass("each window selects a different shift for editing");
  await tab1.getByLabel("Start time").fill("15:00");
  await tab1.getByLabel("End time").fill("09:00");
  await tab1.getByRole("button", { name: "Save shift" }).click();
  await tab1.locator(".banner.error").waitFor();
  assert.notEqual(String((await EmployeeShift.findByPk(shifts[0].shiftId)).startTime).slice(0, 5), "15:00");
  pass("invalid shift times (end before start) are rejected");
  await tab2.getByLabel("Start time").fill("13:00");
  await tab2.getByLabel("End time").fill("21:00");
  await tab2.getByRole("button", { name: "Save shift" }).click();
  await tab2.locator(".banner.success").waitFor();
  await tab1.getByLabel("Start time").fill("07:30");
  await tab1.getByLabel("End time").fill("15:30");
  await tab1.getByRole("button", { name: "Save shift" }).click();
  await tab1.locator(".banner.success").waitFor();
  assert.equal(String((await EmployeeShift.findByPk(shifts[0].shiftId)).startTime).slice(0, 5), "07:30");
  assert.equal(String((await EmployeeShift.findByPk(shifts[1].shiftId)).startTime).slice(0, 5), "13:00");
  assert.equal((await EmployeeShift.findByPk(shifts[0].shiftId)).employeeId, "EMP-003");
  pass("each window saved its own shift for the right employee (no cross-window changes)");
  await tab1.locator("#schedules").getByText("SCH-002").click();
  await tab1.getByRole("button", { name: "Publish schedule" }).click();
  await tab1.locator(".banner.success").waitFor();
  const published = await EmployeeShift.count({ where: { scheduleId: "SCH-002", shiftStatus: "Published" } });
  assert.ok(published >= 1);
  pass(`schedule SCH-002 published (${published} shifts)`);
  assert.deepEqual([...tab1.errors, ...tab2.errors], []);
  await tab1.context().close();
  await tab2.context().close();

  // ----- Feature 6: Customer Support (employee, then the owner) -----
  console.log("\nFeature 6 – Customer Support");
  page = await newWindow(base, "EMP-001");
  await go(page, "#/support");
  const lookupBox = page.getByLabel("Customer ID or phone number");
  await lookupBox.fill("514-555-0311");
  await page.getByRole("button", { name: "Look up customer" }).click();
  await page.locator("#lookup-form .field-error").waitFor();
  pass("a phone number with dashes is refused and the box is marked");
  await lookupBox.fill("5145550311");
  await page.getByRole("button", { name: "Look up customer" }).click();
  await page.getByRole("heading", { name: "Mariam Hanna" }).waitFor();
  pass("an existing customer is found (digits-only phone)");
  await page.getByRole("heading", { name: "Purchase history" }).waitFor();
  const saleRow = page.getByRole("row").filter({ hasText: "SALE-002" }).first();
  await saleRow.waitFor();
  pass("the purchase history is shown");
  await saleRow.getByRole("button", { name: "Return" }).click();
  await page.getByLabel("Quantity to return").fill("1");
  await page.getByRole("button", { name: "Check eligibility & refund" }).click();
  await page.locator("#panel .banner.success", { hasText: /Refund of \$\d+\.\d\d CAD approved/ }).waitFor();
  await page.getByRole("row").filter({ hasText: "SALE-002" }).filter({ hasText: "1 returned" }).first().waitFor();
  pass("an eligible return is processed; the refund confirmation (CAD) and updated history are shown");
  await page.getByRole("button", { name: "Open a complaint case" }).click();
  await page.getByLabel("Category").selectOption("Service");
  await page.getByLabel("Description").fill("Checkout line was very long on Saturday.");
  await page.getByRole("button", { name: "Open case" }).click();
  const caseRow = page.getByRole("row").filter({ hasText: "Checkout line was very long" });
  await caseRow.getByRole("button", { name: "Escalate to owner" }).click();
  await caseRow.getByText("Pending Owner Review").waitFor();
  const complaint = await ComplaintCase.findOne({ where: { description: "Checkout line was very long on Saturday." } });
  assert.equal(complaint.status, "Pending Owner Review");
  pass(`a complaint is created and escalated (${complaint.caseId})`);
  // Switch "Signed in as" to the store owner (top bar).
  await page.locator("#signed-in-as").selectOption("OWN-001");
  await page.getByRole("heading", { name: "Owner inbox" }).waitFor();
  const ownerRow = page.getByRole("row").filter({ hasText: complaint.caseId });
  await ownerRow.waitFor();
  const escalatedCount = await page.locator(".stat", { hasText: "Escalated complaints" }).locator("strong").innerText();
  assert.equal(escalatedCount, "1");
  pass("signed in as the owner, the complaint is in the inbox (Escalated complaints: 1)");
  await ownerRow.getByRole("button", { name: "Resolve" }).click();
  await page.locator("#toast", { hasText: "is resolved" }).waitFor();
  assert.equal((await complaint.reload()).status, "Resolved");
  await page.locator("#signed-in-as").selectOption("EMP-001");
  await page.getByLabel("Customer ID or phone number").fill("CUST-002");
  await page.getByRole("button", { name: "Look up customer" }).click();
  await page.getByRole("row").filter({ hasText: complaint.caseId }).getByText("Resolved").waitFor();
  pass("the owner resolves it and the employee sees it as Resolved");
  assert.deepEqual(page.errors, []);
  await page.context().close();

  // ----- French version -----
  console.log("\nFrench version");
  page = await newWindow(base);
  await page.evaluate(() => localStorage.setItem("lang", "fr"));
  await page.reload();
  await go(page, "#/dashboard");
  await page.getByRole("heading", { name: "Tableau de bord", exact: true }).waitFor();
  await page.getByText("Ventes – 7 derniers jours").waitFor();
  assert.match(await page.locator(".stat", { hasText: "Ventes du jour" }).innerText(), /31,97\s\$\sCA/);
  pass("FR: the dashboard is in French and money is shown as 31,97 $ CA");
  assert.deepEqual(page.errors, []);
  await page.context().close();

  // Nothing was written to the team's database or the normal demo database.
  assert.equal(path.resolve(sequelize.options.storage), path.resolve(dir, "test.sqlite"));
  const anyTransaction = await Transaction.count();
  assert.ok(anyTransaction > 0);
  console.log(`\nWeb browser verification successful (${passed} checks passed).`);
}

run()
  .catch((error) => {
    console.error("\nWeb browser verification FAILED:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
