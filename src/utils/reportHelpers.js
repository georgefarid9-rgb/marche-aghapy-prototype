// Small helpers shared by the Feature 2 (Dashboard and Reports) classes.
// Dates are plain "YYYY-MM-DD" strings in UTC, the same as src/utils/dates.js.

const { today, daysBetween } = require("./dates");

// The three report types the Store Owner can pick (UC 02, step 4).
const REPORT_TYPES = ["inventory", "sales", "expiryRestock"];

// reportStatus {generated, noData, closed} in the class diagram.
const REPORT_STATUSES = ["generated", "noData", "closed"];

// ReportExport.exportFormat {PDF, CSV} in the class diagram.
const EXPORT_FORMATS = ["PDF", "CSV"];

// Same window as InventoryRecord.evaluateExpiryConditions() (Feature 1).
const DEFAULT_EXPIRY_WINDOW_DAYS = 7;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// True for a real calendar date written as "YYYY-MM-DD" (so "2026-02-30" is false).
function isValidDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Turn a Date or a "YYYY-MM-DD..." string into "YYYY-MM-DD". Returns null when empty.
function toDateOnly(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

// Throw a clear error unless periodStart and periodEnd are valid and in order.
// Constraint from the class diagram: {periodStart <= periodEnd}.
function checkPeriod(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) {
    throw new Error("Please choose both a period start and a period end.");
  }
  if (!isValidDate(periodStart) || !isValidDate(periodEnd)) {
    throw new Error("Period dates must be real dates written as YYYY-MM-DD.");
  }
  if (periodStart > periodEnd) {
    throw new Error("The period start must be on or before the period end.");
  }
}

// Round money to cents so totals do not show values like 10.299999999.
function roundMoney(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

// Low stock means the Feature 1 stock status is LOW_STOCK or OUT_OF_STOCK.
function isLowStock(inventoryRecord) {
  const status = inventoryRecord.evaluateInventoryStatus();
  return status === "LOW_STOCK" || status === "OUT_OF_STOCK";
}

// Near expiry means the expiry date is within windowDays from today.
// Items that are already expired are included, because they also need action.
function isNearExpiry(expiryDate, windowDays = DEFAULT_EXPIRY_WINDOW_DAYS) {
  if (!expiryDate) {
    return false;
  }
  return daysBetween(today(), toDateOnly(expiryDate)) <= windowDays;
}

module.exports = {
  REPORT_TYPES,
  REPORT_STATUSES,
  EXPORT_FORMATS,
  DEFAULT_EXPIRY_WINDOW_DAYS,
  isValidDate,
  toDateOnly,
  checkPeriod,
  roundMoney,
  isLowStock,
  isNearExpiry,
};
