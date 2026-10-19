const sequelize = require("../src/database");

const {
  Supplier,
  Product,
  InventoryRecord,
  RestockAlert,
} = require("../src/models");

async function verifyPrototype() {
  try {
    await sequelize.authenticate();

    const product = await Product.findOne({
      where: {
        productId: "PROD-001",
      },

      include: [
        {
          model: Supplier,
          as: "supplier",
        },
        {
          model: InventoryRecord,
          as: "inventoryRecord",
          include: [
            {
              model: RestockAlert,
              as: "restockAlerts",
            },
          ],
        },
      ],
    });

    if (!product) {
      console.log("Product was not found.");
      return;
    }

    console.dir(product.toJSON(), {
      depth: null,
    });

    console.log("Prototype verification successful.");
  } catch (error) {
    console.error("Prototype verification failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

verifyPrototype();