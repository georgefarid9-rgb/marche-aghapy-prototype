// Feature 2 — Dashboard and Reports.
// Every route calls the <<controller>> ReportHandler, which follows the Feature 2
// sequence diagrams. ReportHandler already returns { ok, message, ... } objects.
//
// One ReportHandler per generated report: generating a report returns its reportId, and
// every later step (another period, filter, export, close) names that reportId. Two
// browser tabs therefore work on two different reports and can never change each other's
// report, filter or export. Dashboard and report-type requests use a fresh handler.

const fs = require("fs");
const path = require("path");
const express = require("express");
const ReportHandler = require("../../controllers/ReportHandler");
const ReportExport = require("../../models/ReportExport");
const { Op } = require("sequelize");
const { Sale } = require("../../models");
const { today } = require("../../utils/dates");
const { route } = require("./respond");
const { reconcileAlerts, exclusiveDatabaseWork } = require("../../utils/alertReconciliation");

const router = express.Router();

// Open reports: reportId -> the ReportHandler that generated it. The oldest are dropped
// after MAX_OPEN_REPORTS so an idle demo does not keep growing.
const MAX_OPEN_REPORTS = 50;
const openReports = new Map();

function remember(reportId, handler) {
  openReports.set(reportId, handler);
  while (openReports.size > MAX_OPEN_REPORTS) {
    openReports.delete(openReports.keys().next().value);
  }
}

// The handler of an open report, or a 404 response when it is unknown or closed.
function handlerFor(req, res) {
  const handler = openReports.get(req.params.reportId);
  if (!handler) {
    res.status(404).json({ ok: false, message: `Report ${req.params.reportId} is not open. Generate the report again.` });
    return null;
  }
  return handler;
}

function send(res, result) {
  res.status(result.ok || result.reportStatus === "noData" ? 200 : 400).json(result);
}

// Steps 1-3: open the dashboard (refreshSummary). 2a: refresh.
// Alerts are reconciled first so the counts include products that expired today.
// The day's DashboardSummary is created by the first request of the day, so requests that
// save it run one at a time (two tabs opening the dashboard together would otherwise both
// try to create SUM-<date>).
router.get(
  "/",
  route(async (req, res) => {
    await reconcileAlerts();
    send(res, await exclusiveDatabaseWork(() => new ReportHandler().openDashboard()));
  })
);
router.post(
  "/refresh",
  route(async (req, res) => {
    await reconcileAlerts();
    send(res, await exclusiveDatabaseWork(() => new ReportHandler().refreshDashboard()));
  })
);

// Wireframe 2.1 "Sales – last 7 days": the daily total of the recorded sales (Sale
// records), today included, so the chart agrees with the "Today's sales" tile and the
// Sales Report.
router.get(
  "/sales-week",
  route(async (req, res) => {
    const days = [];
    const end = new Date(`${today()}T00:00:00Z`);
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(end);
      day.setUTCDate(end.getUTCDate() - i);
      days.push(day.toISOString().slice(0, 10));
    }
    const sales = await Sale.findAll({ where: { saleDate: { [Op.between]: [days[0], days[6]] } } });
    const cents = Object.fromEntries(days.map((d) => [d, 0]));
    for (const sale of sales) {
      const key = String(sale.saleDate).slice(0, 10);
      if (key in cents) cents[key] += Math.round(Number(sale.totalAmount) * 100);
    }
    res.json({ ok: true, days: days.map((date) => ({ date, total: cents[date] / 100 })) });
  })
);

// Step 4: the available report types.
router.get(
  "/reports",
  route(async (req, res) => send(res, await exclusiveDatabaseWork(() => new ReportHandler().viewReports())))
);

// Steps 5-6 (5a/5b/5c, 6a): generate a report. The answer carries its reportId.
router.post(
  "/reports",
  route(async (req, res) => {
    const { reportType, periodStart, periodEnd } = req.body;
    const handler = new ReportHandler();
    const result = await exclusiveDatabaseWork(() => handler.selectReport(reportType, periodStart, periodEnd));
    if (result.ok && result.reportId) remember(result.reportId, handler);
    send(res, result);
  })
);

// 5b: another sales period.
router.post(
  "/reports/:reportId/period",
  route(async (req, res) => {
    const handler = handlerFor(req, res);
    if (handler) send(res, await handler.selectSalesPeriod(req.body.periodStart, req.body.periodEnd));
  })
);

// 8a / 8b: filter.
router.post(
  "/reports/:reportId/filter",
  route(async (req, res) => {
    const handler = handlerFor(req, res);
    if (!handler) return;
    const { startDate, endDate, productId, category } = req.body;
    const blankToNull = (value) => (value === undefined || value === null || String(value).trim() === "" ? null : value);
    send(
      res,
      await handler.applyFilter(blankToNull(startDate), blankToNull(endDate), blankToNull(productId), blankToNull(category))
    );
  })
);

// 10: export (PDF or CSV), then download the file.
router.post(
  "/reports/:reportId/export",
  route(async (req, res) => {
    const handler = handlerFor(req, res);
    if (handler) send(res, await handler.exportReport(req.body.format));
  })
);

router.get("/exports/:fileName", (req, res) => {
  const fileName = path.basename(req.params.fileName);
  const anExport = ReportExport.build({ fileName });
  const filePath = anExport.getFilePath();
  if (!/\.(pdf|csv)$/i.test(fileName) || !fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, message: "Export file not found." });
    return;
  }
  // Wireframe 2.7: the user may choose the file name.
  const wanted = String(req.query.name || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const extension = path.extname(fileName);
  res.download(filePath, wanted ? `${wanted.replace(/\.(pdf|csv)$/i, "")}${extension}` : fileName);
});

// 10b: close the report.
router.post(
  "/reports/:reportId/close",
  route(async (req, res) => {
    const handler = handlerFor(req, res);
    if (!handler) return;
    const result = await handler.closeReport();
    openReports.delete(req.params.reportId);
    send(res, result);
  })
);

module.exports = router;
