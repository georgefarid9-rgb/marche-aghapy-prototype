
const path = require("path");
const { Sequelize } = require("sequelize");

// Default database used by the existing prototype.
const defaultDatabasePath = path.join(
  __dirname,
  "..",
  "database",
  "marche-aghapy.sqlite"
);

// Allow a separate database to be selected for testing.
// If SQLITE_PATH is not provided, use the original database.
const databasePath = process.env.SQLITE_PATH
  ? path.resolve(__dirname, "..", process.env.SQLITE_PATH)
  : defaultDatabasePath;

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: databasePath,
  logging: false,
});

module.exports = sequelize;
