const sequelize = require("../src/database");

async function testDatabase() {
  try {
    await sequelize.authenticate();
    console.log("Database connection successful.");
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

testDatabase();
