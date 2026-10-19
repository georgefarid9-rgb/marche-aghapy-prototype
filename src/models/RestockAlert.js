const { Model, DataTypes } = require("sequelize");
const sequelize = require("../database");

class RestockAlert extends Model {}

RestockAlert.init(
  {
    alertId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    reorderInformation: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "RestockAlert",
    tableName: "restock_alerts",
    timestamps: false,
  }
);

module.exports = RestockAlert;