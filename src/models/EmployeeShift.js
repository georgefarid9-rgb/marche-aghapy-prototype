const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

const SHIFT_STATUSES = ["Draft", "Published", "Completed", "Cancelled"];

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

module.exports = EmployeeShift;
