const fs = require("node:fs");
const path = require("node:path");
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { EXPORT_FORMATS } = require("../utils/reportHelpers");
const { toCsv, toPdf } = require("../utils/reportFiles");

// Feature 2 - one exported copy of a report (normal flow, export step).
//
//   +createExportFile() : void
//   report[1..1] : Report
//
// Files are written to the exports/ folder of the project (not uploaded to GitHub).
// Set REPORT_EXPORT_DIR to use another folder, as the test script does.

function exportDirectory() {
  return process.env.REPORT_EXPORT_DIR
    ? path.resolve(process.env.REPORT_EXPORT_DIR)
    : path.join(__dirname, "..", "..", "exports");
}

class ReportExport extends Model {
  // +createExportFile() : void
  // Writes the file in exportFormat and sets fileName.
  // this.content (title, summary lines, columns, rows) is filled in by Report.exportReport().
  createExportFile() {
    if (!EXPORT_FORMATS.includes(this.exportFormat)) {
      throw new Error(`Export format must be ${EXPORT_FORMATS.join(" or ")}.`);
    }
    if (!this.content || !Array.isArray(this.content.rows)) {
      throw new Error("There is no report content to export. Use Report.exportReport(format).");
    }

    const extension = this.exportFormat.toLowerCase();
    this.fileName = `${this.reportId}-${this.exportId}.${extension}`;

    const data = this.exportFormat === "PDF" ? toPdf(this.content) : toCsv(this.content);
    fs.mkdirSync(exportDirectory(), { recursive: true });
    fs.writeFileSync(this.getFilePath(), data);
  }

  // Where the exported file is on this computer.
  getFilePath() {
    return path.join(exportDirectory(), this.fileName);
  }

  // Used when the export could not be saved in the database.
  removeExportFile() {
    if (this.fileName) {
      fs.rmSync(this.getFilePath(), { force: true });
    }
  }
}

ReportExport.init(
  {
    exportId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reportId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    exportDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // {PDF, CSV} in the class diagram. Feature 2 only creates these two formats.
    // (FinancialReport, Feature 4, still offers Excel, so the column itself is not limited.)
    exportFormat: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "ReportExport",
    tableName: "report_exports",
    timestamps: false,
  }
);

module.exports = ReportExport;
