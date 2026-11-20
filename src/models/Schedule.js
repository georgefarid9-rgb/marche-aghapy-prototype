const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class Schedule extends Model {
  // +addShift(shift : EmployeeShift) : void
  // Add a shift to this schedule. The shift must fall inside the schedule period.
  async addShift(shift) {
    if (shift.shiftDate < this.startDate || shift.shiftDate > this.endDate) {
      throw new Error(
        `Shift ${shift.shiftId} on ${shift.shiftDate} is outside the schedule period ${this.startDate} to ${this.endDate}.`
      );
    }

    shift.scheduleId = this.scheduleId;
    await shift.validate();
    await shift.save();
  }

  // +displayShifts() : EmployeeShift[]
  // Return every shift in this schedule for display.
  async displayShifts() {
    return this.getShifts({
      order: [
        ["shiftDate", "ASC"],
        ["startTime", "ASC"],
      ],
    });
  }

  // +findShift(shiftId : String) : EmployeeShift
  // Find one shift in this schedule. Returns null when the shift is not in this schedule.
  async findShift(shiftId) {
    const [shift] = await this.getShifts({ where: { shiftId } });
    return shift || null;
  }

  // +save() : void
  // save() is inherited from Sequelize's Model and stores the schedule in the database.
  // The {startDate <= endDate} rule below is checked every time the schedule is saved.
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
    validate: {
      // Invariant {startDate <= endDate}
      startDateNotAfterEndDate() {
        if (this.startDate && this.endDate && this.startDate > this.endDate) {
          throw new Error(
            `Schedule ${this.scheduleId}: start date ${this.startDate} must be on or before end date ${this.endDate}.`
          );
        }
      },
    },
    modelName: "Schedule",
    tableName: "schedules",
    timestamps: false,
  }
);

module.exports = Schedule;
