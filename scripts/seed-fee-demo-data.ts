import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  calculateDiscountMinorUnits,
  calculateFineMinorUnits,
  feeInvoiceStatus,
  parseMoneyToMinorUnits,
} from "../src/lib/fees-policy";

const demoSchoolName = "SchoolOS Demo School";
const feeGroupName = "DEMO TEST - Fee module";
const feeGroupDescription = "Clearly labeled test-only fee data; no real charges or payments.";
const tuitionTypeName = "DEMO TEST - Tuition";
const activityTypeName = "DEMO TEST - Activities";
const discountName = "DEMO TEST - 20% tuition discount";
const discountCode = "DEMOFEE20";
const testOnlyNote = "TEST DATA ONLY - no money received; seeded for fee-module verification.";
const typeDescription = "Test-only student fee for exercising fee setup and collection.";
const discountDescription = "Test-only 20% tuition discount assigned to one demo student.";

type Row = RowDataPacket & Record<string, unknown>;
type SqlValue = string | number | bigint | boolean | Date | null | Buffer | Uint8Array;

function assertSeedEnabled() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Fee demo data seeding is disabled in production and Vercel environments.");
  }
  if (process.env.ALLOW_FEE_DEMO_SEED !== "true") {
    throw new Error("Set ALLOW_FEE_DEMO_SEED=true to explicitly enable fee demo data seeding.");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() || "mysql://localhost/school_management";
  const parsedUrl = new URL(databaseUrl);
  const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  if (!isLocalDatabase) {
    if (process.env.ALLOW_DEMO_SEED_REMOTE !== "true") {
      throw new Error(
        "Fee demo seeding only runs against a local database by default. Set ALLOW_DEMO_SEED_REMOTE=true only when intentionally targeting the demo school.",
      );
    }
    if (
      parsedUrl.hostname !== "gateway01.us-east-1.prod.aws.tidbcloud.com" ||
      decodeURIComponent(parsedUrl.pathname.slice(1)) !== "schoolos_app"
    ) {
      throw new Error("Remote fee demo seeding is restricted to the verified SchoolOS demo database.");
    }
  }
}

function dateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function inRange(date: string, startDate: string, endDate: string): string {
  return date < startDate ? startDate : date > endDate ? endDate : date;
}

function assertSame<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`Existing ${label} does not match the demo seed; refusing to change it.`);
  }
}

async function selectRows<T extends Row>(
  connection: PoolConnection,
  sql: string,
  values: SqlValue[] = [],
): Promise<T[]> {
  const [result] = await connection.execute<T[]>(sql, values);
  return result;
}

async function insertId(
  connection: PoolConnection,
  sql: string,
  values: SqlValue[],
): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(sql, values);
  return result.insertId;
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

async function seedFeeDemoData() {
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
    const targetSchools = await selectRows<Row & { id: number; timezone: string }>(
      connection,
      "SELECT id, timezone FROM schools WHERE name = ? LIMIT 2",
      [demoSchoolName],
    );
    if (targetSchools.length !== 1) {
      throw new Error(`Fee demo seeding requires exactly one school named "${demoSchoolName}".`);
    }
    const school = targetSchools[0];
    const schoolId = school.id;

    const [year] = await selectRows<Row & { id: number; startDate: string; endDate: string }>(
      connection,
      "SELECT id, startDate, endDate FROM academic_years WHERE schoolId = ? AND status = 'active' LIMIT 1",
      [schoolId],
    );
    if (!year) throw new Error("The demo school must have an active academic year.");

    const [actor] = await selectRows<Row & { userId: string }>(
      connection,
      `SELECT m.userId
       FROM school_memberships m
       JOIN user_roles ur ON ur.membershipId = m.id
       JOIN roles r ON r.id = ur.roleId AND r.schoolId = m.schoolId
       JOIN role_permissions rp ON rp.roleId = r.id
       JOIN permissions p ON p.id = rp.permissionId AND p.\`key\` = 'fees.manage'
       WHERE m.schoolId = ? AND m.status = 'active'
       LIMIT 1`,
      [schoolId],
    );
    if (!actor) throw new Error("An active school user with fee-management permission is required for seed audit records.");

    const allEnrollments = await selectRows<Row & {
      enrollmentId: number;
      studentId: number;
      branchId: number | null;
      classBranchId: number;
      classLevelId: number;
    }>(
      connection,
      `SELECT e.id AS enrollmentId, s.id AS studentId, s.branchId, cl.branchId AS classBranchId, cs.classLevelId
       FROM student_enrollments e
       JOIN class_sections cs ON cs.id = e.classSectionId AND cs.schoolId = e.schoolId
       JOIN class_levels cl ON cl.id = cs.classLevelId AND cl.schoolId = cs.schoolId
       JOIN students s ON s.id = e.studentId AND s.schoolId = e.schoolId
       WHERE e.schoolId = ? AND e.academicYearId = ? AND e.status = 'enrolled'
         AND s.status IN ('admitted', 'active')
       ORDER BY e.id`,
      [schoolId, year.id],
    );
    const enrollments = allEnrollments.filter(
      (row) => row.branchId !== null && row.branchId === row.classBranchId,
    );
    const skippedStudents = allEnrollments.length - enrollments.length;
    if (enrollments.length < 2) {
      throw new Error("At least two eligible students with assigned branches are required.");
    }

    const today = dateInTimezone(school.timezone);
    const activityDueDate = inRange(shiftDate(today, -30), year.startDate, year.endDate);
    const tuitionDueDate = inRange(shiftDate(today, 30), year.startDate, year.endDate);
    if (activityDueDate >= today) throw new Error("The active academic year does not allow an overdue test invoice.");

    const [existingGroup] = await selectRows<Row & { id: number; publicId: string; description: string | null }>(
      connection,
      "SELECT id, publicId, description FROM fee_groups WHERE schoolId = ? AND name = ? LIMIT 1",
      [schoolId, feeGroupName],
    );
    let groupId: number;
    if (existingGroup) {
      assertSame(existingGroup.description, feeGroupDescription, "demo fee group");
      groupId = existingGroup.id;
    } else {
      const publicId = randomUUID();
      groupId = await insertId(
        connection,
        "INSERT INTO fee_groups (publicId, schoolId, name, description) VALUES (?, ?, ?, ?)",
        [publicId, schoolId, feeGroupName, feeGroupDescription],
      );
      await writeAudit(connection, schoolId, actor.userId, "fee_group.created", "fee_group", publicId, ["name", "description"]);
    }

    async function getOrCreateType(name: string): Promise<number> {
      const [existing] = await selectRows<Row & { id: number; publicId: string; feeGroupId: number; description: string | null }>(
        connection,
        "SELECT id, publicId, feeGroupId, description FROM fee_types WHERE schoolId = ? AND name = ? LIMIT 1",
        [schoolId, name],
      );
      if (existing) {
        assertSame(existing.feeGroupId, groupId, `${name} fee type group`);
        assertSame(existing.description, typeDescription, `${name} fee type description`);
        return existing.id;
      }
      const publicId = randomUUID();
      const id = await insertId(
        connection,
        "INSERT INTO fee_types (publicId, schoolId, feeGroupId, name, description) VALUES (?, ?, ?, ?, ?)",
        [publicId, schoolId, groupId, name, typeDescription],
      );
      await writeAudit(connection, schoolId, actor.userId, "fee_type.created", "fee_type", publicId, ["feeGroupId", "name", "description"]);
      return id;
    }

    const tuitionTypeId = await getOrCreateType(tuitionTypeName);
    const activityTypeId = await getOrCreateType(activityTypeName);

    const [existingDiscount] = await selectRows<Row & {
      id: number;
      name: string;
      description: string | null;
      discountType: string;
      value: string;
      frequency: string;
    }>(
      connection,
      "SELECT id, name, description, discountType, value, frequency FROM fee_discounts WHERE schoolId = ? AND code = ? LIMIT 1",
      [schoolId, discountCode],
    );
    let discountId: number;
    if (existingDiscount) {
      assertSame(existingDiscount.name, discountName, "demo discount name");
      assertSame(existingDiscount.description, discountDescription, "demo discount description");
      assertSame(existingDiscount.discountType, "percentage", "demo discount type");
      assertSame(existingDiscount.value, "20.00", "demo discount value");
      assertSame(existingDiscount.frequency, "yearly", "demo discount frequency");
      discountId = existingDiscount.id;
    } else {
      const publicId = randomUUID();
      discountId = await insertId(
        connection,
        `INSERT INTO fee_discounts
          (publicId, schoolId, name, code, description, discountType, value, frequency)
         VALUES (?, ?, ?, ?, ?, 'percentage', '20.00', 'yearly')`,
        [publicId, schoolId, discountName, discountCode, discountDescription],
      );
      await writeAudit(connection, schoolId, actor.userId, "fee_discount.created", "fee_discount", publicId,
        ["name", "code", "description", "discountType", "value", "frequency"]);
    }

    const discountedStudentId = enrollments[0].studentId;
    const [existingAssignment] = await selectRows<Row & { id: number; publicId: string; discountId: number; note: string | null }>(
      connection,
      "SELECT id, publicId, discountId, note FROM student_fee_discounts WHERE schoolId = ? AND studentId = ? AND feeTypeId = ? LIMIT 1",
      [schoolId, discountedStudentId, tuitionTypeId],
    );
    if (existingAssignment) {
      assertSame(existingAssignment.discountId, discountId, "student demo discount assignment");
      assertSame(existingAssignment.note, testOnlyNote, "student demo discount note");
    } else {
      const publicId = randomUUID();
      await connection.execute(
        `INSERT INTO student_fee_discounts
          (publicId, schoolId, studentId, feeTypeId, discountId, note, assignedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [publicId, schoolId, discountedStudentId, tuitionTypeId, discountId, testOnlyNote, actor.userId],
      );
      await writeAudit(connection, schoolId, actor.userId, "fee_discount.assigned", "student_fee_discount", publicId,
        ["studentId", "feeTypeId", "discountId", "note"]);
    }

    const classGroups = new Map<string, { branchId: number; classLevelId: number }>();
    for (const enrollment of enrollments) {
      const branchId = enrollment.branchId;
      if (branchId === null) throw new Error("An eligible demo student has no branch.");
      classGroups.set(`${branchId}:${enrollment.classLevelId}`, { branchId, classLevelId: enrollment.classLevelId });
    }

    const structureIds = new Map<string, number>();
    for (const { branchId, classLevelId } of classGroups.values()) {
      const specs = [
        { typeId: tuitionTypeId, amount: "1200.00", dueDate: tuitionDueDate, fineType: "none", fineValue: "0.00" },
        { typeId: activityTypeId, amount: "150.00", dueDate: activityDueDate, fineType: "fixed", fineValue: "25.00" },
      ] as const;
      for (const spec of specs) {
        const [existing] = await selectRows<Row & {
          id: number;
          branchId: number;
          amount: string;
          dueDate: string;
          fineType: string;
          fineValue: string;
        }>(
          connection,
          `SELECT id, branchId, amount, dueDate, fineType, fineValue
           FROM fee_structures
           WHERE schoolId = ? AND academicYearId = ? AND classLevelId = ? AND feeGroupId = ? AND feeTypeId = ?
           LIMIT 1`,
          [schoolId, year.id, classLevelId, groupId, spec.typeId],
        );
        let structureId: number;
        if (existing) {
          assertSame(existing.branchId, branchId, "demo fee structure branch");
          assertSame(existing.amount, spec.amount, "demo fee structure amount");
          assertSame(existing.fineType, spec.fineType, "demo fee structure fine type");
          assertSame(existing.fineValue, spec.fineValue, "demo fee structure fine value");
          structureId = existing.id;
        } else {
          const publicId = randomUUID();
          structureId = await insertId(
            connection,
            `INSERT INTO fee_structures
              (publicId, schoolId, branchId, academicYearId, classLevelId, feeGroupId, feeTypeId, amount, dueDate, fineType, fineValue)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [publicId, schoolId, branchId, year.id, classLevelId, groupId, spec.typeId, spec.amount, spec.dueDate, spec.fineType, spec.fineValue],
          );
          await writeAudit(connection, schoolId, actor.userId, "fee_structure.created", "fee_structure", publicId,
            ["branchId", "academicYearId", "classLevelId", "feeGroupId", "feeTypeId", "amount", "dueDate", "fineType", "fineValue"]);
        }
        structureIds.set(`${classLevelId}:${spec.typeId}`, structureId);
      }
    }

    type Invoice = {
      id: number;
      studentId: number;
      amount: string;
      discountAmount: string;
      fineType: string;
      fineValue: string;
      dueDate: string;
    };
    const invoices = new Map<string, Invoice>();
    let createdInvoices = 0;
    for (const enrollment of enrollments) {
      for (const typeId of [tuitionTypeId, activityTypeId]) {
        const structureId = structureIds.get(`${enrollment.classLevelId}:${typeId}`);
        if (structureId === undefined) throw new Error("A demo student has no matching fee structure.");
        const [structure] = await selectRows<Row & {
          id: number;
          amount: string;
          dueDate: string;
          fineType: string;
          fineValue: string;
        }>(
          connection,
          "SELECT id, amount, dueDate, fineType, fineValue FROM fee_structures WHERE id = ? AND schoolId = ? LIMIT 1",
          [structureId, schoolId],
        );
        if (!structure) throw new Error("A demo fee structure could not be loaded.");
        const [existing] = await selectRows<Row & {
          id: number;
          studentId: number;
          amount: string;
          discountAmount: string;
          fineType: string;
          fineValue: string;
          dueDate: string;
        }>(
          connection,
          `SELECT id, studentId, amount, discountAmount, fineType, fineValue, dueDate
           FROM student_fee_invoices
           WHERE schoolId = ? AND enrollmentId = ? AND feeStructureId = ?
           LIMIT 1`,
          [schoolId, enrollment.enrollmentId, structureId],
        );
        if (existing) {
          assertSame(existing.studentId, enrollment.studentId, "demo invoice student");
          invoices.set(`${enrollment.studentId}:${typeId}`, existing);
          continue;
        }

        const hasDiscount = enrollment.studentId === discountedStudentId && typeId === tuitionTypeId;
        const amountMinor = parseMoneyToMinorUnits(structure.amount);
        const discountMinor = hasDiscount && amountMinor !== null
          ? calculateDiscountMinorUnits(amountMinor, "percentage", 20)
          : 0;
        if (amountMinor === null || discountMinor === null) throw new Error("A demo invoice amount is invalid.");
        const publicId = randomUUID();
        const invoice = {
          studentId: enrollment.studentId,
          amount: structure.amount,
          discountAmount: (discountMinor / 100).toFixed(2),
          fineType: structure.fineType,
          fineValue: structure.fineValue,
          dueDate: structure.dueDate,
        };
        const invoiceId = await insertId(
          connection,
          `INSERT INTO student_fee_invoices
            (publicId, schoolId, studentId, enrollmentId, feeStructureId, discountId, amount, discountAmount, fineType, fineValue, dueDate, status, generatedBy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
          [publicId, schoolId, enrollment.studentId, enrollment.enrollmentId, structureId, hasDiscount ? discountId : null,
            invoice.amount, invoice.discountAmount, invoice.fineType, invoice.fineValue, invoice.dueDate, actor.userId],
        );
        invoices.set(`${enrollment.studentId}:${typeId}`, { id: invoiceId, ...invoice });
        createdInvoices += 1;
        await writeAudit(connection, schoolId, actor.userId, "fee_invoice.generated", "student_fee_invoice", publicId,
          ["studentId", "feeStructureId", "amount", "discountAmount", "dueDate"]);
      }
    }

    async function addTestPayment(invoice: Invoice, reference: string, amountMinor: number, fineMinor: number) {
      const [existing] = await selectRows<Row & {
        invoiceId: number;
        amount: string;
        fineAmount: string;
        notes: string | null;
      }>(
        connection,
        "SELECT invoiceId, amount, fineAmount, notes FROM fee_payments WHERE schoolId = ? AND reference = ? LIMIT 1",
        [schoolId, reference],
      );
      if (existing) {
        assertSame(existing.invoiceId, invoice.id, `${reference} invoice`);
        assertSame(existing.amount, (amountMinor / 100).toFixed(2), `${reference} payment amount`);
        assertSame(existing.fineAmount, (fineMinor / 100).toFixed(2), `${reference} fine amount`);
        assertSame(existing.notes, testOnlyNote, `${reference} note`);
        return;
      }

      const publicId = randomUUID();
      await connection.execute(
        `INSERT INTO fee_payments
          (publicId, schoolId, invoiceId, amount, fineAmount, paymentMethod, reference, notes, recordedBy)
         VALUES (?, ?, ?, ?, ?, 'cash', ?, ?, ?)`,
        [publicId, schoolId, invoice.id, (amountMinor / 100).toFixed(2), (fineMinor / 100).toFixed(2),
          reference, testOnlyNote, actor.userId],
      );
      const [paidTotal] = await selectRows<Row & { amount: string }>(
        connection,
        "SELECT COALESCE(SUM(amount), 0) AS amount FROM fee_payments WHERE schoolId = ? AND invoiceId = ?",
        [schoolId, invoice.id],
      );
      const paidMinor = parseMoneyToMinorUnits(paidTotal.amount);
      const baseDue = (parseMoneyToMinorUnits(invoice.amount) ?? 0) - (parseMoneyToMinorUnits(invoice.discountAmount) ?? 0);
      const fineTotal = calculateFineMinorUnits(baseDue, invoice.fineType, Number(invoice.fineValue));
      if (paidMinor === null || fineTotal === null) throw new Error("The demo payment balance is invalid.");
      const status = feeInvoiceStatus(baseDue + fineTotal, paidMinor);
      if (!status) throw new Error("The demo payment balance is inconsistent.");
      await connection.execute("UPDATE student_fee_invoices SET status = ? WHERE id = ?", [status, invoice.id]);
      await writeAudit(connection, schoolId, actor.userId, "fee_payment.recorded", "fee_payment", publicId,
        ["invoiceId", "amount", "fineAmount", "paymentMethod", "reference"]);
    }

    const activityInvoices = enrollments
      .map((enrollment) => invoices.get(`${enrollment.studentId}:${activityTypeId}`))
      .filter((invoice): invoice is Invoice => invoice !== undefined);
    if (activityInvoices.length < 2) throw new Error("Two activity invoices are required for payment examples.");
    await addTestPayment(activityInvoices[0], "DEMO-TEST-PARTIAL", 5000, 0);

    const paidInvoice = activityInvoices[1];
    const paidBase = (parseMoneyToMinorUnits(paidInvoice.amount) ?? 0) -
      (parseMoneyToMinorUnits(paidInvoice.discountAmount) ?? 0);
    const paidFine = calculateFineMinorUnits(paidBase, paidInvoice.fineType, Number(paidInvoice.fineValue));
    if (paidFine === null) throw new Error("The demo late fine is invalid.");
    await addTestPayment(paidInvoice, "DEMO-TEST-PAID", paidBase + paidFine, paidFine);

    const seedMarker = "schoolos-demo-fees-v1";
    const [marker] = await selectRows<Row>(
      connection,
      "SELECT id FROM audit_logs WHERE schoolId = ? AND action = 'fee_demo_seed.completed' AND resourcePublicId = ? LIMIT 1",
      [schoolId, seedMarker],
    );
    if (!marker) {
      await writeAudit(connection, schoolId, actor.userId, "fee_demo_seed.completed", "school", seedMarker,
        ["feeGroups", "feeTypes", "discounts", "structures", "invoices", "testPayments"]);
    }

    const [statusCounts] = await selectRows<Row & { unpaid: number; partial: number; paid: number }>(
      connection,
      `SELECT
         SUM(status = 'unpaid') AS unpaid,
         SUM(status = 'partial') AS partial,
         SUM(status = 'paid') AS paid
       FROM student_fee_invoices WHERE schoolId = ? AND feeStructureId IN
         (SELECT id FROM fee_structures WHERE schoolId = ? AND feeGroupId = ?)`,
      [schoolId, schoolId, groupId],
    );
    await connection.commit();
    console.log(
      `Fee demo data ready for ${demoSchoolName}: ${enrollments.length} fee-eligible students out of ${allEnrollments.length} enrolled (${skippedStudents} skipped due to missing or mismatched branch assignment), ${classGroups.size} classes, ${structureIds.size} structures, ${invoices.size} invoices (${createdInvoices} newly created). Invoice states: ${statusCounts.unpaid} unpaid, ${statusCounts.partial} partial, ${statusCounts.paid} paid. Two payments are explicitly marked TEST DATA ONLY.`,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

void seedFeeDemoData().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
