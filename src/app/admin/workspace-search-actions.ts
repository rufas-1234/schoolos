"use server";

import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  accountTransactions,
  chartOfAccounts,
  classLevels,
  classSections,
  classSubjects,
  dormitories,
  dormitoryRooms,
  feeAdvanceTransactions,
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
  studentDormitoryAssignments,
  students,
  studentBehaviorRecords,
  subjects,
  teachers,
  schoolMemberships,
  staffApplications,
  staffLeaveRequests,
  staffLeaveTypes,
  studentCertificates,
  user,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { academicSections } from "@/lib/academic-sections";
import { studentSections } from "@/lib/student-sections";
import {
  feePaymentWorkspaceResult,
  getFuzzySearchNgrams,
  rankWorkspaceSearchResults,
  studentCertificateWorkspaceResult,
  studentIdWorkspaceResult,
} from "@/lib/workspace-search-policy";

const querySchema = z.string().trim().min(2).max(120);
const workspacePermissions = [
  "students.view",
  "students.create",
  "students.update",
  "students.delete",
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
  "dormitories.manage",
  "dashboard.view",
  "roles.manage",
] as const;

export type WorkspaceSearchResult = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: "Pages" | "Users" | "Students" | "Staff" | "Academics" | "Examinations" | "Inventory" | "Library" | "Dormitories" | "Fees" | "Accounts";
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
  const canManageDormitories = permissions.has("dormitories.manage");
  const canManageStudents = permissions.has("students.view");
  const canManageStudentSettings = permissions.has("school.settings.manage") || permissions.has("students.update");
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
  if (permissions.has("results.enter")) {
    addPage("teacher-portal", "Teacher portal", "Teacher class lists, attendance, and marks entry", "/portal/teacher", ["teacher", "my classes", "class portal"]);
  }
  if (canManageAcademics) {
    addPage(
      "academics-overview",
      "Academic overview",
      "Academic year, student enrollment, classes, subjects, and term schedule",
      "/admin/academics/overview",
      ["academic dashboard", "academics overview"],
    );
    addPage(
      "academic-certificates",
      "Student certificates",
      "Issue and review certificates for academic, leadership, sports, and other achievements",
      "/admin/academics/certificates",
      ["awards", "prefect certificate", "sports certificate", "achievement"],
    );
    for (const section of academicSections) {
      addPage(
        `academics-${section.id}`,
        section.label,
        section.description,
        `/admin/academics?section=${section.id}`,
        [section.id, "academics"],
      );
    }
  }
  if (canViewStudents || canManageAcademics) {
    addPage("student-attendance-reports", "Student attendance reports", "Review student attendance records day by day", "/admin/academics/attendance-reports", ["student attendance", "daily attendance report", "attendance history"]);
  }
  if (canManageStudents) {
    addPage("behavior-overview", "Behavior overview", "Record and review student behavior and incidents", "/admin/students/behavior", ["behavior", "student conduct"]);
    addPage("behavior-incidents", "Student incident reports", "Review recorded student incidents", "/admin/students/behavior?view=incidents", ["incident reports", "student incidents"]);
    addPage("behavior-rankings", "Behavior reports & rankings", "Student, class, section, and incident behavior rankings", "/admin/students/behavior/reports", ["behavior report", "class-wise rank", "section-wise rank", "incident-wise rank"]);
    addPage("behavior-incident-types", "Incident types & actions", "Configure behavior incident categories and follow-up actions", "/admin/students/behavior/settings", ["behavior settings", "incident categories"]);
    for (const section of studentSections) {
      if (
        ("permission" in section && section.permission && !permissions.has(section.permission)) &&
        (!("permissionAlternatives" in section) || !section.permissionAlternatives?.some((permission) => permissions.has(permission)))
      ) continue;
      addPage(
        `student-${section.id}`,
        section.label,
        `Student management · ${section.label}`,
        section.href,
        [section.id, "student", "students"],
      );
    }
  }
  if (!canManageStudents && permissions.has("students.update")) {
    addPage("student-admission-desk", "Admission Desk", "Review online registrations and manage pending student admissions", "/admin/admissions", ["admission applications", "online registration", "pending admissions"]);
  }
  if (canEnterResults) {
    if (permissions.has("examinations.create") || permissions.has("results.publish")) {
      addPage(
        "examinations-overview",
        "Exams Overview",
        "Upcoming examinations, active sittings, published results, and exam workflows",
        "/admin/examinations/overview",
        ["exams overview", "examination dashboard"],
      );
    }
    addPage("exam-types", "Exam type", "Configure examination types", "/admin/examinations?section=types", ["examination type", "assessment type"]);
    addPage("examination-setup", "Examination setup", "Create, configure, and manage examinations", "/admin/examinations?section=setup", ["exams", "exam setup"]);
    addPage("exam-schedule", "Exam schedule", "Examination dates and subject schedules", "/admin/examinations?section=schedule", ["routine", "timetable"]);
    addPage("exam-attendance", "Exam attendance", "Attendance for examination sittings", "/admin/examinations?section=attendance", ["exam attendance", "exam register"]);
    addPage("marks-register", "Marks register", "Enter or review marks by subject roster", "/admin/examinations?section=marks", ["results", "scores"]);
    addPage("exam-grades", "Marks grade", "Configure examination grading scales and grades", "/admin/examinations?section=grades", ["grades", "grading"]);
    addPage("exam-reports", "Exams Reports", "Merit lists, marksheets, tabulation and progress cards", "/admin/examinations/report-center/exam-routine", ["report", "reports", "report cards"]);
    if (permissions.has("examinations.create") || permissions.has("results.publish")) {
      addPage("exam-report-signatures", "Report signatures", "Upload and manage exam report signatures", "/admin/examinations/signatures", ["signatures", "headteacher signature", "teacher signature"]);
    }
    if (permissions.has("examinations.create") || permissions.has("results.publish")) {
      addPage("exam-analytics", "Exam Analytics", "Compare published examination results by class, stream, subject and student", "/admin/exam-analytics", ["exam analytics", "class performance", "subject performance", "student performance", "mean grade"]);
    }
    addPage("send-marks-sms", "Send Marks By SMS", "Send published examination results", "/admin/examinations?section=sms", ["sms", "text message"]);
  }
  if (canManageStaff) {
    addPage("staff-list", "Staff directory", "Search staff profiles and assignments", "/admin/staff", ["staff", "employees", "personnel", "lists"]);
    addPage("staff-applications", "Staff applications", "Review public staff registrations", "/admin/staff/applications", ["staff registration", "applicants", "employment application"]);
    addPage("hr-overview", "HR overview", "Human resources staff summary", "/admin/hr", ["human resources", "staff summary"]);
    addPage("hr-departments", "Departments", "Manage staff departments", "/admin/hr/departments", ["department"]);
    addPage("hr-designations", "Departments & designations", "Manage staff departments and job designations together", "/admin/hr/departments#designations", ["designation", "job title"]);
    addPage("staff-attendance", "Staff attendance", "Staff daily attendance register", "/admin/hr/attendance", ["attendance register", "absent", "present"]);
    addPage("staff-attendance-reports", "Staff attendance reports", "Attendance summaries and reports", "/admin/hr/reports", ["report", "reports"]);
    addPage("staff-leave", "Leave overview", "Define leave types, assign entitlements, review staff requests, and print reports", "/admin/hr/leave", ["leave", "leave requests", "pending leave"]);
    const leaveQueryTokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const leaveRequestRows = await db.select({
      publicId: staffLeaveRequests.publicId,
      staffId: staffMembers.id,
      branchId: staffMembers.branchId,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
      employeeCode: staffMembers.employeeCode,
      leaveTypeId: staffLeaveTypes.id,
      leaveTypeName: staffLeaveTypes.name,
      startDate: staffLeaveRequests.startDate,
      endDate: staffLeaveRequests.endDate,
      status: staffLeaveRequests.status,
      reason: staffLeaveRequests.reason,
    }).from(staffLeaveRequests)
      .innerJoin(staffMembers, and(
        eq(staffLeaveRequests.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .innerJoin(staffLeaveTypes, and(
        eq(staffLeaveRequests.leaveTypeId, staffLeaveTypes.id),
        eq(staffLeaveTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
          fuzzyTextMatch(leaveQueryTokens, staffMembers.firstName, staffMembers.lastName, staffMembers.employeeCode,
          staffLeaveTypes.name, staffLeaveRequests.reason, staffLeaveRequests.status),
      ))
      .orderBy(desc(staffLeaveRequests.createdAt))
      .limit(20);
    for (const request of leaveRequestRows) {
      const staffName = `${request.firstName} ${request.lastName}`;
      results.push({
        id: `staff-leave-${request.publicId}`,
        title: `${staffName} · ${request.leaveTypeName}`,
        description: `${request.status} · ${request.startDate} to ${request.endDate} · ${request.employeeCode ?? "No staff number"}`,
        href: `/admin/hr/leave?search=${encodeURIComponent(staffName)}&staffId=${request.staffId}&leaveTypeId=${request.leaveTypeId}&requestStatus=${request.status}${request.branchId ? `&branchId=${request.branchId}` : ""}`,
        category: "Staff",
        searchTerms: [staffName, request.employeeCode ?? "", request.leaveTypeName, request.status, request.reason],
      });
    }
    addPage("payroll", "Payroll records", "Staff payroll and pay history", "/admin/hr/payroll", ["salary", "pay"]);
    addPage("hr-settings", "HR settings", "Configure staff fields and HR settings", "/admin/hr/settings", ["staff settings", "human resources settings"]);
  }
  if (canManageFees || canManageAccounts || permissions.has("inventory.manage")) {
    addPage("finance-overview", "Finance overview", "Financial summary of fee collections, accounts, and school stock", "/admin/finance", ["finance", "finance workspace", "accounts portal", "bursar"]);
  }
  if (canManageFees) {
    addPage("fee-overview", "Fees overview", "Open fee setup, collection, invoice, and report links", "/admin/fees/overview", ["fees", "fee dashboard", "fee setup", "fee overview"]);
    if (permissions.has("fees.manage")) {
      addPage("fee-setup", "Fee setup", "Configure fee groups, types, discounts, and structures", "/admin/fees", ["fees setup", "fee structure", "fee types", "discounts"]);
    }
    addPage("fee-collection", "Fee collection", "Find invoices and record payments", "/admin/fees/collection", ["fees", "invoice", "payment"]);
    addPage("fee-carry-forward", "Carry-forward fees", "Record advance fee payments and apply student credit to future invoices", "/admin/fees/collection/carry-forward", ["advance fees", "prepaid fees", "student credit", "future fees"]);
    addPage("fee-reports", "Fee reports", "Collection and outstanding balance reports", "/admin/fees/reports", ["report", "reports", "balance", "finance"]);
  }
  if (canManageAccounts) {
    addPage("accounts", "Accounts", "Income, expenses, bank accounts, and accounting reports", "/admin/accounts", ["finance", "transactions"]);
  }
  if (permissions.has("accounts.manage")) {
    addPage("accounts-profit", "Profit & Loss", "Income statement for an accounting period", "/admin/accounts?section=profit", ["profit", "loss", "income statement"]);
    addPage("accounts-payroll", "Staff payroll payments", "Record staff salary payments in Accounts", "/admin/accounts?section=payroll", ["salary payments", "pay staff", "payroll payment", "staff salaries"]);
    addPage("accounts-income", "Income", "Record and review other school income", "/admin/accounts?section=income", ["donations", "grants"]);
    addPage("accounts-expenses", "Expenses", "Record and approve operational expenses", "/admin/accounts?section=expenses", ["staff expenses", "supplies", "utilities", "transport", "maintenance"]);
    addPage("accounts-chart", "Chart of accounts", "Manage accounting codes and reporting categories", "/admin/accounts?section=chart", ["account categories", "ledger"]);
    addPage("accounts-bank", "Bank accounts", "School bank and cash accounts with balances", "/admin/accounts?section=bank", ["cash account"]);
    addPage("accounts-transfers", "Fund transfers", "Move funds between school bank accounts", "/admin/accounts?section=transfers", ["bank transfer"]);
    addPage("accounts-reports", "Accounts reports", "Filtered income, expense, approval and net-fee reports", "/admin/accounts?section=reports", ["account reports", "transaction report", "income report", "expense report"]);
  }
  if (permissions.has("inventory.manage")) {
    addPage("school-inventory", "Inventory", "Stock register, suppliers, stock movement, and low-stock alerts", "/admin/inventory", ["stock", "supplies", "supplier", "low stock"]);
    addPage("inventory-assets", "Assets", "School asset register, locations, and maintenance history", "/admin/inventory?section=assets", ["school assets", "asset location", "maintenance"]);
  }
  if (permissions.has("inventory.manage")) {
    addPage("inventory-reports", "Inventory reports", "Stock valuation, low-stock, movement, asset, and maintenance reports", "/admin/inventory/reports", ["inventory reports", "stock valuation", "stock movement", "asset report", "maintenance report"]);
  }
  if (permissions.has("inventory.manage") || canManageAccounts) {
    addPage("inventory-locations", "Inventory locations", "Manage stock and asset storage locations", "/admin/inventory?section=inventory", ["stock location", "warehouse"]);
    addPage("inventory-suppliers", "Inventory suppliers", "Manage inventory suppliers", "/admin/inventory?section=inventory", ["supplier", "vendor"]);
  }
  if (canManageLibrary) {
    addPage("library-portal", "Library portal", "Library overview, lending activity, and caretaker shortcuts", "/portal/library", ["librarian", "library workspace", "library caretaker"]);
    addPage("library", "Library overview", "Catalog health, circulation activity, members, and returns", "/admin/library?section=overview", ["library dashboard", "library operations"]);
    addPage("library-books", "Book catalog", "Search and manage library book titles", "/admin/library?section=books", ["books", "library books", "catalog"]);
    addPage("library-add-book", "Add book", "Add a new title to the library catalog", "/admin/library?section=add-book", ["new book", "catalog"]);
    addPage("library-members", "Library members", "Register student and staff borrowers", "/admin/library?section=members", ["student members", "staff members", "library card", "member register"]);
    addPage("library-circulation", "Issue and return books", "Check out, renew, and return library books", "/admin/library?section=issue", ["checkout", "check out", "book return", "circulation"]);
    addPage("library-issued", "Issued books", "Review active, overdue, and returned book loans", "/admin/library?section=issued&status=all", ["loan register", "overdue books", "returned books"]);
    addPage("library-categories", "Library categories", "Organize library books by category", "/admin/library?section=categories", ["book categories"]);
    addPage("library-subjects", "Library subjects", "Organize library books by subject", "/admin/library?section=subjects", ["book subjects"]);
  }
  if (canManageDormitories) {
    addPage("dormitory-portal", "Dormitory portal", "Dormitory overview, room assignments, and caretaker shortcuts", "/portal/dormitories", ["dormitory caretaker", "boarding", "hostel portal"]);
    addPage("dormitories", "Dormitory management", "Manage school dormitories, rooms, occupancy, and student assignments", "/admin/dormitories", ["hostel", "boarding", "residents", "room assignments"]);
  }
  if (permissions.has("roles.manage")) {
    addPage("users-overview", "Users overview", "Open school user accounts, access, and role shortcuts", "/admin/users/overview", ["user overview", "user dashboard", "accounts"]);
    addPage("users", "Users", "School user accounts and access", "/admin/users", ["user list", "accounts"]);
    addPage("user-roles", "User roles", "Create roles and manage account permissions", "/admin/users/roles", ["permissions", "roles"]);
  }
  if (permissions.has("school.settings.manage")) {
    addPage("school-profile", "School profile", "School details and configuration", "/admin/settings", ["settings", "school settings"]);
    addPage("system-settings", "System Settings", "Configure school profile, student settings, staff settings, and role access", "/admin/system/settings", ["system", "configuration"]);
    addPage("user-logs", "User Logs", "Review school-scoped user and system activity logs", "/admin/system/user-logs", ["audit log", "activity log", "user activity", "history"]);
  }
  if (canManageStudentSettings) {
    addPage("student-settings", "Student settings", "Configure student admission numbers, roll numbers, and profile fields", "/admin/students/settings", ["student settings", "admission format", "roll number format", "student fields"]);
  }

  const pattern = patternFor(query);
  const queryTokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const tokenMatch = (column: Parameters<typeof like>[0]) =>
    and(...queryTokens.map((token) => like(sql`lower(${column})`, patternFor(token))));
  const applicationFirstName = sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${staffApplications.applicationData}, '$.firstName'))`;
  const applicationLastName = sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${staffApplications.applicationData}, '$.lastName'))`;
  const applicationFullName = sql<string>`concat(${applicationFirstName}, ' ', ${applicationLastName})`;
  const applicationEmployeeCode = sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${staffApplications.applicationData}, '$.employeeCode'))`;
  const applicationJobTitle = sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${staffApplications.applicationData}, '$.jobTitle'))`;
  const applicationDepartment = sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${staffApplications.applicationData}, '$.department'))`;
  const applicationEmail = sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${staffApplications.applicationData}, '$.email'))`;
  const [
    userRows,
    behaviorRows,
    studentRows,
    inventoryItemRows,
    inventoryAssetRows,
    inventorySupplierRows,
    invoiceRows,
    paymentRows,
    advanceRows,
    accountTransactionRows,
    staffRows,
    staffApplicationRows,
    academicRows,
    certificateRows,
    examRows,
    libraryRows,
    libraryMemberRows,
    libraryLoanRows,
    auditLogRows,
  ] = await Promise.all([
    permissions.has("roles.manage")
      ? db.select({
        name: user.name,
        email: user.email,
      }).from(schoolMemberships)
        .innerJoin(user, eq(schoolMemberships.userId, user.id))
        .where(and(
          eq(schoolMemberships.schoolId, context.schoolId),
          or(tokenMatch(user.name), tokenMatch(user.email)),
        ))
        .orderBy(asc(user.name))
        .limit(20)
      : Promise.resolve([]),
    canViewStudents && permissions.has("students.update")
      ? db.select({
        publicId: studentBehaviorRecords.publicId,
        incidentDate: studentBehaviorRecords.incidentDate,
        category: studentBehaviorRecords.category,
        severity: studentBehaviorRecords.severity,
        details: studentBehaviorRecords.details,
        actionTaken: studentBehaviorRecords.actionTaken,
        studentPublicId: students.publicId,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
      }).from(studentBehaviorRecords)
        .innerJoin(students, and(eq(studentBehaviorRecords.studentId, students.id), eq(students.schoolId, context.schoolId)))
        .where(and(
          eq(studentBehaviorRecords.schoolId, context.schoolId),
          or(
            tokenMatch(students.firstName), tokenMatch(students.lastName),
            tokenMatch(students.admissionNumber), tokenMatch(studentBehaviorRecords.category),
            tokenMatch(studentBehaviorRecords.severity), tokenMatch(studentBehaviorRecords.details),
            tokenMatch(studentBehaviorRecords.actionTaken), like(studentBehaviorRecords.publicId, pattern),
          ),
        ))
        .orderBy(desc(studentBehaviorRecords.incidentDate), desc(studentBehaviorRecords.id))
        .limit(30)
      : Promise.resolve([]),
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
        publicId: feePayments.publicId,
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
    canManageFees
      ? db.select({
        publicId: feeAdvanceTransactions.publicId,
        receiptNumber: feeAdvanceTransactions.receiptNumber,
        reference: feeAdvanceTransactions.reference,
        transactionType: feeAdvanceTransactions.transactionType,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
      }).from(feeAdvanceTransactions)
        .innerJoin(students, and(
          eq(students.id, feeAdvanceTransactions.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .where(and(
          eq(feeAdvanceTransactions.schoolId, context.schoolId),
          eq(feeAdvanceTransactions.transactionType, "received"),
          or(
            tokenMatch(feeAdvanceTransactions.receiptNumber),
            tokenMatch(feeAdvanceTransactions.reference),
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            tokenMatch(students.admissionNumber),
            fuzzyTextMatch(queryTokens, students.firstName, students.lastName, feeAdvanceTransactions.receiptNumber),
          ),
        ))
        .orderBy(asc(feeAdvanceTransactions.createdAt))
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
    canManageStaff
      ? db.select({
        publicId: staffApplications.publicId,
        applicationData: staffApplications.applicationData,
        status: staffApplications.status,
      }).from(staffApplications)
        .where(and(
          eq(staffApplications.schoolId, context.schoolId),
          or(
            tokenMatch(applicationFirstName),
            tokenMatch(applicationLastName),
            tokenMatch(applicationEmployeeCode),
            tokenMatch(applicationJobTitle),
            tokenMatch(applicationDepartment),
            tokenMatch(applicationEmail),
            fuzzyTextMatch(queryTokens,
              applicationFirstName,
              applicationLastName,
              applicationFullName,
              applicationEmployeeCode,
              applicationJobTitle,
              applicationDepartment,
              applicationEmail,
            ),
          ),
        ))
        .orderBy(desc(staffApplications.createdAt))
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
    canManageAcademics
      ? db.select({
        publicId: studentCertificates.publicId,
        certificateNumber: studentCertificates.certificateNumber,
        category: studentCertificates.category,
        title: studentCertificates.title,
        issuedAt: studentCertificates.issuedAt,
        academicYearId: studentCertificates.academicYearId,
        academicYearName: academicYears.name,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
      }).from(studentCertificates)
        .innerJoin(students, and(
          eq(students.id, studentCertificates.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, studentCertificates.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentCertificates.schoolId, context.schoolId),
          or(
            tokenMatch(studentCertificates.certificateNumber),
            tokenMatch(studentCertificates.category),
            tokenMatch(studentCertificates.title),
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            tokenMatch(students.admissionNumber),
            tokenMatch(academicYears.name),
            fuzzyTextMatch(queryTokens,
              studentCertificates.certificateNumber,
              studentCertificates.category,
              studentCertificates.title,
              students.firstName,
              students.lastName,
              students.admissionNumber,
              academicYears.name,
            ),
          ),
        ))
        .orderBy(desc(studentCertificates.issuedAt), desc(studentCertificates.id))
        .limit(20)
      : Promise.resolve([]),
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
        firstName: sql<string | null>`coalesce(${students.firstName}, ${staffMembers.firstName}, ${libraryMembers.memberName})`,
        lastName: sql<string | null>`coalesce(${students.lastName}, ${staffMembers.lastName})`,
        memberName: libraryMembers.memberName,
        memberPhone: libraryMembers.memberPhone,
        memberEmail: libraryMembers.memberEmail,
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
            tokenMatch(libraryMembers.memberName),
            like(sql`lower(${libraryMembers.memberPhone})`, pattern),
            like(sql`lower(${libraryMembers.memberEmail})`, pattern),
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
              libraryMembers.memberName,
              libraryMembers.memberPhone,
              libraryMembers.memberEmail,
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
        borrowerName: sql<string>`coalesce(concat(${students.firstName}, ' ', ${students.lastName}), concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName}), ${libraryMembers.memberName}, 'Unknown member')`,
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
            tokenMatch(libraryMembers.memberName),
            like(sql`lower(${libraryMembers.memberPhone})`, pattern),
            like(sql`lower(${libraryMembers.memberEmail})`, pattern),
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
    permissions.has("school.settings.manage")
      ? db.select({
        id: auditLogs.id,
        actorName: user.name,
        actorEmail: user.email,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourcePublicId: auditLogs.resourcePublicId,
        createdAt: auditLogs.createdAt,
      }).from(auditLogs)
        .innerJoin(user, eq(auditLogs.actorUserId, user.id))
        .where(and(
          eq(auditLogs.schoolId, context.schoolId),
          or(
            tokenMatch(user.name), tokenMatch(user.email), tokenMatch(auditLogs.action),
            tokenMatch(auditLogs.resourceType), tokenMatch(auditLogs.resourcePublicId),
          ),
        ))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(20)
      : Promise.resolve([]),
  ]);

  const [dormitorySearchRows, residentSearchRows] = canManageDormitories
    ? await Promise.all([
      db.select({
        id: dormitories.id,
        name: dormitories.name,
        genderPolicy: dormitories.genderPolicy,
      }).from(dormitories).where(and(
        eq(dormitories.schoolId, context.schoolId),
        eq(dormitories.status, "active"),
        or(
          tokenMatch(dormitories.name),
          tokenMatch(dormitories.description),
          fuzzyTextMatch(queryTokens, dormitories.name, dormitories.description),
        ),
      )).orderBy(asc(dormitories.name)).limit(20),
      db.select({
        id: studentDormitoryAssignments.id,
        studentName: students.firstName,
        studentLastName: students.lastName,
        admissionNumber: students.admissionNumber,
        dormitoryName: dormitories.name,
        roomNumber: dormitoryRooms.roomNumber,
      }).from(studentDormitoryAssignments)
        .innerJoin(students, and(
          eq(students.id, studentDormitoryAssignments.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(dormitoryRooms, and(
          eq(dormitoryRooms.id, studentDormitoryAssignments.roomId),
          eq(dormitoryRooms.schoolId, context.schoolId),
        ))
        .innerJoin(dormitories, and(
          eq(dormitories.id, dormitoryRooms.dormitoryId),
          eq(dormitories.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentDormitoryAssignments.schoolId, context.schoolId),
          eq(studentDormitoryAssignments.status, "active"),
          or(
            tokenMatch(students.firstName),
            tokenMatch(students.lastName),
            tokenMatch(sql`concat(${students.firstName}, ' ', ${students.lastName})`),
            tokenMatch(students.admissionNumber),
            tokenMatch(dormitories.name),
            tokenMatch(dormitoryRooms.roomNumber),
            fuzzyTextMatch(queryTokens, students.firstName, students.lastName, sql`concat(${students.firstName}, ' ', ${students.lastName})`, students.admissionNumber, dormitories.name, dormitoryRooms.roomNumber),
          ),
        )).orderBy(asc(students.lastName), asc(students.firstName)).limit(20),
    ])
    : [[], []] as const;

  const teacherAssignmentRows = permissions.has("results.enter")
    ? await db.select({
      sectionId: classSections.id,
      classSubjectId: classSubjects.id,
      className: classLevels.name,
      sectionName: classSections.name,
      subjectName: subjects.name,
      subjectCode: subjects.code,
      yearName: academicYears.name,
    }).from(classSubjects)
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
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSubjects.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
        eq(classLevels.status, "active"),
      ))
      .innerJoin(subjects, and(
        eq(subjects.id, classSubjects.subjectId),
        eq(subjects.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(classSections.classLevelId, classLevels.id),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, classSections.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
        eq(academicYears.status, "active"),
      ))
      .where(and(
        eq(classSubjects.schoolId, context.schoolId),
        or(
          tokenMatch(classLevels.name),
          tokenMatch(classSections.name),
          tokenMatch(subjects.name),
          tokenMatch(subjects.code),
          tokenMatch(academicYears.name),
          fuzzyTextMatch(queryTokens, classLevels.name, classSections.name, subjects.name, subjects.code, academicYears.name),
        ),
      ))
      .groupBy(
        classSections.id,
        classSubjects.id,
        classLevels.name,
        classSections.name,
        subjects.name,
        subjects.code,
        academicYears.name,
      )
      .orderBy(asc(classLevels.name), asc(classSections.name), asc(subjects.name))
      .limit(30)
    : [];

  for (const account of userRows) {
    results.push({
      id: `user-${account.email}`,
      title: account.name,
      description: `School user · ${account.email}`,
      href: `/admin/users?search=${encodeURIComponent(account.email)}`,
      category: "Users",
      searchTerms: [account.email],
    });
  }
  for (const log of auditLogRows) {
    results.push({
      id: `user-log-${log.id}`,
      title: `${log.action.replaceAll("_", " ").replaceAll(".", " · ")} · ${log.actorName}`,
      description: `${log.resourceType.replaceAll("_", " ")} · ${log.resourcePublicId} · ${log.createdAt.toISOString()}`,
      href: `/admin/system/user-logs?search=${encodeURIComponent(query)}`,
      category: "Users",
      searchTerms: [log.actorName, log.actorEmail, log.action, log.resourceType, log.resourcePublicId],
    });
  }
  for (const student of studentRows) {
    results.push({
      id: `student-${student.publicId}`,
      title: `${student.firstName} ${student.lastName}`,
      description: student.admissionNumber ? `Student · Admission no. ${student.admissionNumber}` : "Student profile",
      href: `/admin/students?profile=${encodeURIComponent(student.publicId)}`,
      category: "Students",
    });
  }
  for (const student of studentRows) {
    results.push(studentIdWorkspaceResult(student));
  }
  for (const record of behaviorRows) {
    const studentName = `${record.firstName} ${record.lastName}`;
    results.push({
      id: `student-behavior-${record.publicId}`,
      title: `Student behaviour record · ${studentName}`,
      description: `${record.category.replaceAll("_", " ")} · ${record.severity} · ${record.incidentDate} · ${record.admissionNumber ?? "Student"}`,
      href: `/admin/students/behavior?search=${encodeURIComponent(query)}`,
      category: "Students",
      searchTerms: [studentName, record.admissionNumber ?? "", record.category, record.severity, record.details, record.actionTaken],
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
    results.push(feePaymentWorkspaceResult({
      publicId: payment.publicId,
      receiptNumber: payment.receiptNumber,
      studentName: `${payment.studentName} ${payment.studentLastName}`,
      invoiceNumber: payment.invoiceNumber,
    }));
  }
  for (const advance of advanceRows) {
    results.push({
      id: `fee-advance-${advance.publicId}`,
      title: advance.receiptNumber ?? "Advance fee payment",
      description: `Carry-forward fee credit · ${advance.firstName} ${advance.lastName} · ${advance.admissionNumber ?? "No admission number"}`,
      href: `/admin/fees/collection/carry-forward/receipt/${advance.publicId}`,
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
  for (const application of staffApplicationRows) {
    const data = application.applicationData;
    const applicantName = [data.firstName, data.lastName].filter(Boolean).join(" ");
    results.push({
      id: `staff-application-${application.publicId}`,
      title: applicantName || "Staff applicant",
      description: `Staff application · ${data.jobTitle || data.personnelRole || "Position not specified"} · ${application.status}`,
      href: `/admin/staff/applications?search=${encodeURIComponent(applicantName || query)}`,
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
  for (const assignment of teacherAssignmentRows) {
    results.push({
      id: `teacher-assignment-${assignment.sectionId}-${assignment.classSubjectId}`,
      title: `${assignment.className} · ${assignment.sectionName} · ${assignment.subjectName}`,
      description: `Teaching assignment · ${assignment.yearName} · ${assignment.subjectCode}`,
      href: `/portal/teacher?section=classes&q=${encodeURIComponent(query)}`,
      category: "Academics",
      searchTerms: [assignment.subjectCode, assignment.yearName],
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
  for (const certificate of certificateRows) {
    results.push(studentCertificateWorkspaceResult(certificate));
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
        : member.firstName ?? member.memberNumber,
      description: [
        member.memberType === "staff" ? "Staff library member" : member.memberType === "other" ? "Other library member" : "Student library member",
        `Member ${member.memberNumber}`,
        member.admissionNumber ? `Admission ${member.admissionNumber}` : null,
        member.employeeCode ? `Employee ${member.employeeCode}` : null,
        member.memberPhone,
        member.memberEmail,
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
  for (const dormitory of dormitorySearchRows) {
    results.push({
      id: `dormitory-${dormitory.id}`,
      title: dormitory.name,
      description: `Dormitory · ${dormitory.genderPolicy} residents`,
      href: "/admin/dormitories",
      category: "Dormitories",
    });
  }
  for (const resident of residentSearchRows) {
    results.push({
      id: `dormitory-resident-${resident.id}`,
      title: `${resident.studentName} ${resident.studentLastName}`,
      description: [
        "Dormitory resident",
        resident.admissionNumber,
        resident.dormitoryName,
        `Room ${resident.roomNumber}`,
      ].filter(Boolean).join(" · "),
      href: "/admin/dormitories",
      category: "Dormitories",
    });
  }

  return rankWorkspaceSearchResults(query, results, 20);
}
