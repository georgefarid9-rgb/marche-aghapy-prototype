const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Schedule extends Model {
  // Add a shift to this schedule. The shift must fall inside the schedule period.
  async addShift(shift) {
    if (shift.shiftDate < this.startDate || shift.shiftDate > this.endDate) {
      throw new Error(
        `Shift ${shift.shiftId} on ${shift.shiftDate} is outside the schedule period ${this.startDate} to ${this.endDate}.`
      );
    }

    shift.scheduleId = this.scheduleId;
    await shift.validate();
    return shift.save();
  }

  // Return every shift in this schedule for display.
  async displayShifts() {
    return this.getShifts({
      order: [
        ["shiftDate", "ASC"],
        ["startTime", "ASC"],
      ],
    });
  }

  // save() is inherited from Sequelize's Model and stores the schedule in the database.
}

Schedule.init(
  {
    scheduleId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Schedule",
    tableName: "schedules",
    timestamps: false,
  }
);

module.exports = Schedule;
