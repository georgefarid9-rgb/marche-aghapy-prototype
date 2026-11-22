const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");
const { isValidDate } = require("../utils/reportHelpers");

// Feature 2 - the criteria the Store Owner uses to narrow a report (subflow 8a).
//
//   +validateCriteria() : Boolean
//   +updateCriteria(criteria : String) : void
//   report[1..1] : Report
//
// Every criterion is optional, but at least one must be given.

const CRITERIA_FIELDS = ["startDate", "endDate", "productId", "category"];

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

class ReportFilter extends Model {
  // +validateCriteria() : Boolean
  // True when the criteria can be used (alternate flow 8b shows the problem otherwise).
  validateCriteria() {
    return this.criteriaProblem() === null;
  }

  // Why the criteria are invalid or incomplete, or null when they are fine.
  criteriaProblem() {
    if (CRITERIA_FIELDS.every((field) => isBlank(this[field]))) {
      return "enter at least one criterion (start date, end date, product or category).";
    }
    // (Sequelize turns an impossible date such as 2026-13-40 into "Invalid date".)
    if (!isBlank(this.startDate) && !isValidDate(this.startDate)) {
      return "the start date is not a real date written as YYYY-MM-DD.";
    }
    if (!isBlank(this.endDate) && !isValidDate(this.endDate)) {
      return "the end date is not a real date written as YYYY-MM-DD.";
    }
    if (!isBlank(this.startDate) && !isBlank(this.endDate) && this.startDate > this.endDate) {
      return "the start date must be on or before the end date.";
    }
    return null;
  }

  // +updateCriteria(criteria : String) : void
  // criteria is a JSON string, for example '{"category":"Canned Foods","endDate":null}'.
  // Only the fields it contains are changed; an empty value clears that criterion.
  // The change is saved when the filter is applied (Report.applyFilter).
  updateCriteria(criteria) {
    if (typeof criteria !== "string") {
      throw new Error("Filter criteria must be a JSON string.");
    }

    let changes;
    try {
      changes = JSON.parse(criteria);
    } catch {
      throw new Error("Filter criteria are not valid JSON.");
    }
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new Error("Filter criteria must be a JSON object.");
    }

    const unknown = Object.keys(changes).filter((field) => !CRITERIA_FIELDS.includes(field));
    if (unknown.length > 0) {
      throw new Error(`Unknown filter criteria: ${unknown.join(", ")}.`);
    }

    for (const [field, value] of Object.entries(changes)) {
      this[field] = isBlank(value) ? null : String(value).trim();
    }
  }
}

ReportFilter.init(
  {
    filterId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reportId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: "reports", key: "reportId" },
    },

    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // {startDate <= endDate}
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    productId: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "ReportFilter",
    tableName: "report_filters",
    timestamps: false,

    validate: {
      // Never save criteria that validateCriteria() would reject.
      criteriaAreValid() {
        const problem = this.criteriaProblem();
        if (problem) {
          throw new Error(`Invalid filter: ${problem}`);
        }
      },
    },
  }
);

module.exports = ReportFilter;
