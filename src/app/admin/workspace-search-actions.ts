"use server";

import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  accountTransactions,
  chartOfAccounts,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examSubjects,
  examinations,
  feePayments,
  inventoryAssets,
  inventoryCategories,
  inventoryItems,
  inventoryLocations,
  inventorySuppliers,
  libraryBooks,
  libraryLoans,
  libraryMembers,
  libraryCategories,
  librarySubjects,
  staffMembers,
  studentFeeInvoices,
  students,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getFuzzySearchNgrams, rankWorkspaceSearchResults } from "@/lib/workspace-search-policy";

const querySchema = z.string().trim().min(2).max(120);
const workspacePermissions = [
  "students.view",
  "students.create",
  "students.update",
  "staff.manage",
  "school.settings.manage",
  "academics.manage",
  "examinations.create",
  "results.enter",
  "results.publish",
  "fees.manage",
  "payments.record",
  "accounts.manage",
  "inventory.manage",
  "library.manage",
  "dashboard.view",
  "roles.manage",
] as const;

export type WorkspaceSearchResult = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: "Pages" | "Students" | "Staff" | "Academics" | "Examinations" | "Inventory" | "Library" | "Fees" | "Accounts";
  searchTerms?: string[];
};

function patternFor(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

function fuzzyTextMatch(queryTokens: string[], ...columns: Array<Parameters<typeof like>[0]>) {
  const tokenPredicates = queryTokens
    .slice(0, 8)
    .map((token) => {
      const grams = getFuzzySearchNgrams([token]);
      const predicates = columns.flatMap((column) => grams.length
        ? grams.map((gram) => like(sql`lower(${column})`, patternFor(gram)))
        : [like(sql`lower(${column})`, patternFor(token))]);
      return predicates.length ? or(...predicates) : sql`false`;
    });
  return tokenPredicates.length ? and(...tokenPredicates) : sql`false`;
}

export async function searchWorkspace(rawQuery: string): Promise<WorkspaceSearchResult[]> {
  const context = await requireSchoolPermission(workspacePermissions);
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) return [];

  const query = parsed.data;
  const permissions = new Set(context.grantedPermissions);
  const canManageAcademics = permissions.has("academics.manage") || permissions.has("school.settings.manage");
  const canViewStudents = permissions.has("students.view");
  const canManageStaff = permissions.has("school.settings.manage") || permissions.has("staff.manage");
  const canManageExaminations = permissions.has("school.settings.manage") ||
    permissions.has("examinations.create") || permissions.has("results.publish");
  const canEnterResults = canManageExaminations || permissions.has("results.enter");
  const canManageFees = permissions.has("fees.manage") || permissions.has("payments.record");
  const canManageAccounts = permissions.has("accounts.manage");
  const canManageInventory = permissions.has("inventory.manage");
  const canManageLibrary = permissions.has("library.manage");
  const results: WorkspaceSearchResult[] = [];

  const addPage = (
    id: string,
    title: string,
    description: string,
    href: string,
    aliases: string[] = [],
  ) => {
    results.push({ id, title, description, href, category: "Pages", searchTerms: aliases });
  };

  if (permissions.has("dashboard.view")) {
    addPage("dashboard", "Overview dashboard", "School dashboard and activity overview", "/admin/dashboard", ["home"]);
  }
  if (canManageAcademics) {
    for (const [section, title, description, aliases] of [
      ["branches", "Branches", "School locations and branch details", ["location"]],
      ["years", "Academic years", "School year setup and status", ["year"]],
      ["terms", "Terms & exams", "Academic term dates and exam periods", ["term"]],
      ["classes", "Classes", "Class or grade levels", ["class list", "grade"]],
      ["sections", "Class sections", "Year-specific class streams", ["section list", "stream"]],
      ["subjects", "Subjects", "School subjects and class assignments", ["subject list"]],
      ["optional-subjects", "Optional subjects", "Elective subjects by class", ["elective"]],
      ["classrooms", "Classrooms", "Rooms and seat capacities", ["room"]],
      ["routines", "Class routine", "Weekly class timetable", ["timetable", "schedule"]],
      ["teachers", "Teachers", "Teacher assignments and details", ["teacher list"]],
      ["holidays", "Holidays", "School holidays and breaks", ["holiday list"]],
      ["enrollment", "Student enrollment", "Placements, progression and transfers", ["enrolment", "promote"]],
      ["attendance", "Student attendance", "Daily attendance by class and date", ["attendance register", "absent", "present"]],
    ] as const) {
      addPage(`academics-${section}`, title, description, `/admin/academics?section=${section}`, [...aliases, "academics"]);
    }
  }
  if (canViewStudents) {
    addPage("student-list", "Student list", "Search and manage student profiles", "/admin/students", ["students", "student records", "directory", "lists"]);
    addPage("student-reports", "Student Reports", "Open supported student reports, attendance reports, and class routines", "/admin/students/reports", ["student report", "attendance report", "class routine", "timetable"]);
    addPage("student-directory-report", "Student Report", "View or print the student directory", "/admin/students?action=export", ["student report", "student list", "directory"]);
    addPage("student-groups", "Student groups", "Student group lists", "/admin/students/groups", ["group"]);
    addPage("student-disabled", "Disabled students", "Students marked disabled", "/admin/students/disabled");
  }
  if (canEnterResults) {
    addPage("examination-setup", "Examination setup", "Exam configuration, types and grading", "/admin/examinations?section=setup", ["exams", "exam setup"]);
    addPage("exam-schedule", "Exam schedule", "Examination dates and subject schedules", "/admin/examinations?section=schedule", ["routine"]);
    addPage("exam-attendance", "Exam attendance", "Attendance for examination sittings", "/admin/examinations?section=attendance", ["exam attendance"]);
    addPage("marks-register", "Marks register", "Enter or review marks by subject roster", "/admin/examinations?section=marks", ["results", "scores"]);
    addPage("exam-reports", "Exams Reports", "Merit lists, marksheets, tabulation and progress cards", "/admin/examinations/report-center/exam-routine", ["report", "reports", "report cards"]);
    if (permissions.has("examinations.create") || permissions.has("results.publish")) {
      addPage("exam-analytics", "Exam Analytics", "Compare published examination results by class, stream, subject and student", "/admin/exam-analytics", ["exam analytics", "class performance", "subject performance", "student performance", "mean grade"]);
    }
    addPage("send-marks-sms", "Send Marks By SMS", "Send published examination results", "/admin/examinations?section=sms", ["sms", "text message"]);
  }
  if (canManageStaff) {
    addPage("staff-list", "Staff directory", "Search staff profiles and assignments", "/admin/staff", ["staff", "employees", "personnel", "lists"]);
    addPage("staff-attendance", "Staff attendance", "Staff daily attendance register", "/admin/hr/attendance", ["attendance register", "absent", "present"]);
    addPage("staff-attendance-reports", "Staff attendance reports", "Attendance summaries and reports", "/admin/hr/reports", ["report", "reports"]);
    addPage("staff-leave", "Leave management", "Staff leave requests and records", "/admin/hr/leave", ["leave"]);
    addPage("payroll", "Payroll records", "Staff payroll and pay history", "/admin/hr/payroll", ["salary", "pay"]);
  }
  if (canManageFees) {
    addPage("fee-collection", "Fee collection", "Find invoices and record payments", "/admin/fees/collection", ["fees", "invoice", "payment"]);
    addPage("fee-reports", "Fee reports", "Collection and outstanding balance reports", "/admin/fees/reports", ["report", "reports", "balance", "finance"]);
  }
  if (canManageAccounts) {
    addPage("accounts", "Accounts", "Income, expenses, bank accounts, and accounting reports", "/admin/accounts", ["finance", "transactions"]);
  }
  if (permissions.has("accounts.manage")) {
    addPage("accounts-profit", "Profit & Loss", "Income statement for an accounting period", "/admin/accounts?section=profit", ["profit", "loss", "income statement"]);
    addPage("accounts-income", "Income", "Record and review other school income", "/admin/accounts?section=income", ["donations", "grants"]);
    addPage("accounts-expenses", "Expenses", "Record and approve operational expenses", "/admin/accounts?section=expenses", ["staff expenses", "supplies", "utilities", "transport", "maintenance"]);
    addPage("accounts-chart", "Chart of accounts", "Manage accounting codes and reporting categories", "/admin/accounts?section=chart", ["account categories", "ledger"]);
    addPage("accounts-bank", "Bank accounts", "School bank and cash accounts with balances", "/admin/accounts?section=bank", ["cash account"]);
    addPage("accounts-transfers", "Fund transfers", "Move funds between school bank accounts", "/admin/accounts?section=transfers", ["bank transfer"]);
  }
  if (permissions.has("inventory.manage")) {
    addPage("school-inventory", "Inventory", "Stock register, suppliers, stock movement, and low-stock alerts", "/admin/inventory", ["stock", "supplies", "supplier", "low stock"]);
    addPage("inventory-assets", "Assets", "School asset register, locations, and maintenance history", "/admin/inventory?section=assets", ["school assets", "asset location", "maintenance"]);
  }
  if (permissions.has("accounts.manage")) {
    addPage("accounts-reports", "Accounts reports", "Filtered income, expense, approval and net-fee reports", "/admin/accounts?section=reports", ["account reports", "transaction report", "income report", "expense report"]);
  }
  if (permissions.has("inventory.manage")) {
    addPage("inventory-reports", "Inventory reports", "Stock valuation, low-stock, movement, asset, and maintenance reports", "/admin/inventory/reports", ["inventory reports", "stock valuation", "stock movement", "asset report", "maintenance report"]);
  }
  if (canManageLibrary) {
    addPage("library", "Library", "Book catalog, student loans, returns, and overdue books", "/admin/library", ["books", "book loans", "lending", "borrowed", "overdue"]);
    addPage("library-members", "Library members", "Register student and staff borrowers", "/admin/library?section=members", ["student members", "staff members", "library card", "member register"]);
    addPage("library-circulation", "Issue and return books", "Check out, renew, and return library books", "/admin/library?section=issue", ["checkout", "check out", "book return", "circulation"]);
    addPage("library-issued", "Issued books", "Review active, overdue, and returned book loans", "/admin/library?section=issued&status=all", ["loan register", "overdue books", "returned books"]);
    addPage("library-categories", "Library categories", "Organize library books by category", "/admin/library?section=categories", ["book categories"]);
    addPage("library-subjects", "Library subjects", "Organize library books by subject", "/admin/library?section=subjects", ["book subjects"]);
  }
  if (permissions.has("roles.manage")) {
    addPage("user-roles", "User roles", "Users, roles and permission assignments", "/admin/settings/roles", ["permissions", "accounts"]);
  }
  if (permissions.has("school.settings.manage")) {
    addPage("school-profile", "School profile", "School details and configuration", "/admin/settings", ["settings", "school settings"]);
  }

  const pattern = patternFor(query);
  const queryTokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const tokenMatch = (column: Parameters<typeof like>[0]) =>
    and(...queryTokens.map((token) => like(sql`lower(${column})`, patternFor(token))));
  const [
    studentRows,
    inventoryItemRows,
    inventoryAssetRows,
    inventorySupplierRows,
    invoiceRows,
    paymentRows,
    accountTransactionRows,
    staffRows,
    academicRows,
    examRows,
    libraryRows,
    libraryMemberRows,
    libraryLoanRows,
  ] = await Promise.all([
    canViewStudents
      ? db.select({
        publicId: students.publicId,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
      }).from(students)
        .where(and(
          eq(students.schoolId, context.schoolId),
          or(
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            tokenMatch(sql`concat(${students.firstName}, ' ', ${students.lastName})`),
            fuzzyTextMatch(queryTokens,
              students.firstName,
              students.lastName,
              sql`concat(${students.firstName}, ' ', ${students.lastName})`,
            ),
            like(sql`lower(${students.admissionNumber})`, pattern),
            like(sql`lower(${students.publicId})`, pattern),
          ),
        ))
        .orderBy(asc(students.lastName), asc(students.firstName))
        .limit(40)
      : Promise.resolve([]),
    canManageInventory
      ? db.select({
        id: inventoryItems.id,
        sku: inventoryItems.sku,
        name: inventoryItems.name,
        categoryName: inventoryCategories.name,
        supplierId: inventoryItems.supplierId,
        supplierName: inventorySuppliers.name,
        locationName: inventoryLocations.name,
        status: inventoryItems.status,
      }).from(inventoryItems)
        .innerJoin(inventoryCategories, and(
          eq(inventoryCategories.id, inventoryItems.categoryId),
          eq(inventoryCategories.schoolId, context.schoolId),
        ))
        .leftJoin(inventorySuppliers, and(
          eq(inventorySuppliers.id, inventoryItems.supplierId),
          eq(inventorySuppliers.schoolId, context.schoolId),
        ))
        .leftJoin(inventoryLocations, and(
          eq(inventoryLocations.id, inventoryItems.locationId),
          eq(inventoryLocations.schoolId, context.schoolId),
        ))
        .where(and(
          eq(inventoryItems.schoolId, context.schoolId),
          or(
            tokenMatch(inventoryItems.name),
            tokenMatch(inventoryItems.sku),
            tokenMatch(inventoryItems.description),
            tokenMatch(inventoryCategories.name),
            tokenMatch(inventorySuppliers.name),
            tokenMatch(inventoryLocations.name),
            fuzzyTextMatch(queryTokens, inventoryItems.name, inventoryItems.sku, inventoryItems.description, inventoryCategories.name),
          ),
        ))
        .orderBy(asc(inventoryItems.name))
        .limit(30)
      : Promise.resolve([]),
    canManageInventory
      ? db.select({
        id: inventoryAssets.id,
        assetTag: inventoryAssets.assetTag,
        name: inventoryAssets.name,
        locationName: inventoryLocations.name,
        status: inventoryAssets.status,
      }).from(inventoryAssets)
        .leftJoin(inventoryLocations, and(
          eq(inventoryLocations.id, inventoryAssets.locationId),
          eq(inventoryLocations.schoolId, context.schoolId),
        ))
        .where(and(
          eq(inventoryAssets.schoolId, context.schoolId),
          or(
            tokenMatch(inventoryAssets.name),
            tokenMatch(inventoryAssets.assetTag),
            tokenMatch(inventoryAssets.description),
            tokenMatch(inventoryLocations.name),
            fuzzyTextMatch(queryTokens, inventoryAssets.name, inventoryAssets.assetTag),
          ),
        ))
        .orderBy(asc(inventoryAssets.name))
        .limit(20)
      : Promise.resolve([]),
    canManageInventory
      ? db.select({
        id: inventorySuppliers.id,
        name: inventorySuppliers.name,
        contactName: inventorySuppliers.contactName,
        phone: inventorySuppliers.phone,
      }).from(inventorySuppliers)
        .where(and(
          eq(inventorySuppliers.schoolId, context.schoolId),
          or(
            tokenMatch(inventorySuppliers.name),
            tokenMatch(inventorySuppliers.contactName),
            tokenMatch(inventorySuppliers.phone),
            fuzzyTextMatch(queryTokens, inventorySuppliers.name, inventorySuppliers.contactName),
          ),
        ))
        .orderBy(asc(inventorySuppliers.name))
        .limit(20)
      : Promise.resolve([]),
    canManageFees
      ? db.select({
        id: studentFeeInvoices.id,
        invoiceNumber: studentFeeInvoices.invoiceNumber,
        studentName: students.firstName,
        studentLastName: students.lastName,
        admissionNumber: students.admissionNumber,
        status: studentFeeInvoices.status,
      }).from(studentFeeInvoices)
        .innerJoin(students, and(
          eq(students.id, studentFeeInvoices.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          or(
            tokenMatch(studentFeeInvoices.invoiceNumber),
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            tokenMatch(sql`concat(${students.firstName}, ' ', ${students.lastName})`),
            like(sql`lower(${students.admissionNumber})`, pattern),
            fuzzyTextMatch(queryTokens, students.firstName, students.lastName, sql`concat(${students.firstName}, ' ', ${students.lastName})`),
          ),
        ))
        .orderBy(asc(studentFeeInvoices.dueDate), asc(studentFeeInvoices.id))
        .limit(30)
      : Promise.resolve([]),
    canManageFees
      ? db.select({
        id: feePayments.id,
        receiptNumber: feePayments.receiptNumber,
        reference: feePayments.reference,
        invoiceNumber: studentFeeInvoices.invoiceNumber,
        studentName: students.firstName,
        studentLastName: students.lastName,
      }).from(feePayments)
        .innerJoin(studentFeeInvoices, and(
          eq(studentFeeInvoices.id, feePayments.invoiceId),
          eq(studentFeeInvoices.schoolId, context.schoolId),
        ))
        .innerJoin(students, and(
          eq(students.id, studentFeeInvoices.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .where(and(
          eq(feePayments.schoolId, context.schoolId),
          or(
            tokenMatch(feePayments.receiptNumber),
            tokenMatch(feePayments.reference),
            tokenMatch(studentFeeInvoices.invoiceNumber),
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            fuzzyTextMatch(queryTokens, students.firstName, students.lastName, studentFeeInvoices.invoiceNumber),
          ),
        ))
        .orderBy(asc(feePayments.paidAt))
        .limit(20)
      : Promise.resolve([]),
    canManageAccounts
      ? db.select({
        id: accountTransactions.id,
        transactionType: accountTransactions.transactionType,
        transactionDate: accountTransactions.transactionDate,
        description: accountTransactions.description,
        payee: accountTransactions.payee,
        reference: accountTransactions.reference,
        accountName: chartOfAccounts.name,
      }).from(accountTransactions)
        .innerJoin(chartOfAccounts, and(
          eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
          eq(chartOfAccounts.schoolId, context.schoolId),
        ))
        .where(and(
          eq(accountTransactions.schoolId, context.schoolId),
          or(
            tokenMatch(accountTransactions.description),
            tokenMatch(accountTransactions.payee),
            tokenMatch(accountTransactions.reference),
            tokenMatch(chartOfAccounts.name),
            fuzzyTextMatch(queryTokens, accountTransactions.description, accountTransactions.payee),
          ),
        ))
        .orderBy(asc(accountTransactions.transactionDate))
        .limit(20)
      : Promise.resolve([]),
    canManageStaff
      ? db.select({
        publicId: staffMembers.publicId,
        firstName: staffMembers.firstName,
        lastName: staffMembers.lastName,
        employeeCode: staffMembers.employeeCode,
        jobTitle: staffMembers.jobTitle,
        department: staffMembers.department,
      }).from(staffMembers)
        .where(and(
          eq(staffMembers.schoolId, context.schoolId),
          or(
            tokenMatch(staffMembers.firstName),
            tokenMatch(staffMembers.lastName),
            tokenMatch(sql`concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName})`),
            fuzzyTextMatch(queryTokens,
              staffMembers.firstName,
              staffMembers.lastName,
              sql`concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName})`,
            ),
            like(sql`lower(${staffMembers.employeeCode})`, pattern),
            tokenMatch(staffMembers.jobTitle),
            tokenMatch(staffMembers.department),
          ),
        ))
        .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName))
        .limit(30)
      : Promise.resolve([]),
    canManageAcademics
      ? Promise.all([
        db.select({ id: classLevels.id, name: classLevels.name, code: classLevels.code })
          .from(classLevels)
          .where(and(
            eq(classLevels.schoolId, context.schoolId),
            or(tokenMatch(classLevels.name), fuzzyTextMatch(queryTokens, classLevels.name), like(sql`lower(${classLevels.code})`, pattern)),
          ))
          .orderBy(asc(classLevels.name))
          .limit(20),
        db.select({
          id: classSections.id,
          name: classSections.name,
          className: classLevels.name,
          yearId: academicYears.id,
        }).from(classSections)
          .innerJoin(classLevels, and(
            eq(classLevels.id, classSections.classLevelId),
            eq(classLevels.schoolId, context.schoolId),
          ))
          .innerJoin(academicYears, and(
            eq(academicYears.id, classSections.academicYearId),
            eq(academicYears.schoolId, context.schoolId),
          ))
          .where(and(
            eq(classSections.schoolId, context.schoolId),
            or(tokenMatch(classSections.name), tokenMatch(classLevels.name), fuzzyTextMatch(queryTokens, classSections.name, classLevels.name)),
          ))
          .orderBy(asc(classLevels.name), asc(classSections.name))
          .limit(20),
        db.select({
          id: subjects.id,
          name: subjects.name,
          code: subjects.code,
        }).from(subjects)
          .where(and(
            eq(subjects.schoolId, context.schoolId),
            or(tokenMatch(subjects.name), fuzzyTextMatch(queryTokens, subjects.name), like(sql`lower(${subjects.code})`, pattern)),
          ))
          .orderBy(asc(subjects.name))
          .limit(20),
      ])
      : Promise.resolve([[], [], []] as const),
    canManageExaminations
      ? db.select({
        id: examinations.id,
        name: examinations.name,
        status: examinations.status,
        startDate: examinations.startDate,
        className: classLevels.name,
      }).from(examinations)
        .leftJoin(examClasses, and(
          eq(examClasses.examinationId, examinations.id),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .leftJoin(classLevels, and(
          eq(classLevels.id, examClasses.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .where(and(
          eq(examinations.schoolId, context.schoolId),
          or(tokenMatch(examinations.name), tokenMatch(classLevels.name), fuzzyTextMatch(queryTokens, examinations.name, classLevels.name)),
        ))
        .orderBy(asc(examinations.startDate), asc(examinations.name))
        .limit(30)
      : permissions.has("results.enter")
        ? db.select({
          id: examinations.id,
          name: examinations.name,
          status: examinations.status,
          startDate: examinations.startDate,
          className: classLevels.name,
        }).from(examinations)
          .innerJoin(examClasses, and(
            eq(examClasses.examinationId, examinations.id),
            eq(examClasses.schoolId, context.schoolId),
          ))
          .innerJoin(classLevels, and(
            eq(classLevels.id, examClasses.classLevelId),
            eq(classLevels.schoolId, context.schoolId),
          ))
          .innerJoin(examSubjects, and(
            eq(examSubjects.examClassId, examClasses.id),
            eq(examSubjects.schoolId, context.schoolId),
          ))
          .innerJoin(classSubjects, and(
            eq(classSubjects.id, examSubjects.classSubjectId),
            eq(classSubjects.schoolId, context.schoolId),
          ))
          .innerJoin(teachers, and(
            eq(teachers.id, classSubjects.teacherId!),
            eq(teachers.schoolId, context.schoolId),
            eq(teachers.status, "active"),
          ))
          .innerJoin(staffMembers, and(
            eq(staffMembers.id, teachers.staffMemberId!),
            eq(staffMembers.schoolId, context.schoolId),
            eq(staffMembers.linkedUserId, context.user.id),
            eq(staffMembers.status, "active"),
          ))
          .where(and(
            eq(examinations.schoolId, context.schoolId),
            or(tokenMatch(examinations.name), tokenMatch(classLevels.name), fuzzyTextMatch(queryTokens, examinations.name, classLevels.name)),
          ))
          .groupBy(examinations.id, examinations.name, examinations.status, examinations.startDate, classLevels.name)
          .orderBy(asc(examinations.startDate), asc(examinations.name))
          .limit(30)
        : Promise.resolve([]),
    canManageLibrary
      ? db.select({
        id: libraryBooks.id,
        title: libraryBooks.title,
        author: libraryBooks.author,
        bookNumber: libraryBooks.bookNumber,
        isbn: libraryBooks.isbn,
        availableCopies: libraryBooks.availableCopies,
        categoryName: libraryCategories.name,
        subjectName: librarySubjects.name,
      }).from(libraryBooks)
        .leftJoin(libraryCategories, and(
          eq(libraryCategories.id, libraryBooks.categoryId),
          eq(libraryCategories.schoolId, context.schoolId),
        ))
        .leftJoin(librarySubjects, and(
          eq(librarySubjects.id, libraryBooks.subjectId),
          eq(librarySubjects.schoolId, context.schoolId),
        ))
        .where(and(
          eq(libraryBooks.schoolId, context.schoolId),
          or(
            tokenMatch(libraryBooks.title),
            tokenMatch(libraryBooks.author),
            tokenMatch(libraryBooks.bookNumber),
            tokenMatch(libraryBooks.isbn),
            tokenMatch(libraryCategories.name),
            tokenMatch(librarySubjects.name),
            fuzzyTextMatch(queryTokens,
              libraryBooks.title,
              libraryBooks.author,
              libraryBooks.bookNumber,
              libraryBooks.isbn,
              libraryCategories.name,
              librarySubjects.name,
            ),
          ),
        ))
        .orderBy(asc(libraryBooks.title))
        .limit(20)
      : Promise.resolve([]),
    canManageLibrary
      ? db.select({
        id: libraryMembers.id,
        memberNumber: libraryMembers.memberNumber,
        memberType: libraryMembers.memberType,
        status: libraryMembers.status,
        firstName: sql<string | null>`coalesce(${students.firstName}, ${staffMembers.firstName})`,
        lastName: sql<string | null>`coalesce(${students.lastName}, ${staffMembers.lastName})`,
        admissionNumber: students.admissionNumber,
        employeeCode: staffMembers.employeeCode,
      }).from(libraryMembers)
        .leftJoin(students, and(
          eq(students.id, libraryMembers.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .leftJoin(staffMembers, and(
          eq(staffMembers.id, libraryMembers.staffMemberId),
          eq(staffMembers.schoolId, context.schoolId),
        ))
        .where(and(
          eq(libraryMembers.schoolId, context.schoolId),
          or(
            tokenMatch(libraryMembers.memberNumber),
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            tokenMatch(sql`concat(${students.firstName}, ' ', ${students.lastName})`),
            like(sql`lower(${students.admissionNumber})`, pattern),
            tokenMatch(staffMembers.firstName),
            tokenMatch(staffMembers.lastName),
            tokenMatch(sql`concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName})`),
            like(sql`lower(${staffMembers.employeeCode})`, pattern),
            fuzzyTextMatch(queryTokens,
              libraryMembers.memberNumber,
              students.firstName,
              students.lastName,
              staffMembers.firstName,
              staffMembers.lastName,
            ),
          ),
        ))
        .orderBy(asc(libraryMembers.memberNumber))
        .limit(20)
      : Promise.resolve([]),
    canManageLibrary
      ? db.select({
        id: libraryLoans.id,
        bookTitle: libraryBooks.title,
        bookNumber: libraryBooks.bookNumber,
        memberNumber: libraryMembers.memberNumber,
        memberType: libraryMembers.memberType,
        borrowerName: sql<string>`coalesce(concat(${students.firstName}, ' ', ${students.lastName}), concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName}), 'Unknown member')`,
        dueDate: libraryLoans.dueDate,
        status: libraryLoans.status,
      }).from(libraryLoans)
        .innerJoin(libraryBooks, and(
          eq(libraryBooks.id, libraryLoans.bookId),
          eq(libraryBooks.schoolId, context.schoolId),
        ))
        .leftJoin(libraryMembers, and(
          eq(libraryMembers.id, libraryLoans.memberId),
          eq(libraryMembers.schoolId, context.schoolId),
        ))
        .leftJoin(students, and(
          eq(students.id, sql`coalesce(${libraryLoans.studentId}, ${libraryMembers.studentId})`),
          eq(students.schoolId, context.schoolId),
        ))
        .leftJoin(staffMembers, and(
          eq(staffMembers.id, libraryMembers.staffMemberId),
          eq(staffMembers.schoolId, context.schoolId),
        ))
        .where(and(
          eq(libraryLoans.schoolId, context.schoolId),
          or(
            tokenMatch(libraryBooks.title),
            tokenMatch(libraryBooks.author),
            tokenMatch(libraryBooks.bookNumber),
            tokenMatch(libraryMembers.memberNumber),
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            tokenMatch(sql`concat(${students.firstName}, ' ', ${students.lastName})`),
            tokenMatch(staffMembers.firstName),
            tokenMatch(staffMembers.lastName),
            tokenMatch(sql`concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName})`),
            like(sql`lower(${students.admissionNumber})`, pattern),
            like(sql`lower(${staffMembers.employeeCode})`, pattern),
          ),
        ))
        .orderBy(asc(libraryLoans.dueDate))
        .limit(20)
      : Promise.resolve([]),
  ]);

  for (const student of studentRows) {
    results.push({
      id: `student-${student.publicId}`,
      title: `${student.firstName} ${student.lastName}`,
      description: student.admissionNumber ? `Student · Admission no. ${student.admissionNumber}` : "Student profile",
      href: `/admin/students?profile=${encodeURIComponent(student.publicId)}`,
      category: "Students",
    });
  }
  for (const item of inventoryItemRows) {
    results.push({
      id: `inventory-item-${item.id}`,
      title: item.name,
      description: `Inventory · ${item.sku} · ${item.categoryName} · ${item.status}`,
      href: `/admin/inventory?search=${encodeURIComponent(query)}`,
      category: "Inventory",
    });
  }
  for (const asset of inventoryAssetRows) {
    results.push({
      id: `inventory-asset-${asset.id}`,
      title: asset.name,
      description: `Asset · ${asset.assetTag} · ${asset.locationName ?? "Unassigned"} · ${asset.status}`,
      href: `/admin/inventory?section=assets&search=${encodeURIComponent(query)}`,
      category: "Inventory",
    });
  }
  for (const supplier of inventorySupplierRows) {
    results.push({
      id: `inventory-supplier-${supplier.id}`,
      title: supplier.name,
      description: ["Supplier", supplier.contactName, supplier.phone].filter(Boolean).join(" · "),
      href: `/admin/inventory?supplierId=${supplier.id}`,
      category: "Inventory",
    });
  }
  for (const invoice of invoiceRows) {
    results.push({
      id: `fee-invoice-${invoice.id}`,
      title: invoice.invoiceNumber,
      description: `Fee invoice · ${invoice.studentName} ${invoice.studentLastName} · ${invoice.status}`,
      href: `/admin/fees/collection?search=${encodeURIComponent(invoice.invoiceNumber)}`,
      category: "Fees",
    });
  }
  for (const payment of paymentRows) {
    results.push({
      id: `fee-payment-${payment.id}`,
      title: payment.receiptNumber,
      description: `Fee payment · ${payment.studentName} ${payment.studentLastName} · ${payment.invoiceNumber}`,
      href: `/admin/fees/receipt/${payment.id}`,
      category: "Fees",
    });
  }
  for (const transaction of accountTransactionRows) {
    results.push({
      id: `account-transaction-${transaction.id}`,
      title: transaction.description,
      description: `${transaction.transactionType} · ${transaction.accountName} · ${transaction.payee ?? transaction.reference ?? transaction.transactionDate}`,
      href: `/admin/accounts?section=reports&from=${transaction.transactionDate}&to=${transaction.transactionDate}&search=${encodeURIComponent(query)}`,
      category: "Accounts",
    });
  }
  for (const staff of staffRows) {
    results.push({
      id: `staff-${staff.publicId}`,
      title: `${staff.firstName} ${staff.lastName}`,
      description: [staff.jobTitle, staff.department, staff.employeeCode].filter(Boolean).join(" · "),
      href: `/admin/staff?profile=${encodeURIComponent(staff.publicId)}`,
      category: "Staff",
    });
  }
  for (const classLevel of academicRows[0]) {
    results.push({
      id: `class-${classLevel.id}`,
      title: classLevel.name,
      description: `Class · ${classLevel.code}`,
      href: `/admin/academics?section=classes&search=${encodeURIComponent(classLevel.name)}`,
      category: "Academics",
    });
  }
  for (const section of academicRows[1]) {
    results.push({
      id: `section-${section.id}`,
      title: `${section.className} · ${section.name}`,
      description: "Class section",
      href: `/admin/academics?section=sections&search=${encodeURIComponent(section.name)}`,
      category: "Academics",
    });
  }
  for (const subject of academicRows[2]) {
    results.push({
      id: `subject-${subject.id}`,
      title: subject.name,
      description: `Subject · ${subject.code}`,
      href: `/admin/academics?section=subjects&search=${encodeURIComponent(subject.name)}`,
      category: "Academics",
    });
  }
  for (const exam of examRows) {
    results.push({
      id: `exam-${exam.id}`,
      title: exam.name,
      description: [exam.className, exam.status, exam.startDate].filter(Boolean).join(" · "),
      href: `/admin/examinations?section=setup&examId=${exam.id}`,
      category: "Examinations",
    });
  }
  for (const book of libraryRows) {
    results.push({
      id: `library-book-${book.id}`,
      title: book.title,
      description: [
        "Library book",
        book.author,
        book.bookNumber,
        book.categoryName,
        book.subjectName,
        `${book.availableCopies} available`,
      ].filter(Boolean).join(" · "),
      href: `/admin/library?section=books&q=${encodeURIComponent(book.title)}`,
      category: "Library",
    });
  }
  for (const member of libraryMemberRows) {
    results.push({
      id: `library-member-${member.id}`,
      title: member.firstName && member.lastName
        ? `${member.firstName} ${member.lastName}`
        : member.memberNumber,
      description: [
        member.memberType === "staff" ? "Staff library member" : "Student library member",
        `Member ${member.memberNumber}`,
        member.admissionNumber ? `Admission ${member.admissionNumber}` : null,
        member.employeeCode ? `Employee ${member.employeeCode}` : null,
        member.status,
      ].filter(Boolean).join(" · "),
      href: `/admin/library?section=members&q=${encodeURIComponent(query)}`,
      category: "Library",
    });
  }
  for (const loan of libraryLoanRows) {
    results.push({
      id: `library-loan-${loan.id}`,
      title: loan.bookTitle,
      description: `${loan.status === "active" ? "Book loan" : "Returned book"} · ${loan.borrowerName} · Due ${loan.dueDate}`,
      href: `/admin/library?section=issued&status=all&q=${encodeURIComponent(query)}`,
      category: "Library",
    });
  }

  return rankWorkspaceSearchResults(query, results, 20);
}
