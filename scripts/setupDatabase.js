
const fs = require("fs");
const sequelize = require("../src/database");

require("../src/models");

async function setupDatabase() {
  try {
    const databasePath = sequelize.options.storage;

    // Protect existing SQLite databases from accidental resets.
    if (fs.existsSync(databasePath)) {
      throw new Error(
        `Database already exists: ${databasePath}\n` +
        "Setup stopped to protect existing data. " +
        "Use a new database path for fresh initialization."
      );
    }

    await sequelize.authenticate();
    console.log("Database connection successful.");

    await sequelize.query("PRAGMA foreign_keys = ON");

    // Create the schema without forcefully dropping tables.
    await sequelize.sync();

    console.log("Database tables created successfully.");
  } catch (error) {
    console.error("Database setup failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

setupDatabase();
