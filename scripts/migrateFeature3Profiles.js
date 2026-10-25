const fs = require("fs");
const path = require("path");
const { DataTypes } = require("sequelize");
const sequelize = require("../src/database");

const {
  BusinessPartner,
  Customer,
  PerformanceRecord,
  Supplier,
} = require("../src/models");

// Feature 3 migration for a database created BEFORE Feature 3 existed.
// It keeps all existing data. Safe to run more than once.
//
//   1. Backs up the database (VACUUM INTO database/marche-aghapy-before-feature3-<time>.sqlite)
//   2. Creates the new tables if missing: business_partners, customers, performance_records
//   3. Adds the new Supplier columns if missing: contactInformation, paymentTerms, partnerId
//      (+ a unique index on partnerId)
//   4. Gives every existing supplier without a profile a BusinessPartner
//      (partnerId "BP-<supplierId>", name copied from supplierName)
//
// Do NOT use this on a brand-new database: use npm run db:setup instead.

async function migrateFeature3Profiles() {
  try {
    const databasePath = sequelize.options.storage;

    if (!fs.existsSync(databasePath)) {
      throw new Error(
        `No database found at ${databasePath}. Nothing to migrate; use npm run db:setup for a new database.`
      );
    }

    await sequelize.authenticate();
    const queryInterface = sequelize.getQueryInterface();

    const tables = await queryInterface.showAllTables();
    if (!tables.includes("suppliers")) {
      throw new Error("The suppliers table does not exist. This is not a Feature 1 database.");
    }

    // 1. Backup first. Named *.sqlite so Git ignores it.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      path.dirname(databasePath),
      `marche-aghapy-before-feature3-${stamp}.sqlite`
    );
    await sequelize.query("VACUUM INTO ?", { replacements: [backupPath] });
    console.log(`Backup created: ${backupPath}`);

    // 2. New tables (sync without force/alter only creates missing tables).
    await BusinessPartner.sync();
    await Customer.sync();
    await PerformanceRecord.sync();
    console.log("Tables ready: business_partners, customers, performance_records.");

    // 3. New Supplier columns.
    const columns = await queryInterface.describeTable("suppliers");
    const newColumns = {
      contactInformation: { type: DataTypes.STRING, allowNull: true },
      paymentTerms: { type: DataTypes.STRING, allowNull: true },
      partnerId: {
        type: DataTypes.STRING,
        allowNull: true,
        references: { model: "business_partners", key: "partnerId" },
      },
    };

    for (const [name, definition] of Object.entries(newColumns)) {
      if (columns[name]) {
        console.log(`Column suppliers.${name} already exists.`);
      } else {
        await queryInterface.addColumn("suppliers", name, definition);
        console.log(`Column suppliers.${name} added.`);
      }
    }

    const indexes = await queryInterface.showIndex("suppliers");
    const hasUniquePartnerIndex = indexes.some(
      (index) => index.unique && index.fields.some((field) => field.attribute === "partnerId")
    );
    if (!hasUniquePartnerIndex) {
      await queryInterface.addIndex("suppliers", ["partnerId"], {
        unique: true,
        name: "suppliers_partner_id_unique",
      });
      console.log("Unique index on suppliers.partnerId added.");
    } else {
      console.log("Unique index on suppliers.partnerId already exists.");
    }

    // 4. Give existing suppliers a BusinessPartner profile.
    const unlinked = await Supplier.findAll({ where: { partnerId: null } });
    await sequelize.transaction(async (transaction) => {
      for (const supplier of unlinked) {
        const partnerId = `BP-${supplier.supplierId}`;
        const existing = await BusinessPartner.findByPk(partnerId, { transaction });
        if (existing && existing.partnerType !== "Supplier") {
          throw new Error(`${partnerId} already exists as a ${existing.partnerType}; fix it by hand.`);
        }
        if (!existing) {
          await BusinessPartner.create(
            {
              partnerId,
              partnerName: supplier.supplierName,
              partnerStatus: "Active",
              partnerType: "Supplier",
            },
            { transaction }
          );
        }
        // Use the partner's name as the authoritative one.
        const partner = existing || (await BusinessPartner.findByPk(partnerId, { transaction }));
        supplier.partnerId = partnerId;
        supplier.supplierName = partner.partnerName;
        await supplier.save({ transaction });
        console.log(`Supplier ${supplier.supplierId} linked to ${partnerId}.`);
      }
    });
    if (unlinked.length === 0) {
      console.log("Every supplier already has a BusinessPartner profile.");
    }

    console.log("Feature 3 migration completed successfully.");
  } catch (error) {
    console.error("Feature 3 migration failed:");
    console.error(`  ${error.message}`);
    console.error("No data was deleted. Restore from the backup above if needed.");
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateFeature3Profiles();
