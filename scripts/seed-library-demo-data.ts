import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

const demoSchoolName = "SchoolOS Demo School";
const demoPrefix = "DEMO TEST - ";
const seedMarker = "schoolos-demo-library-v1";

type Row = RowDataPacket & Record<string, unknown>;
type SqlValue = string | number | null;

const categories = [
  { name: `${demoPrefix}Fiction`, branchId: null },
  { name: `${demoPrefix}Science`, branchId: null },
  { name: `${demoPrefix}Reference`, branchId: null },
] as const;

const subjects = [
  { name: `${demoPrefix}English Language`, branchId: null },
  { name: `${demoPrefix}Integrated Science`, branchId: null },
  { name: `${demoPrefix}Mathematics`, branchId: null },
] as const;

const books = [
  { bookNumber: "DEMO-LIB-001", title: "DEMO TEST - The River Between", author: "DEMO TEST - Ngugi wa Thiong'o", publisher: "DEMO TEST - Sample Press", categoryName: `${demoPrefix}Fiction`, subjectName: `${demoPrefix}English Language`, isbn: "9780000000001", shelfLocation: "DEMO-A1", description: "Clearly labeled sample catalog record; not a real library holding.", price: "12.50", totalCopies: 4 },
  { bookNumber: "DEMO-LIB-002", title: "DEMO TEST - A Journey Through Space", author: "DEMO TEST - A. Sample", publisher: "DEMO TEST - Sample Press", categoryName: `${demoPrefix}Science`, subjectName: `${demoPrefix}Integrated Science`, isbn: "9780000000002", shelfLocation: "DEMO-B2", description: "Clearly labeled sample catalog record; not a real library holding.", price: "15.00", totalCopies: 3 },
  { bookNumber: "DEMO-LIB-003", title: "DEMO TEST - Practical Mathematics", author: "DEMO TEST - B. Example", publisher: "DEMO TEST - Learning House", categoryName: `${demoPrefix}Reference`, subjectName: `${demoPrefix}Mathematics`, isbn: "9780000000003", shelfLocation: "DEMO-C1", description: "Clearly labeled sample catalog record; not a real library holding.", price: "18.75", totalCopies: 5 },
  { bookNumber: "DEMO-LIB-004", title: "DEMO TEST - Stories for Young Readers", author: "DEMO TEST - C. Author", publisher: "DEMO TEST - Sample Press", categoryName: `${demoPrefix}Fiction`, subjectName: `${demoPrefix}English Language`, isbn: "9780000000004", shelfLocation: "DEMO-A2", description: "Clearly labeled sample catalog record; not a real library holding.", price: "9.99", totalCopies: 2 },
  { bookNumber: "DEMO-LIB-005", title: "DEMO TEST - The Living World", author: "DEMO TEST - D. Writer", publisher: "DEMO TEST - Learning House", categoryName: `${demoPrefix}Science`, subjectName: `${demoPrefix}Integrated Science`, isbn: "9780000000005", shelfLocation: "DEMO-B1", description: "Clearly labeled sample catalog record; not a real library holding.", price: "14.25", totalCopies: 3 },
  { bookNumber: "DEMO-LIB-006", title: "DEMO TEST - Atlas of World Geography", author: "DEMO TEST - E. Cartographer", publisher: "DEMO TEST - Sample Press", categoryName: `${demoPrefix}Reference`, subjectName: `${demoPrefix}Mathematics`, isbn: "9780000000006", shelfLocation: "DEMO-C2", description: "Clearly labeled sample catalog record; not a real library holding.", price: "22.00", totalCopies: 2 },
] as const;

function assertSeedEnabled() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Library demo data seeding is disabled in production and Vercel environments.");
  }
  if (process.env.ALLOW_LIBRARY_DEMO_SEED !== "true") {
    throw new Error("Set ALLOW_LIBRARY_DEMO_SEED=true to explicitly enable library demo seeding.");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() || "mysql://localhost/school_management";
  const parsedUrl = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
    if (process.env.ALLOW_DEMO_SEED_REMOTE !== "true") {
      throw new Error("Remote library seeding requires explicit ALLOW_DEMO_SEED_REMOTE=true opt-in.");
    }
    if (
      parsedUrl.hostname !== "gateway01.us-east-1.prod.aws.tidbcloud.com" ||
      decodeURIComponent(parsedUrl.pathname.slice(1)) !== "schoolos_app"
    ) {
      throw new Error("Remote library seeding is restricted to the verified SchoolOS demo database.");
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
    throw new Error(`Existing ${label} does not match the library demo seed; refusing to change it.`);
  }
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

async function getOrCreateTerm(
  connection: PoolConnection,
  table: "library_categories" | "library_subjects",
  schoolId: number,
  term: { name: string; branchId: number | null },
): Promise<number> {
  const [existing] = await selectRows<Row & { id: number; branchId: number | null; status: string }>(
    connection,
    `SELECT id, branchId, status FROM ${table} WHERE schoolId = ? AND name = ? LIMIT 1`,
    [schoolId, term.name],
  );
  if (existing) {
    assertSame(existing.branchId, term.branchId, `${term.name} branch`);
    assertSame(existing.status, "active", `${term.name} status`);
    return existing.id;
  }
  return insertId(
    connection,
    `INSERT INTO ${table} (publicId, schoolId, branchId, name) VALUES (?, ?, ?, ?)`,
    [randomUUID(), schoolId, term.branchId, term.name],
  );
}

async function getOrCreateBook(
  connection: PoolConnection,
  schoolId: number,
  spec: typeof books[number],
  categoryId: number,
  subjectId: number,
): Promise<{ id: number; availableCopies: number }> {
  const [existing] = await selectRows<Row & {
    id: number;
    availableCopies: number;
    totalCopies: number;
    isbn: string;
    title: string;
    author: string;
    publisher: string;
    categoryId: number;
    subjectId: number;
    description: string;
    shelfLocation: string;
    price: string;
    status: string;
  }>(
    connection,
    `SELECT id, availableCopies, totalCopies, isbn, title, author, publisher, categoryId, subjectId,
            description, shelfLocation, price, status
     FROM library_books WHERE schoolId = ? AND bookNumber = ? LIMIT 1`,
    [schoolId, spec.bookNumber],
  );
  if (existing) {
    for (const [actual, expected, label] of [
      [existing.totalCopies, spec.totalCopies, "total copies"],
      [existing.isbn, spec.isbn, "ISBN"],
      [existing.title, spec.title, "title"],
      [existing.author, spec.author, "author"],
      [existing.publisher, spec.publisher, "publisher"],
      [existing.categoryId, categoryId, "category"],
      [existing.subjectId, subjectId, "subject"],
      [existing.description, spec.description, "description"],
      [existing.shelfLocation, spec.shelfLocation, "shelf location"],
      [existing.price, spec.price, "price"],
      [existing.status, "active", "status"],
    ] as const) {
      assertSame(actual, expected, `${spec.bookNumber} ${label}`);
    }
    return existing;
  }
  const id = await insertId(
    connection,
    `INSERT INTO library_books
      (publicId, schoolId, branchId, categoryId, subjectId, bookNumber, isbn, title, author,
       publisher, category, description, shelfLocation, price, totalCopies, availableCopies, status)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      randomUUID(), schoolId, categoryId, subjectId, spec.bookNumber, spec.isbn, spec.title,
      spec.author, spec.publisher, spec.categoryName, spec.description, spec.shelfLocation,
      spec.price, spec.totalCopies, spec.totalCopies,
    ],
  );
  return { id, availableCopies: spec.totalCopies };
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

    const [existingMarker] = await selectRows<Row>(
      connection,
      "SELECT id FROM audit_logs WHERE schoolId = ? AND action = 'library_demo_seed.completed' AND resourcePublicId = ? LIMIT 1",
      [schoolId, seedMarker],
    );
    if (existingMarker) {
      await connection.commit();
      console.log(`Library demo data is already seeded for ${demoSchoolName}; no changes were made.`);
      return;
    }

    const [actor] = await selectRows<Row & { userId: string }>(
      connection,
      `SELECT m.userId
       FROM school_memberships m
       JOIN user_roles ur ON ur.membershipId = m.id
       JOIN roles r ON r.id = ur.roleId AND r.schoolId = m.schoolId
       JOIN role_permissions rp ON rp.roleId = r.id
       JOIN permissions p ON p.id = rp.permissionId AND p.\`key\` = 'library.manage'
       WHERE m.schoolId = ? AND m.status = 'active'
       LIMIT 1`,
      [schoolId],
    );
    if (!actor) throw new Error("An active school user with library-management permission is required.");

    const [student] = await selectRows<Row & { id: number; branchId: number | null; status: string }>(
      connection,
      `SELECT s.id, s.branchId, s.status
       FROM students s
       LEFT JOIN library_members lm ON lm.studentId = s.id AND lm.schoolId = s.schoolId
       WHERE s.schoolId = ? AND s.status IN ('active', 'admitted') AND lm.id IS NULL
       ORDER BY s.id LIMIT 1 FOR UPDATE`,
      [schoolId],
    );
    if (!student) throw new Error("An active student without an existing library membership is required for the sample lending records.");

    const categoryIds = new Map<string, number>();
    for (const category of categories) {
      categoryIds.set(category.name, await getOrCreateTerm(connection, "library_categories", schoolId, category));
    }
    const subjectIds = new Map<string, number>();
    for (const subject of subjects) {
      subjectIds.set(subject.name, await getOrCreateTerm(connection, "library_subjects", schoolId, subject));
    }

    const bookIds = new Map<string, { id: number; availableCopies: number }>();
    for (const book of books) {
      const categoryId = categoryIds.get(book.categoryName);
      const subjectId = subjectIds.get(book.subjectName);
      if (!categoryId || !subjectId) throw new Error(`Missing sample category or subject for ${book.bookNumber}.`);
      bookIds.set(book.bookNumber, await getOrCreateBook(connection, schoolId, book, categoryId, subjectId));
    }

    const [existingMember] = await selectRows<Row & {
      id: number;
      studentId: number;
      branchId: number | null;
      status: string;
    }>(
      connection,
      "SELECT id, studentId, branchId, status FROM library_members WHERE schoolId = ? AND memberNumber = ? LIMIT 1",
      [schoolId, "DEMO-LIB-MEMBER-001"],
    );
    let memberId: number;
    if (existingMember) {
      assertSame(existingMember.studentId, student.id, "sample member student");
      assertSame(existingMember.branchId, student.branchId, "sample member branch");
      assertSame(existingMember.status, "active", "sample member status");
      memberId = existingMember.id;
    } else {
      memberId = await insertId(
        connection,
        `INSERT INTO library_members (publicId, schoolId, branchId, studentId, memberNumber, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [randomUUID(), schoolId, student.branchId, student.id, "DEMO-LIB-MEMBER-001"],
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const loanSpecs = [
      { reference: "DEMO-LIB-LOAN-001", bookNumber: "DEMO-LIB-001", issuedAt: today, dueDate: shiftDate(today, 14), returnedAt: null, status: "active" },
      { reference: "DEMO-LIB-LOAN-002", bookNumber: "DEMO-LIB-002", issuedAt: shiftDate(today, -21), dueDate: shiftDate(today, -7), returnedAt: null, status: "active" },
      { reference: "DEMO-LIB-LOAN-003", bookNumber: "DEMO-LIB-003", issuedAt: shiftDate(today, -18), dueDate: shiftDate(today, -4), returnedAt: shiftDate(today, -2), status: "returned" },
    ] as const;
    for (const loan of loanSpecs) {
      const book = bookIds.get(loan.bookNumber);
      if (!book) throw new Error(`Missing sample book ${loan.bookNumber}.`);
      const [existing] = await selectRows<Row & {
        id: number;
        bookId: number;
        studentId: number;
        memberId: number | null;
        issuedAt: string;
        dueDate: string;
        returnedAt: string | null;
        status: string;
      }>(
        connection,
        `SELECT id, bookId, studentId, memberId, issuedAt, dueDate, returnedAt, status
         FROM library_loans WHERE schoolId = ? AND publicId = ? LIMIT 1`,
        [schoolId, loan.reference],
      );
      if (existing) {
        for (const [actual, expected, label] of [
          [existing.bookId, book.id, "book"],
          [existing.studentId, student.id, "student"],
          [existing.memberId, memberId, "member"],
          [existing.issuedAt, loan.issuedAt, "issue date"],
          [existing.dueDate, loan.dueDate, "due date"],
          [existing.returnedAt, loan.returnedAt, "return date"],
          [existing.status, loan.status, "status"],
        ] as const) {
          assertSame(actual, expected, `${loan.reference} ${label}`);
        }
        continue;
      }
      if (loan.status === "active" && book.availableCopies < 1) {
        throw new Error(`No available demo copies remain for ${loan.bookNumber}.`);
      }
      await connection.execute(
        `INSERT INTO library_loans
          (publicId, schoolId, bookId, studentId, memberId, issuedAt, dueDate, returnedAt, status, issuedBy, returnedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loan.reference, schoolId, book.id, student.id, memberId, loan.issuedAt, loan.dueDate,
          loan.returnedAt, loan.status, actor.userId, loan.returnedAt ? actor.userId : null,
        ],
      );
      if (loan.status === "active") {
        await connection.execute(
          "UPDATE library_books SET availableCopies = ? WHERE id = ? AND schoolId = ?",
          [book.availableCopies - 1, book.id, schoolId],
        );
        book.availableCopies -= 1;
      }
    }

    const demoRecords = [
      ...[...categoryIds.values()].map((id) => ({ id, type: "library_category", action: "library_category.demo_seeded" })),
      ...[...subjectIds.values()].map((id) => ({ id, type: "library_subject", action: "library_subject.demo_seeded" })),
    ];
    for (const record of demoRecords) {
      const table = record.type === "library_category" ? "library_categories" : "library_subjects";
      const [term] = await selectRows<Row & { publicId: string }>(
        connection,
        `SELECT publicId FROM ${table} WHERE id = ? AND schoolId = ? LIMIT 1`,
        [record.id, schoolId],
      );
      if (!term) throw new Error(`Could not resolve demo ${record.type}.`);
      await connection.execute(
        `INSERT INTO audit_logs (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [schoolId, actor.userId, record.action, record.type, term.publicId, JSON.stringify(["name"])],
      );
    }
    for (const book of books) {
      const seededBook = bookIds.get(book.bookNumber);
      if (!seededBook) throw new Error(`Could not resolve demo book ${book.bookNumber}.`);
      const [record] = await selectRows<Row & { publicId: string }>(
        connection,
        "SELECT publicId FROM library_books WHERE id = ? AND schoolId = ? LIMIT 1",
        [seededBook.id, schoolId],
      );
      if (!record) throw new Error(`Could not resolve demo book ${book.bookNumber}.`);
      await connection.execute(
        `INSERT INTO audit_logs (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
         VALUES (?, ?, 'library_book.demo_seeded', 'library_book', ?, ?)`,
        [schoolId, actor.userId, record.publicId, JSON.stringify(["bookNumber", "title", "author", "totalCopies"])],
      );
    }
    const [member] = await selectRows<Row & { publicId: string }>(
      connection,
      "SELECT publicId FROM library_members WHERE id = ? AND schoolId = ? LIMIT 1",
      [memberId, schoolId],
    );
    if (!member) throw new Error("Could not resolve the demo library member.");
    await connection.execute(
      `INSERT INTO audit_logs (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
       VALUES (?, ?, 'library_member.demo_seeded', 'library_member', ?, ?)`,
      [schoolId, actor.userId, member.publicId, JSON.stringify(["studentId", "memberNumber"])],
    );
    for (const loan of loanSpecs) {
      const [record] = await selectRows<Row>(
        connection,
        "SELECT id FROM library_loans WHERE schoolId = ? AND publicId = ? LIMIT 1",
        [schoolId, loan.reference],
      );
      if (record) {
        await connection.execute(
          `INSERT INTO audit_logs (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
           VALUES (?, ?, 'library_loan.demo_seeded', 'library_loan', ?, ?)`,
          [schoolId, actor.userId, loan.reference, JSON.stringify(["bookId", "memberId", "issuedAt", "dueDate", "status"])],
        );
      }
    }
    await connection.execute(
      `INSERT INTO audit_logs (schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields)
       VALUES (?, ?, 'library_demo_seed.completed', 'school', ?, ?)`,
      [
        schoolId,
        actor.userId,
        seedMarker,
        JSON.stringify(["sampleCategories", "sampleSubjects", "sampleBooks", "sampleMember", "sampleLoans"]),
      ],
    );

    await connection.commit();
    console.log(`Clearly labeled library demo data is ready for ${demoSchoolName}: ${books.length} sample books, ${categories.length} categories, ${subjects.length} subjects, one sample member, and two active plus one returned sample loan. All records are marked DEMO TEST and are not real library inventory or borrowing activity.`);
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
