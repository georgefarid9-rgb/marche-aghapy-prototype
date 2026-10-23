const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

const SHIFT_STATUSES = ["Draft", "Published", "Completed", "Cancelled"];

class EmployeeShift extends Model {
  // Check the shift is valid: Sequelize's field checks, then end time after start time.
  async validate(options) {
    await super.validate(options);

    if (this.endTime <= this.startTime) {
      throw new Error(
        `Shift ${this.shiftId}: end time ${this.endTime} must be after start time ${this.startTime}.`
      );
    }

    return true;
  }

  // Change the start and end time, check the shift, then save it.
  async updateShift(startTime, endTime) {
    this.startTime = startTime;
    this.endTime = endTime;
    await this.validate();
    return this.save();
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
