import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import mysql from "mysql2/promise";

config({ path: ".env.local" });
config({ path: ".env" });

const required = [
  "ALLOW_DEMO_CLASS_CONSOLIDATION",
  "DEMO_SCHOOL_ID",
  "DEMO_SCHOOL_NAME",
  "DEMO_ACTIVE_YEAR_ID",
  "DEMO_TARGET_CLASS_ID",
  "DEMO_TARGET_SECTION_ID",
] as const;
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} must be explicitly set.`);
}
if (process.env.ALLOW_DEMO_CLASS_CONSOLIDATION !== "true") {
  throw new Error("Set ALLOW_DEMO_CLASS_CONSOLIDATION=true to confirm this operation.");
}

const schoolId = Number(process.env.DEMO_SCHOOL_ID);
const yearId = Number(process.env.DEMO_ACTIVE_YEAR_ID);
const targetClassId = Number(process.env.DEMO_TARGET_CLASS_ID);
const targetSectionId = Number(process.env.DEMO_TARGET_SECTION_ID);
if (![schoolId, yearId, targetClassId, targetSectionId].every(Number.isSafeInteger)) {
  throw new Error("School, year, class, and section IDs must be safe integers.");
}

const connectionUrl = new URL(process.env.DATABASE_URL?.trim() ?? "");
const pool = mysql.createPool({
  host: connectionUrl.hostname,
  port: Number(connectionUrl.port || 3306),
  user: decodeURIComponent(connectionUrl.username),
  password: decodeURIComponent(connectionUrl.password),
  database: decodeURIComponent(connectionUrl.pathname.slice(1)),
  waitForConnections: true,
  connectionLimit: 1,
  ...(process.env.DATABASE_SSL === "false" ? {} : { ssl: { rejectUnauthorized: true } }),
});

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

async function main() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [schools] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id, name, timezone FROM schools WHERE id = ? FOR UPDATE",
      [schoolId],
    );
    const school = schools[0];
    if (!school || school.name !== process.env.DEMO_SCHOOL_NAME) {
      throw new Error("The requested school ID and exact name do not match the connected database.");
    }

    const [years] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id, startDate, endDate FROM academic_years WHERE id = ? AND schoolId = ? AND status = 'active' FOR UPDATE",
      [yearId, schoolId],
    );
    const year = years[0];
    if (!year) throw new Error("The requested academic year is not active for this school.");
    const eventDate = dateInTimezone(school.timezone);
    const dateOnly = (value: string | Date) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
    if (eventDate < dateOnly(year.startDate) || eventDate > dateOnly(year.endDate)) {
      throw new Error("Today's date is outside the active academic year; no records were changed.");
    }

    const [targetRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT c.id AS classId, c.publicId AS classPublicId, c.name AS className, c.code AS classCode,
              c.branchId, s.id AS sectionId, s.academicYearId, s.capacity
       FROM class_levels c
       JOIN class_sections s ON s.classLevelId = c.id AND s.schoolId = c.schoolId
       WHERE c.id = ? AND c.schoolId = ? AND s.id = ? AND s.academicYearId = ?
       FOR UPDATE`,
      [targetClassId, schoolId, targetSectionId, yearId],
    );
    const target = targetRows[0];
    if (!target || target.className !== "P1" || target.classCode !== "P1") {
      throw new Error("The selected destination must be the configured P1 class and its section.");
    }

    const [adminRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT m.userId
       FROM school_memberships m
       JOIN user_roles ur ON ur.membershipId = m.id
       JOIN roles r ON r.id = ur.roleId AND r.schoolId = m.schoolId
       WHERE m.schoolId = ? AND m.status = 'active' AND r.name = 'School administrator'
       ORDER BY m.id LIMIT 1 FOR UPDATE`,
      [schoolId],
    );
    const actorUserId = adminRows[0]?.userId;
    if (!actorUserId) throw new Error("An active school administrator is required for audit attribution.");

    const [pendingRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM student_enrollments WHERE schoolId = ? AND status = 'pending'",
      [schoolId],
    );
    if (Number(pendingRows[0].total) > 0) {
      throw new Error("Pending enrollments exist; resolve them before consolidating classes.");
    }

    const [sourceRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT e.id AS enrollmentId, e.publicId AS enrollmentPublicId, e.studentId,
              e.classSectionId, st.publicId AS studentPublicId, st.status AS studentStatus,
              st.branchId AS studentBranchId
       FROM student_enrollments e
       JOIN students st ON st.id = e.studentId AND st.schoolId = e.schoolId
       JOIN class_sections s ON s.id = e.classSectionId AND s.schoolId = e.schoolId
       JOIN class_levels c ON c.id = s.classLevelId AND c.schoolId = e.schoolId
       WHERE e.schoolId = ? AND e.academicYearId = ? AND e.status = 'enrolled'
         AND e.classSectionId <> ? AND c.id <> ?
       ORDER BY e.studentId
       FOR UPDATE`,
      [schoolId, yearId, targetSectionId, targetClassId],
    );
    for (const source of sourceRows) {
      if (!["active", "admitted"].includes(source.studentStatus)) {
        throw new Error(`Student ${source.studentId} is not eligible for an active enrollment.`);
      }
      if (source.studentBranchId !== null && source.studentBranchId !== target.branchId) {
        throw new Error(`Student ${source.studentId} belongs to a different branch than P1.`);
      }
    }

    const [targetCountRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM student_enrollments WHERE schoolId = ? AND classSectionId = ? AND status = 'enrolled'",
      [schoolId, targetSectionId],
    );
    const targetCount = Number(targetCountRows[0].total);
    if (target.capacity !== null && targetCount + sourceRows.length > Number(target.capacity)) {
      throw new Error("The P1 section lacks capacity for all active students; no records were changed.");
    }

    for (const source of sourceRows) {
      const [existingRows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT id, publicId, status FROM student_enrollments
         WHERE schoolId = ? AND studentId = ? AND academicYearId = ? AND classSectionId = ?
         LIMIT 1 FOR UPDATE`,
        [schoolId, source.studentId, yearId, targetSectionId],
      );
      let destinationEnrollmentId = existingRows[0]?.id;
      if (destinationEnrollmentId && existingRows[0].status !== "enrolled") {
        throw new Error(`Student ${source.studentId} already has a non-current P1 enrollment record.`);
      }
      if (!destinationEnrollmentId) {
        const destinationPublicId = randomUUID();
        await connection.query(
          `INSERT INTO student_enrollments
           (publicId, schoolId, studentId, academicYearId, classSectionId, status, enrolledAt)
           VALUES (?, ?, ?, ?, ?, 'enrolled', ?)`,
          [destinationPublicId, schoolId, source.studentId, yearId, targetSectionId, eventDate],
        );
        const [destinationRows] = await connection.query<mysql.RowDataPacket[]>(
          "SELECT id FROM student_enrollments WHERE publicId = ? AND schoolId = ? LIMIT 1",
          [destinationPublicId, schoolId],
        );
        destinationEnrollmentId = destinationRows[0]?.id;
      }
      if (!destinationEnrollmentId) throw new Error("A destination P1 enrollment could not be verified.");

      await connection.query(
        "UPDATE student_enrollments SET status = 'transferred' WHERE id = ? AND schoolId = ? AND status = 'enrolled'",
        [source.enrollmentId, schoolId],
      );
      if (source.studentBranchId === null) {
        await connection.query("UPDATE students SET branchId = ? WHERE id = ? AND schoolId = ?", [
          target.branchId,
          source.studentId,
          schoolId,
        ]);
      }
      await connection.query(
        `INSERT INTO student_academic_events
         (publicId, schoolId, studentId, fromEnrollmentId, toEnrollmentId, fromClassSectionId,
          toClassSectionId, eventType, eventDate, reason, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'transfer_in_school', ?, ?, ?)`,
        [
          randomUUID(),
          schoolId,
          source.studentId,
          source.enrollmentId,
          destinationEnrollmentId,
          source.classSectionId,
          targetSectionId,
          eventDate,
          "Administrative consolidation requested: active enrollment moved to P1; previous enrollment and invoice history preserved.",
          actorUserId,
        ],
      );
      await connection.query(
        `INSERT INTO audit_logs (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
         VALUES (?, ?, 'student.enrollment.consolidated_to_p1', 'student', ?, ?)`,
        [
          schoolId,
          actorUserId,
          source.studentPublicId,
          JSON.stringify(["academicYearId", "classSectionId", "enrollmentStatus"]),
        ],
      );
    }

    const [otherActiveRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM student_enrollments e
       JOIN class_sections s ON s.id = e.classSectionId AND s.schoolId = e.schoolId
       JOIN class_levels c ON c.id = s.classLevelId AND c.schoolId = e.schoolId
       WHERE e.schoolId = ? AND c.id <> ? AND e.status IN ('pending', 'enrolled')`,
      [schoolId, targetClassId],
    );
    if (Number(otherActiveRows[0].total) > 0) {
      throw new Error("Other classes still contain active or pending enrollments; no class was archived.");
    }

    const [otherClasses] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id, publicId, status FROM class_levels WHERE schoolId = ? AND id <> ? FOR UPDATE",
      [schoolId, targetClassId],
    );
    await connection.query("UPDATE class_levels SET status = 'active' WHERE id = ? AND schoolId = ?", [
      targetClassId,
      schoolId,
    ]);
    for (const classLevel of otherClasses) {
      if (classLevel.status !== "archived") {
        await connection.query("UPDATE class_levels SET status = 'archived' WHERE id = ? AND schoolId = ?", [
          classLevel.id,
          schoolId,
        ]);
        await connection.query(
          `INSERT INTO audit_logs (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
           VALUES (?, ?, 'academic.class_level.archived', 'class_level', ?, ?)`,
          [schoolId, actorUserId, classLevel.publicId, JSON.stringify(["status"])],
        );
      }
    }

    const [summaryRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM student_enrollments WHERE schoolId = ? AND classSectionId = ? AND status = 'enrolled') AS p1Students,
         (SELECT COUNT(*) FROM class_levels WHERE schoolId = ? AND status = 'active') AS activeClasses,
         (SELECT COUNT(*) FROM class_levels WHERE schoolId = ? AND status = 'archived') AS archivedClasses,
         (SELECT COUNT(*) FROM student_fee_invoices WHERE schoolId = ?) AS invoices,
         (SELECT COUNT(*) FROM fee_payments WHERE schoolId = ?) AS payments`,
      [schoolId, targetSectionId, schoolId, schoolId, schoolId, schoolId],
    );
    const dryRun = process.env.DEMO_CONSOLIDATION_DRY_RUN === "true";
    if (dryRun) await connection.rollback();
    else await connection.commit();
    console.log(JSON.stringify({
      school: school.name,
      movedEnrollments: sourceRows.length,
      ...summaryRows[0],
      historicalInvoicesAndPaymentsPreserved: true,
      dryRun,
    }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
