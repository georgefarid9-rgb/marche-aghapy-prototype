// Feature 2 — Dashboard and Reports.
// Every route calls the <<controller>> ReportHandler, which follows the Feature 2
// sequence diagrams. ReportHandler already returns { ok, message, ... } objects.
// The demo has one Store Owner, so one ReportHandler keeps the open report.

const fs = require("fs");
const path = require("path");
const express = require("express");
const ReportHandler = require("../../controllers/ReportHandler");
const ReportExport = require("../../models/ReportExport");
const { Op } = require("sequelize");
const { Transaction } = require("../../models");
const { today } = require("../../utils/dates");
const { route } = require("./respond");

const router = express.Router();
const handler = new ReportHandler();

function send(res, result) {
  res.status(result.ok || result.reportStatus === "noData" ? 200 : 400).json(result);
}

// Steps 1-3: open the dashboard (refreshSummary). 2a: refresh.
router.get("/", route(async (req, res) => send(res, await handler.openDashboard())));
router.post("/refresh", route(async (req, res) => send(res, await handler.refreshDashboard())));

// Wireframe 2.1 "Sales – last 7 days": daily sales revenue recorded in the ledger
// (Feature 4 Revenue transactions in the "Daily sales" category), today included.
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
    const revenue = await Transaction.findAll({
      where: { transactionType: "Revenue", category: "Daily sales", date: { [Op.between]: [days[0], days[6]] } },
    });
    const totals = Object.fromEntries(days.map((d) => [d, 0]));
    for (const t of revenue) {
      const key = String(t.date).slice(0, 10);
      if (key in totals) totals[key] += Number(t.amount);
    }
    res.json({ ok: true, days: days.map((date) => ({ date, total: Math.round(totals[date] * 100) / 100 })) });
  })
);

// Step 4: the available report types.
router.get("/reports", route(async (req, res) => send(res, await handler.viewReports())));

// Steps 5-6 (5a/5b/5c, 6a): generate a report.
router.post(
  "/reports",
  route(async (req, res) => {
    const { reportType, periodStart, periodEnd } = req.body;
    send(res, await handler.selectReport(reportType, periodStart, periodEnd));
  })
);

// 5b: another sales period.
router.post(
  "/reports/period",
  route(async (req, res) => {
    send(res, await handler.selectSalesPeriod(req.body.periodStart, req.body.periodEnd));
  })
);

// 8a / 8b: filter.
router.post(
  "/reports/filter",
  route(async (req, res) => {
    const { startDate, endDate, productId, category } = req.body;
    const blankToNull = (value) => (value === undefined || String(value).trim() === "" ? null : value);
    send(
      res,
      await handler.applyFilter(blankToNull(startDate), blankToNull(endDate), blankToNull(productId), blankToNull(category))
    );
  })
);

// 10: export (PDF or CSV), then download the file.
router.post("/reports/export", route(async (req, res) => send(res, await handler.exportReport(req.body.format))));

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

// 10b: close the report. 6a: back to report selection.
router.post("/reports/close", route(async (req, res) => send(res, await handler.closeReport())));
router.post("/reports/back", route(async (req, res) => send(res, await handler.returnToReportSelection())));

module.exports = router;
