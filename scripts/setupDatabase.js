const sequelize = require("../src/database");

require("../src/models");

async function setupDatabase() {
  try {
    await sequelize.authenticate();

    console.log("Database connection successful.");

    await sequelize.query("PRAGMA foreign_keys = ON");

    await sequelize.sync({
      force: true,
    });

    console.log("Database tables created successfully.");
  } catch (error) {
    console.error("Database setup failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

setupDatabase();