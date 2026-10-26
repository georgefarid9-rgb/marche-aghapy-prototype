
const path = require("path");
const { Sequelize } = require("sequelize");

const databaseFile =
  process.env.DATABASE_FILE || "marche-aghapy.sqlite";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(__dirname, "..", "database", databaseFile),
  logging: false,
});

module.exports = sequelize;
