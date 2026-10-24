const sequelize = require("../src/database");

const {
  BusinessPartner,
  Supplier,
  Customer,
  PerformanceRecord,
  Employee,
} = require("../src/models");

async function verifyProfiles() {
  try {
    await sequelize.authenticate();

    // 1. Read the supplier with its BusinessPartner profile and performance records.
    const supplier = await Supplier.findOne({
      where: { supplierId: "SUP-001" },
      include: [
        { model: BusinessPartner, as: "partner" },
        {
          model: PerformanceRecord,
          as: "performanceRecords",
          include: [{ model: Employee, as: "recordedBy" }],
        },
      ],
    });

    if (!supplier || !supplier.partner) {
      console.log(
        "Supplier profile was not found. Run npm run db:setup and npm run db:seed first."
      );
      return;
    }

    console.log(
      `Supplier ${supplier.supplierId} (${supplier.partner.partnerName}), ` +
        `status ${supplier.partner.partnerStatus}, terms ${supplier.paymentTerms}`
    );

    // 2. PerformanceRecord methods on each delivery.
    console.log("\nDeliveries:");
    for (const r of supplier.performanceRecords) {
      console.log(
        `  ${r.recordId}  ordered ${r.quantityOrdered}, received ${r.quantityReceived}` +
          `  fillRate ${r.calculateFillRate()}%  delay ${r.calculateDeliveryDelay()} day(s)` +
          `  discrepancy ${r.flagDiscrepancy()}  (recorded by ${r.recordedBy.employeeName})`
      );
    }

    // 3. Supplier.evaluatePerformance(): average fill rate across deliveries.
    console.log(`\nevaluatePerformance(): ${await supplier.evaluatePerformance()}%`);

    // 4. Customer.retrieveInfo(): customer profile through the generalization.
    const customer = await Customer.findByPk("CUST-001");
    console.log("\nretrieveInfo() for CUST-001:");
    console.dir(await customer.retrieveInfo());

    // 5. BusinessPartner.updateProfile() and changeStatus().
    const partner = await customer.getPartner();
    const originalName = partner.partnerName;
    await partner.updateProfile({ partnerName: "Sample Customer (updated)", partnerId: "IGNORED" });
    await partner.changeStatus("Inactive");
    await partner.reload();
    console.log(
      `\nupdateProfile() + changeStatus(): ${partner.partnerId} is now ` +
        `"${partner.partnerName}", ${partner.partnerStatus}`
    );

    // 6. changeStatus() rejects an unknown status.
    try {
      await partner.changeStatus("Deleted");
      console.log("changeStatus(): ERROR - invalid status was accepted.");
    } catch (err) {
      console.log(`changeStatus(): invalid status rejected -> ${err.message}`);
    }

    // Put the sample customer back so this script can be run more than once.
    await partner.updateProfile({ partnerName: originalName });
    await partner.changeStatus("Active");

    console.log("\nProfile verification successful.");
  } catch (error) {
    console.error("Profile verification failed:");
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

verifyProfiles();
