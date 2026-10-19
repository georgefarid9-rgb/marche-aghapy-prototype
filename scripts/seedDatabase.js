const sequelize = require("../src/database");

const {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

async function seedDatabase() {
  try {
    await sequelize.authenticate();

    await Supplier.create({
      supplierId: "SUP-001",
      supplierName: "Sample Supplier",
      leadTimeDays: 7,
    });

    await Product.create({
      productId: "PROD-001",
      productName: "Foul Medames",
      description: "Egyptian canned fava beans",
      supplierId: "SUP-001",
    });

    await InventoryRecord.create({
      inventoryId: "INV-001",
      quantityOnHand: 20,
      expiryDate: "2027-03-30",
      lastUpdated: new Date(),
      productId: "PROD-001",
    });

    await RestockAlert.create({
      alertId: "ALERT-001",
      reorderInformation: "Reorder from supplier",
      inventoryId: "INV-001",
    });

    console.log("Sample data inserted successfully.");
  } catch (error) {
    console.error("Seeding failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

seedDatabase();