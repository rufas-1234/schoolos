import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

const demoSchoolName = "SchoolOS Demo School";
const demoPrefix = "DEMO TEST ONLY - ";
const demoNote = `${demoPrefix}sample data for accounts and inventory workflow demonstrations; not real transactions or stock.`;

type Row = RowDataPacket & Record<string, unknown>;
type SqlValue = string | number | bigint | boolean | Date | null | Buffer | Uint8Array;

function assertSeedEnabled() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Accounts and inventory demo seeding is disabled in production and Vercel environments.");
  }
  if (process.env.ALLOW_ACCOUNTS_INVENTORY_DEMO_SEED !== "true") {
    throw new Error("Set ALLOW_ACCOUNTS_INVENTORY_DEMO_SEED=true to explicitly enable demo data seeding.");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() || "mysql://localhost/school_management";
  const parsedUrl = new URL(databaseUrl);
  const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  if (!isLocalDatabase) {
    if (process.env.ALLOW_DEMO_SEED_REMOTE !== "true") {
      throw new Error("Demo seeding only runs against a local database by default.");
    }
    if (
      parsedUrl.hostname !== "gateway01.us-east-1.prod.aws.tidbcloud.com" ||
      decodeURIComponent(parsedUrl.pathname.slice(1)) !== "schoolos_app"
    ) {
      throw new Error("Remote demo seeding is restricted to the verified SchoolOS demo database.");
    }
  }
}

async function selectRows<T extends Row>(
  connection: PoolConnection,
  statement: string,
  values: SqlValue[] = [],
): Promise<T[]> {
  const [result] = await connection.execute<T[]>(statement, values);
  return result;
}

async function insertId(connection: PoolConnection, statement: string, values: SqlValue[]): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(statement, values);
  return result.insertId;
}

function assertSame<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`Existing ${label} does not match the demo seed; refusing to change it.`);
  }
}

async function writeAudit(
  connection: PoolConnection,
  schoolId: number,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await connection.execute(
    `INSERT INTO audit_logs
      (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [schoolId, actorUserId, action, resourceType, resourcePublicId, JSON.stringify(changedFields)],
  );
}

async function getOrCreateNamedRecord(
  connection: PoolConnection,
  table: "inventory_categories" | "inventory_suppliers" | "inventory_locations",
  schoolId: number,
  name: string,
  description: string,
): Promise<{ id: number; publicId: string }> {
  const detailsColumn = table === "inventory_suppliers" ? "address" : "description";
  const [existing] = await selectRows<Row & { id: number; publicId: string; description: string | null }>(
    connection,
    `SELECT id, publicId, ${detailsColumn} AS description FROM ${table} WHERE schoolId = ? AND name = ? LIMIT 1`,
    [schoolId, name],
  );
  if (existing) {
    assertSame(existing.description, description, `${name} description`);
    return existing;
  }

  const publicId = randomUUID();
  const id = await insertId(
    connection,
    `INSERT INTO ${table} (publicId, schoolId, name, ${detailsColumn}) VALUES (?, ?, ?, ?)`,
    [publicId, schoolId, name, description],
  );
  return { id, publicId };
}

async function seed() {
  config({ path: ".env.local" });
  config({ path: ".env" });
  assertSeedEnabled();

  const databaseUrl = process.env.DATABASE_URL?.trim() || "mysql://localhost/school_management";
  const parsedUrl = new URL(databaseUrl);
  const pool = mysql.createPool({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 3306),
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: decodeURIComponent(parsedUrl.pathname.slice(1)),
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
    dateStrings: true,
    ...(process.env.DATABASE_SSL === "false" ? {} : { ssl: { rejectUnauthorized: true } }),
  });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const schools = await selectRows<Row & { id: number }>(
      connection,
      "SELECT id FROM schools WHERE name = ? LIMIT 2",
      [demoSchoolName],
    );
    if (schools.length !== 1) throw new Error(`Expected exactly one school named "${demoSchoolName}".`);
    const schoolId = schools[0].id;

    const [actor] = await selectRows<Row & { userId: string }>(
      connection,
      `SELECT m.userId
       FROM school_memberships m
       JOIN user_roles ur ON ur.membershipId = m.id
       JOIN roles r ON r.id = ur.roleId AND r.schoolId = m.schoolId
       JOIN role_permissions rp ON rp.roleId = r.id
       JOIN permissions p ON p.id = rp.permissionId
       WHERE m.schoolId = ? AND m.status = 'active'
         AND p.\`key\` IN ('accounts.manage', 'inventory.manage')
       GROUP BY m.userId
       HAVING COUNT(DISTINCT p.\`key\`) = 2
       LIMIT 1`,
      [schoolId],
    );
    if (!actor) throw new Error("An active school user with Accounts and Inventory permissions is required.");

    const accountRows = await selectRows<Row & { id: number; code: string }>(
      connection,
      "SELECT id, code FROM chart_of_accounts WHERE schoolId = ? AND code IN ('4100', '5100')",
      [schoolId],
    );
    const accounts = new Map(accountRows.map((row) => [row.code, row.id]));
    const incomeAccountId = accounts.get("4100");
    const expenseAccountId = accounts.get("5100");
    if (incomeAccountId === undefined || expenseAccountId === undefined) {
      throw new Error("The demo school must have default income account 4100 and expense account 5100.");
    }

    const today = new Date().toISOString().slice(0, 10);
    const accountExamples = [
      {
        reference: "DEMO-ACCT-INCOME-001",
        transactionType: "income",
        code: "4100",
        amount: "250.00",
        description: `${demoPrefix}sample community donation (not real income).`,
        payee: `${demoPrefix}Community donor`,
        status: "approved",
      },
      {
        reference: "DEMO-ACCT-EXPENSE-001",
        transactionType: "expense",
        code: "5100",
        amount: "85.00",
        description: `${demoPrefix}sample classroom supplies purchase (not a real expense).`,
        payee: `${demoPrefix}Supplies vendor`,
        status: "approved",
      },
      {
        reference: "DEMO-ACCT-EXPENSE-002",
        transactionType: "expense",
        code: "5100",
        amount: "35.00",
        description: `${demoPrefix}sample expense awaiting approval; no payment was made.`,
        payee: `${demoPrefix}Pending vendor`,
        status: "pending",
      },
    ] as const;
    for (const example of accountExamples) {
      const [existing] = await selectRows<Row & {
        publicId: string;
        transactionType: string;
        categoryAccountId: number;
        transactionDate: string;
        amount: string;
        description: string;
        payee: string | null;
        status: string;
      }>(
        connection,
        "SELECT publicId, transactionType, categoryAccountId, transactionDate, amount, description, payee, status FROM account_transactions WHERE schoolId = ? AND reference = ? LIMIT 1",
        [schoolId, example.reference],
      );
      if (existing) {
        assertSame(existing.transactionType, example.transactionType, `${example.reference} type`);
        assertSame(existing.categoryAccountId, accounts.get(example.code), `${example.reference} account`);
        assertSame(existing.amount, example.amount, `${example.reference} amount`);
        assertSame(existing.description, example.description, `${example.reference} description`);
        assertSame(existing.payee, example.payee, `${example.reference} payee`);
        assertSame(existing.status, example.status, `${example.reference} status`);
        continue;
      }

      const publicId = randomUUID();
      const categoryAccountId = accounts.get(example.code);
      if (categoryAccountId === undefined) throw new Error(`Missing chart account ${example.code}.`);
      await connection.execute(
        `INSERT INTO account_transactions
          (publicId, schoolId, transactionType, categoryAccountId, transactionDate, amount, description, payee,
           reference, status, submittedBy, approvedBy, approvedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          publicId, schoolId, example.transactionType, categoryAccountId, today, example.amount,
          example.description, example.payee, example.reference, example.status, actor.userId,
          example.status === "approved" ? actor.userId : null,
          example.status === "approved" ? new Date() : null,
        ],
      );
      await writeAudit(connection, schoolId, actor.userId, "account_transaction.demo_seeded", "account_transaction",
        publicId, ["transactionType", "categoryAccountId", "transactionDate", "amount", "description", "reference", "status"]);
    }

    const category = await getOrCreateNamedRecord(
      connection, "inventory_categories", schoolId, `${demoPrefix}Stationery`, `${demoNote} Category.`,
    );
    const supplier = await getOrCreateNamedRecord(
      connection, "inventory_suppliers", schoolId, `${demoPrefix}Sample Supplier`, `${demoNote} Supplier.`,
    );
    const location = await getOrCreateNamedRecord(
      connection, "inventory_locations", schoolId, `${demoPrefix}Main Store`, `${demoNote} Location.`,
    );

    const itemSpecs = [
      { sku: "DEMO-BOOK-001", name: `${demoPrefix}Exercise Books`, unit: "piece", reorder: "20.000", quantity: "85.000", cost: "2.50" },
      { sku: "DEMO-PAPER-001", name: `${demoPrefix}Printer Paper`, unit: "ream", reorder: "10.000", quantity: "5.000", cost: "5.00" },
    ] as const;
    const itemIds = new Map<string, number>();
    for (const spec of itemSpecs) {
      const [existing] = await selectRows<Row & {
        id: number;
        publicId: string;
        name: string;
        description: string | null;
        unit: string;
        quantityOnHand: string;
        reorderLevel: string;
        averageUnitCost: string;
        categoryId: number;
        supplierId: number | null;
        locationId: number | null;
        status: string;
      }>(
        connection,
        "SELECT id, publicId, name, description, unit, quantityOnHand, reorderLevel, averageUnitCost, categoryId, supplierId, locationId, status FROM inventory_items WHERE schoolId = ? AND sku = ? LIMIT 1",
        [schoolId, spec.sku],
      );
      let itemId: number;
      if (existing) {
        assertSame(existing.name, spec.name, `${spec.sku} name`);
        assertSame(existing.description, demoNote, `${spec.sku} description`);
        assertSame(existing.unit, spec.unit, `${spec.sku} unit`);
        assertSame(existing.quantityOnHand, spec.quantity, `${spec.sku} quantity`);
        assertSame(existing.reorderLevel, spec.reorder, `${spec.sku} reorder level`);
        assertSame(existing.averageUnitCost, spec.cost, `${spec.sku} unit cost`);
        assertSame(existing.categoryId, category.id, `${spec.sku} category`);
        assertSame(existing.supplierId, supplier.id, `${spec.sku} supplier`);
        assertSame(existing.locationId, location.id, `${spec.sku} location`);
        assertSame(existing.status, "active", `${spec.sku} status`);
        itemId = existing.id;
      } else {
        const publicId = randomUUID();
        itemId = await insertId(
          connection,
          `INSERT INTO inventory_items
            (publicId, schoolId, categoryId, supplierId, locationId, sku, name, description, unit,
             quantityOnHand, reorderLevel, averageUnitCost, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '0', ?, '0', 'active')`,
          [publicId, schoolId, category.id, supplier.id, location.id, spec.sku, spec.name, demoNote, spec.unit, spec.reorder],
        );
        await writeAudit(connection, schoolId, actor.userId, "inventory_item.demo_seeded", "inventory_item",
          publicId, ["sku", "name", "categoryId", "supplierId", "locationId", "reorderLevel"]);
      }
      itemIds.set(spec.sku, itemId);
    }

    const movementSpecs = [
      { sku: "DEMO-BOOK-001", reference: "DEMO-STOCK-BOOK-RECEIPT", type: "received", quantity: "100.000", before: "0.000", after: "100.000", cost: "2.50" },
      { sku: "DEMO-BOOK-001", reference: "DEMO-STOCK-BOOK-ISSUE", type: "issued", quantity: "12.000", before: "100.000", after: "88.000", cost: "2.50" },
      { sku: "DEMO-BOOK-001", reference: "DEMO-STOCK-BOOK-ADJUST", type: "adjustment", quantity: "-3.000", before: "88.000", after: "85.000", cost: "2.50" },
      { sku: "DEMO-PAPER-001", reference: "DEMO-STOCK-PAPER-RECEIPT", type: "received", quantity: "40.000", before: "0.000", after: "40.000", cost: "5.00" },
      { sku: "DEMO-PAPER-001", reference: "DEMO-STOCK-PAPER-ISSUE", type: "issued", quantity: "35.000", before: "40.000", after: "5.000", cost: "5.00" },
    ] as const;
    for (const movement of movementSpecs) {
      const itemId = itemIds.get(movement.sku);
      if (itemId === undefined) throw new Error(`Demo item ${movement.sku} was not created.`);
      const [existing] = await selectRows<Row & {
        publicId: string;
        itemId: number;
        movementType: string;
        quantity: string;
        quantityBefore: string;
        quantityAfter: string;
        unitCost: string;
        note: string | null;
      }>(
        connection,
        "SELECT publicId, itemId, movementType, quantity, quantityBefore, quantityAfter, unitCost, note FROM inventory_movements WHERE schoolId = ? AND reference = ? LIMIT 1",
        [schoolId, movement.reference],
      );
      if (existing) {
        assertSame(existing.itemId, itemId, `${movement.reference} item`);
        assertSame(existing.movementType, movement.type, `${movement.reference} type`);
        assertSame(existing.quantity, movement.quantity, `${movement.reference} quantity`);
        assertSame(existing.quantityBefore, movement.before, `${movement.reference} opening quantity`);
        assertSame(existing.quantityAfter, movement.after, `${movement.reference} closing quantity`);
        assertSame(existing.unitCost, movement.cost, `${movement.reference} unit cost`);
        assertSame(existing.note, demoNote, `${movement.reference} note`);
        continue;
      }
      const publicId = randomUUID();
      await connection.execute(
        `INSERT INTO inventory_movements
          (publicId, schoolId, itemId, supplierId, locationId, movementType, quantity, quantityBefore,
           quantityAfter, unitCost, reference, note, recordedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          publicId, schoolId, itemId, movement.type === "received" ? supplier.id : null, location.id,
          movement.type, movement.quantity, movement.before, movement.after, movement.cost,
          movement.reference, demoNote, actor.userId,
        ],
      );
      await writeAudit(connection, schoolId, actor.userId, "inventory_movement.demo_seeded", "inventory_movement",
        publicId, ["itemId", "movementType", "quantity", "quantityBefore", "quantityAfter", "reference"]);
    }

    for (const spec of itemSpecs) {
      const itemId = itemIds.get(spec.sku);
      if (itemId === undefined) throw new Error(`Demo item ${spec.sku} was not created.`);
      await connection.execute(
        "UPDATE inventory_items SET quantityOnHand = ?, averageUnitCost = ? WHERE id = ? AND schoolId = ?",
        [spec.quantity, spec.cost, itemId, schoolId],
      );
    }

    const [asset] = await selectRows<Row & {
      id: number;
      publicId: string;
      acquisitionCost: string;
      itemId: number | null;
      locationId: number | null;
      name: string;
      description: string | null;
    }>(
      connection,
      "SELECT id, publicId, acquisitionCost, itemId, locationId, name, description FROM inventory_assets WHERE schoolId = ? AND assetTag = ? LIMIT 1",
      [schoolId, "DEMO-ASSET-LAPTOP-001"],
    );
    let assetId: number;
    if (asset) {
      assertSame(asset.acquisitionCost, "650.00", "demo laptop acquisition cost");
      assertSame(asset.name, `${demoPrefix}Office Laptop`, "demo laptop name");
      assertSame(asset.description, demoNote, "demo laptop description");
      assertSame(asset.locationId, location.id, "demo laptop location");
      const demoBookItemId = itemIds.get("DEMO-BOOK-001");
      if (asset.itemId !== null && asset.itemId !== demoBookItemId) {
        throw new Error("Existing demo laptop is linked to an unexpected inventory item; refusing to change it.");
      }
      if (asset.itemId !== null) {
        await connection.execute(
          "UPDATE inventory_assets SET itemId = NULL WHERE id = ? AND schoolId = ? AND itemId = ?",
          [asset.id, schoolId, asset.itemId],
        );
        await writeAudit(connection, schoolId, actor.userId, "inventory_asset.demo_seeded", "inventory_asset",
          asset.publicId, ["itemId"]);
      }
      assetId = asset.id;
    } else {
      const publicId = randomUUID();
      assetId = await insertId(
        connection,
        `INSERT INTO inventory_assets
          (publicId, schoolId, itemId, locationId, assetTag, name, description, acquiredAt, acquisitionCost, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '650.00', 'active')`,
        [publicId, schoolId, null, location.id, "DEMO-ASSET-LAPTOP-001",
          `${demoPrefix}Office Laptop`, demoNote, today],
      );
      await writeAudit(connection, schoolId, actor.userId, "inventory_asset.demo_seeded", "inventory_asset",
        publicId, ["assetTag", "name", "acquiredAt", "acquisitionCost", "locationId"]);
    }

    const [existingMaintenance] = await selectRows<Row & { publicId: string; cost: string }>(
      connection,
      "SELECT publicId, cost FROM asset_maintenance WHERE schoolId = ? AND assetId = ? AND description = ? LIMIT 1",
      [schoolId, assetId, `${demoPrefix}Sample laptop maintenance`],
    );
    if (existingMaintenance) {
      assertSame(existingMaintenance.cost, "45.00", "demo asset maintenance cost");
    } else {
      const publicId = randomUUID();
      await connection.execute(
        `INSERT INTO asset_maintenance
          (publicId, schoolId, assetId, maintenanceDate, description, cost, performedBy, recordedBy)
         VALUES (?, ?, ?, ?, ?, '45.00', ?, ?)`,
        [publicId, schoolId, assetId, today, `${demoPrefix}Sample laptop maintenance`, `${demoPrefix}Service Desk`, actor.userId],
      );
      await writeAudit(connection, schoolId, actor.userId, "asset_maintenance.demo_seeded", "asset_maintenance",
        publicId, ["assetId", "maintenanceDate", "description", "cost", "performedBy"]);
    }

    const seedMarker = "schoolos-demo-accounts-inventory-v1";
    const [marker] = await selectRows<Row>(
      connection,
      "SELECT id FROM audit_logs WHERE schoolId = ? AND action = 'accounts_inventory_demo_seed.completed' AND resourcePublicId = ? LIMIT 1",
      [schoolId, seedMarker],
    );
    if (!marker) {
      await writeAudit(connection, schoolId, actor.userId, "accounts_inventory_demo_seed.completed", "school",
        seedMarker, ["demoAccountTransactions", "demoStockItems", "demoMovements", "demoAsset", "demoMaintenance"]);
    }

    await connection.commit();
    console.log(`Clearly labeled accounts and inventory demo data is ready for ${demoSchoolName}. Sample account transactions, two stock items with receipt/issue/adjustment history, one asset, and one maintenance record were verified or created. All inserted amounts and stock quantities are test examples, not real financial activity or inventory counts.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

void seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
