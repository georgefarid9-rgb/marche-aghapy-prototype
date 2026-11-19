const fs = require("fs");
const path = require("path");
const { DataTypes } = require("sequelize");
const sequelize = require("../src/database");

const {
  BusinessPartner,
  Customer,
  Notification,
  PerformanceRecord,
  Supplier,
} = require("../src/models");

// Feature 3 migration for a database created before Feature 3, or before its
// prototype-2 changes. It keeps all existing data. Safe to run more than once.
//
//   1. Backs up the database (VACUUM INTO database/marche-aghapy-before-feature3-<time>.sqlite)
//   2. Creates the new tables if missing: business_partners, customers, performance_records
//   3. Adds the new Supplier columns if missing: contactInformation, paymentTerms, partnerId
//      (+ a unique index on partnerId)
//   4. Gives every existing supplier without a profile a BusinessPartner
//      (partnerId "BP-<supplierId>", name copied from supplierName)
//   5. Upgrades performance_records for unplanned deliveries (alternate flow 6b):
//      adds isUnplanned and makes quantityOrdered and expectedDeliveryDate optional.
//      SQLite cannot relax NOT NULL in place, so the table is rebuilt and every
//      row is copied over inside one transaction.
//   6. Creates the notifications table (owner notifications for flows 6a and 6b)
//   7. Adds the unique indexes that enforce alternate flow 5a in the database:
//      one supplier profile per name, one customer profile per phone number.
//      If existing data already has duplicates, the migration stops and lists
//      them so they can be fixed first (nothing is deleted).
//
// Do NOT use this on a brand-new database: use npm run db:setup instead.

// Alternate flow 5a: list supplier names and customer phone numbers used by
// more than one profile. The unique indexes cannot be added while they exist.
async function stopOnDuplicateProfiles() {
  const tables = await sequelize.getQueryInterface().showAllTables();
  const duplicates = [];
  if (tables.includes("business_partners")) {
    const [rows] = await sequelize.query(
      "SELECT partnerName AS value, COUNT(*) AS n FROM business_partners " +
        "WHERE partnerType = 'Supplier' GROUP BY partnerName HAVING COUNT(*) > 1"
    );
    duplicates.push(...rows.map((row) => `supplier name "${row.value}" (${row.n} profiles)`));
  }
  if (tables.includes("customers")) {
    const [rows] = await sequelize.query(
      "SELECT phoneNumber AS value, COUNT(*) AS n FROM customers " +
        "WHERE phoneNumber IS NOT NULL GROUP BY phoneNumber HAVING COUNT(*) > 1"
    );
    duplicates.push(...rows.map((row) => `customer phone "${row.value}" (${row.n} profiles)`));
  }
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate profiles found: ${duplicates.join("; ")}. ` +
        "Rename or merge them, then run this migration again."
    );
  }
}

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

    // Duplicates would stop the unique indexes (step 7), which sync() below
    // also adds, so check for them before changing anything.
    await stopOnDuplicateProfiles();

    // 2. New tables (sync without force/alter only creates missing tables
    //    and their indexes).
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
      // Two old suppliers with the same name would break the 5a rule.
      const names = unlinked.map((supplier) => supplier.supplierName);
      const repeated = names.filter((name, i) => names.indexOf(name) !== i);
      if (repeated.length > 0) {
        throw new Error(
          `Several suppliers share a name: ${[...new Set(repeated)].join(", ")}. ` +
            "Rename them, then run this migration again."
        );
      }
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

    // 5. Unplanned deliveries in performance_records.
    const recordColumns = await queryInterface.describeTable("performance_records");
    const needsRebuild =
      !recordColumns.isUnplanned ||
      recordColumns.quantityOrdered.allowNull === false ||
      recordColumns.expectedDeliveryDate.allowNull === false;

    if (!needsRebuild) {
      console.log("Table performance_records already supports unplanned deliveries.");
    } else {
      const copied = [
        "recordId",
        "deliveryDate",
        "expectedDeliveryDate",
        "quantityOrdered",
        "quantityReceived",
        "conditionRating",
        "supplierId",
        "employeeId",
      ];
      const isUnplannedSource = recordColumns.isUnplanned ? "isUnplanned" : "0";

      await sequelize.query("PRAGMA foreign_keys = OFF");
      try {
        await sequelize.transaction(async (transaction) => {
          await sequelize.query(
            "ALTER TABLE performance_records RENAME TO performance_records_before_6b",
            { transaction }
          );
          await PerformanceRecord.sync({ transaction });
          await sequelize.query(
            `INSERT INTO performance_records (${copied.join(", ")}, isUnplanned) ` +
              `SELECT ${copied.join(", ")}, ${isUnplannedSource} FROM performance_records_before_6b`,
            { transaction }
          );
          const [[before]] = await sequelize.query(
            "SELECT COUNT(*) AS n FROM performance_records_before_6b",
            { transaction }
          );
          const [[after]] = await sequelize.query(
            "SELECT COUNT(*) AS n FROM performance_records",
            { transaction }
          );
          if (before.n !== after.n) {
            throw new Error(`Copied ${after.n} of ${before.n} performance records; rolled back.`);
          }
          await sequelize.query("DROP TABLE performance_records_before_6b", { transaction });
          console.log(
            `Table performance_records rebuilt for unplanned deliveries (${after.n} record(s) kept).`
          );
        });
      } finally {
        await sequelize.query("PRAGMA foreign_keys = ON");
      }
    }

    // 6. Owner notifications (alternate flows 6a, 6b).
    await Notification.sync();
    console.log("Table ready: notifications.");

    // 7. Unique indexes for alternate flow 5a.
    await stopOnDuplicateProfiles(); // also checked before step 2
    await sequelize.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS business_partners_unique_supplier_name " +
        "ON business_partners (partnerName) WHERE partnerType = 'Supplier'"
    );
    await sequelize.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS customers_unique_phone_number ON customers (phoneNumber)"
    );
    console.log("Unique indexes ready: supplier name, customer phone number.");

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
