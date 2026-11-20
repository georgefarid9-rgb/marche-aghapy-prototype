const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

const SHIFT_STATUSES = ["Draft", "Published", "Completed", "Cancelled"];

// Statuses an employee can see in their own schedule (after the owner publishes).
const VISIBLE_TO_EMPLOYEE = ["Published", "Completed"];

class EmployeeShift extends Model {
  // +validate() : Boolean
  // Check the shift is valid: Sequelize's field checks, then {startTime < endTime}.
  // Returns true when valid; throws an error that explains the problem otherwise.
  async validate(options) {
    await super.validate(options);

    if (this.endTime <= this.startTime) {
      throw new Error(
        `Shift ${this.shiftId}: end time ${this.endTime} must be after start time ${this.startTime}.`
      );
    }

    return true;
  }

  // +updateShift(startTime : Time, endTime : Time) : Boolean
  // Change the start and end time, check the shift with validate(), and save it.
  // Returns isValid, as in the sequence diagrams: true when the shift was saved;
  // false when the times are invalid (sub-flow 8a), in which case the old times are
  // put back, nothing is saved, and the reason is kept in validationMessage.
  async updateShift(startTime, endTime) {
    const oldStart = this.previous("startTime") ?? this.startTime;
    const oldEnd = this.previous("endTime") ?? this.endTime;

    this.startTime = startTime;
    this.endTime = endTime;

    try {
      await this.validate();
    } catch (error) {
      this.startTime = oldStart;
      this.endTime = oldEnd;
      this.validationMessage = error.message;
      return false;
    }

    this.validationMessage = null;
    await this.save();
    return true;
  }

  // +cancelShift() : Boolean
  // Mark the shift as Cancelled so it no longer appears in the employee's schedule.
  // Returns false (and changes nothing) if the shift was already completed or cancelled.
  async cancelShift() {
    if (this.shiftStatus === "Completed" || this.shiftStatus === "Cancelled") {
      this.validationMessage = `Shift ${this.shiftId} is already ${this.shiftStatus.toLowerCase()}.`;
      return false;
    }

    this.shiftStatus = "Cancelled";
    this.validationMessage = null;
    await this.save();
    return true;
  }
}

EmployeeShift.init(
  {
    shiftId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    shiftDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    // -role[0..1] : String  (use case step 7: the role worked on this shift, e.g. Cashier)
    role: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    shiftStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Draft",
      validate: {
        isIn: [SHIFT_STATUSES],
      },
    },
  },
  {
    sequelize,
    modelName: "EmployeeShift",
    tableName: "employee_shifts",
    timestamps: false,
  }
);

EmployeeShift.SHIFT_STATUSES = SHIFT_STATUSES;
EmployeeShift.VISIBLE_TO_EMPLOYEE = VISIBLE_TO_EMPLOYEE;

module.exports = EmployeeShift;
