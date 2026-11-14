import {
  bigint,
  boolean,
  date,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const id = () => bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey();
const createdAt = () => timestamp("createdAt").notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt").notNull().defaultNow().onUpdateNow();

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: varchar("image", { length: 2048 }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    expiresAt: timestamp("expiresAt").notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: varchar("ipAddress", { length: 255 }),
    userAgent: varchar("userAgent", { length: 1000 }),
    userId: varchar("userId", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = mysqlTable(
  "account",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accountId: varchar("accountId", { length: 255 }).notNull(),
    providerId: varchar("providerId", { length: 100 }).notNull(),
    userId: varchar("userId", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: varchar("accessToken", { length: 4096 }),
    refreshToken: varchar("refreshToken", { length: 4096 }),
    idToken: varchar("idToken", { length: 4096 }),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    scope: varchar("scope", { length: 2000 }),
    password: varchar("password", { length: 255 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = mysqlTable(
  "verification",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: varchar("value", { length: 2048 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = mysqlTable("rateLimit", {
  id: varchar("id", { length: 36 }).primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  count: int("count").notNull(),
  lastRequest: bigint("lastRequest", { mode: "number" }).notNull(),
});

export const schools = mysqlTable("schools", {
  id: id(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  address: varchar("address", { length: 1000 }),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const schoolMemberships = mysqlTable(
  "school_memberships",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    userId: varchar("userId", { length: 36 })
      .notNull()
      .references(() => user.id),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("school_memberships_school_user_uq").on(table.schoolId, table.userId),
    index("school_memberships_user_status_idx").on(table.userId, table.status),
  ],
);

export const roles = mysqlTable(
  "roles",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 255 }),
    isSystem: boolean("isSystem").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("roles_school_name_uq").on(table.schoolId, table.name)],
);

export const permissions = mysqlTable(
  "permissions",
  {
    id: id(),
    key: varchar("key", { length: 120 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
  },
  (table) => [uniqueIndex("permissions_key_uq").on(table.key)],
);

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: bigint("roleId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => roles.id),
    permissionId: bigint("permissionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [uniqueIndex("role_permissions_role_permission_uq").on(table.roleId, table.permissionId)],
);

export const userRoles = mysqlTable(
  "user_roles",
  {
    membershipId: bigint("membershipId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schoolMemberships.id),
    roleId: bigint("roleId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => roles.id),
  },
  (table) => [uniqueIndex("user_roles_membership_role_uq").on(table.membershipId, table.roleId)],
);

export const schoolBranches = mysqlTable(
  "school_branches",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 30 }).notNull(),
    contactNumber: varchar("contactNumber", { length: 40 }),
    email: varchar("email", { length: 320 }),
    address: varchar("address", { length: 1000 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("school_branches_school_code_uq").on(table.schoolId, table.code),
    uniqueIndex("school_branches_school_name_uq").on(table.schoolId, table.name),
    index("school_branches_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const studentCategories = mysqlTable(
  "student_categories",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schoolBranches.id),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_categories_school_branch_name_uq").on(
      table.schoolId,
      table.branchId,
      table.name,
    ),
    index("student_categories_school_branch_idx").on(table.schoolId, table.branchId),
  ],
);

export type StudentAdditionalDetails = {
  caste: string;
  heightInches: string;
  weightKg: string;
  nationalIdNumber: string;
  birthCertificateNumber: string;
  additionalNotes: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  profilePhoto: { fileName: string; objectKey: string } | null;
  documents: { title: string; fileName: string; objectKey: string }[];
  previousSchoolDetails: string;
  transportRoute: string;
  vehicleNumber: string;
  dormitoryName: string;
  dormitoryRoom: string;
  customFieldName: string;
  customFieldValue: string;
};

export const students = mysqlTable(
  "students",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(
      () => schoolBranches.id,
    ),
    categoryId: bigint("categoryId", { mode: "number", unsigned: true }).references(
      () => studentCategories.id,
    ),
    admissionNumber: varchar("admissionNumber", { length: 40 }),
    dateOfBirth: date("dateOfBirth", { mode: "string" }),
    admissionDate: date("admissionDate", { mode: "string" }),
    religion: varchar("religion", { length: 100 }),
    bloodGroup: varchar("bloodGroup", { length: 3 }),
    currentAddress: varchar("currentAddress", { length: 1000 }),
    permanentAddress: varchar("permanentAddress", { length: 1000 }),
    fatherName: varchar("fatherName", { length: 160 }),
    fatherOccupation: varchar("fatherOccupation", { length: 120 }),
    fatherPhone: varchar("fatherPhone", { length: 40 }),
    motherName: varchar("motherName", { length: 160 }),
    motherOccupation: varchar("motherOccupation", { length: 120 }),
    motherPhone: varchar("motherPhone", { length: 40 }),
    guardianName: varchar("guardianName", { length: 160 }),
    guardianRelation: varchar("guardianRelation", { length: 80 }),
    guardianEmail: varchar("guardianEmail", { length: 320 }),
    guardianPhone: varchar("guardianPhone", { length: 40 }),
    guardianOccupation: varchar("guardianOccupation", { length: 120 }),
    guardianAddress: varchar("guardianAddress", { length: 1000 }),
    additionalDetails: json("additionalDetails").$type<StudentAdditionalDetails>(),
    firstName: varchar("firstName", { length: 120 }).notNull(),
    lastName: varchar("lastName", { length: 120 }).notNull(),
    gender: varchar("gender", { length: 30 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("students_school_admission_number_uq").on(table.schoolId, table.admissionNumber),
    index("students_school_status_idx").on(table.schoolId, table.status),
    index("students_school_created_idx").on(table.schoolId, table.createdAt),
    index("students_school_category_idx").on(table.schoolId, table.categoryId),
  ],
);

export const studentGroups = mysqlTable(
  "student_groups",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 1000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_groups_school_name_uq").on(table.schoolId, table.name),
    index("student_groups_school_created_idx").on(table.schoolId, table.createdAt),
  ],
);

export const studentGroupMemberships = mysqlTable(
  "student_group_memberships",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    groupId: bigint("groupId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => studentGroups.id, { onDelete: "cascade" }),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("student_group_memberships_group_student_uq").on(table.groupId, table.studentId),
    index("student_group_memberships_school_student_idx").on(table.schoolId, table.studentId),
  ],
);

export const academicYears = mysqlTable(
  "academic_years",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("planned"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("academic_years_school_name_uq").on(table.schoolId, table.name),
    index("academic_years_school_dates_idx").on(table.schoolId, table.startDate, table.endDate),
  ],
);

export const academicTerms = mysqlTable(
  "academic_terms",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    academicYearId: bigint("academicYearId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => academicYears.id),
    name: varchar("name", { length: 120 }).notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    examStartDate: date("examStartDate", { mode: "string" }),
    examEndDate: date("examEndDate", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("academic_terms_year_name_uq").on(table.schoolId, table.academicYearId, table.name),
    index("academic_terms_school_dates_idx").on(table.schoolId, table.startDate, table.endDate),
  ],
);

export const academicHolidays = mysqlTable(
  "academic_holidays",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    academicYearId: bigint("academicYearId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => academicYears.id),
    academicTermId: bigint("academicTermId", { mode: "number", unsigned: true })
      .references(() => academicTerms.id),
    name: varchar("name", { length: 120 }).notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("academic_holidays_year_name_start_uq").on(
      table.schoolId,
      table.academicYearId,
      table.name,
      table.startDate,
    ),
    index("academic_holidays_school_year_dates_idx").on(
      table.schoolId,
      table.academicYearId,
      table.startDate,
      table.endDate,
    ),
  ],
);

export const classLevels = mysqlTable(
  "class_levels",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schoolBranches.id),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 30 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("class_levels_branch_code_uq").on(table.schoolId, table.branchId, table.code),
    index("class_levels_school_name_idx").on(table.schoolId, table.name),
  ],
);

export const subjects = mysqlTable(
  "subjects",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schoolBranches.id),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 20 }).notNull(),
    subjectType: varchar("subjectType", { length: 20 }).notNull().default("theory"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subjects_branch_code_uq").on(table.schoolId, table.branchId, table.code),
    index("subjects_school_name_idx").on(table.schoolId, table.name),
  ],
);

export const teachers = mysqlTable(
  "teachers",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schoolBranches.id),
    staffMemberId: bigint("staffMemberId", { mode: "number", unsigned: true }).references(
      () => staffMembers.id,
      { onDelete: "set null" },
    ),
    firstName: varchar("firstName", { length: 120 }).notNull(),
    lastName: varchar("lastName", { length: 120 }).notNull(),
    employeeCode: varchar("employeeCode", { length: 40 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("teachers_staff_member_uq").on(table.staffMemberId),
    uniqueIndex("teachers_school_employee_code_uq").on(table.schoolId, table.employeeCode),
    uniqueIndex("teachers_school_email_uq").on(table.schoolId, table.email),
    index("teachers_school_status_name_idx").on(
      table.schoolId,
      table.status,
      table.lastName,
      table.firstName,
    ),
  ],
);

export const classRooms = mysqlTable(
  "class_rooms",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schoolBranches.id),
    roomNumber: varchar("roomNumber", { length: 80 }).notNull(),
    capacity: int("capacity", { unsigned: true }).notNull(),
    location: varchar("location", { length: 255 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("class_rooms_branch_room_uq").on(table.schoolId, table.branchId, table.roomNumber),
    index("class_rooms_school_branch_idx").on(table.schoolId, table.branchId),
  ],
);

export type StaffStoredFile = { fileName: string; objectKey: string };
export type StaffDocuments = {
  profilePhoto: StaffStoredFile | null;
  resume: StaffStoredFile | null;
  joiningLetter: StaffStoredFile | null;
  otherDocument: StaffStoredFile | null;
};
export type StaffCustomField = { label: string; value: string };

export const staffMembers = mysqlTable(
  "staff_members",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(
      () => schoolBranches.id,
    ),
    firstName: varchar("firstName", { length: 120 }).notNull(),
    lastName: varchar("lastName", { length: 120 }).notNull(),
    employeeCode: varchar("employeeCode", { length: 40 }),
    personnelRole: varchar("personnelRole", { length: 40 }),
    jobTitle: varchar("jobTitle", { length: 120 }).notNull(),
    department: varchar("department", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    dateOfBirth: date("dateOfBirth", { mode: "string" }),
    fatherName: varchar("fatherName", { length: 160 }),
    motherName: varchar("motherName", { length: 160 }),
    gender: varchar("gender", { length: 20 }),
    maritalStatus: varchar("maritalStatus", { length: 20 }),
    address: varchar("address", { length: 1000 }),
    permanentAddress: varchar("permanentAddress", { length: 1000 }),
    emergencyContactName: varchar("emergencyContactName", { length: 160 }),
    emergencyContactPhone: varchar("emergencyContactPhone", { length: 40 }),
    drivingLicense: varchar("drivingLicense", { length: 80 }),
    showAsExpert: boolean("showAsExpert").notNull().default(false),
    qualification: varchar("qualification", { length: 2000 }),
    experience: varchar("experience", { length: 2000 }),
    epfNumber: varchar("epfNumber", { length: 80 }),
    basicSalary: decimal("basicSalary", { precision: 12, scale: 2 }),
    contractType: varchar("contractType", { length: 20 }),
    location: varchar("location", { length: 255 }),
    bankAccountName: varchar("bankAccountName", { length: 160 }),
    bankAccountNumber: varchar("bankAccountNumber", { length: 80 }),
    bankName: varchar("bankName", { length: 160 }),
    bankBranch: varchar("bankBranch", { length: 160 }),
    facebookUrl: varchar("facebookUrl", { length: 2048 }),
    twitterUrl: varchar("twitterUrl", { length: 2048 }),
    linkedinUrl: varchar("linkedinUrl", { length: 2048 }),
    instagramUrl: varchar("instagramUrl", { length: 2048 }),
    documents: json("documents").$type<StaffDocuments>(),
    customFields: json("customFields").$type<StaffCustomField[]>(),
    linkedUserId: varchar("linkedUserId", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    employmentType: varchar("employmentType", { length: 20 }).notNull().default("full_time"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    startDate: date("startDate", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staff_members_school_code_uq").on(table.schoolId, table.employeeCode),
    uniqueIndex("staff_members_school_email_uq").on(table.schoolId, table.email),
    uniqueIndex("staff_members_school_user_uq").on(table.schoolId, table.linkedUserId),
    index("staff_members_school_status_name_idx").on(
      table.schoolId,
      table.status,
      table.lastName,
      table.firstName,
    ),
    index("staff_members_school_department_idx").on(table.schoolId, table.department),
  ],
);

export const staffDepartments = mysqlTable(
  "staff_departments",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(
      () => schoolBranches.id,
    ),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staff_departments_school_branch_name_uq").on(
      table.schoolId,
      table.branchId,
      table.name,
    ),
    index("staff_departments_school_idx").on(table.schoolId),
  ],
);

export const staffDesignations = mysqlTable(
  "staff_designations",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(
      () => schoolBranches.id,
    ),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staff_designations_school_branch_name_uq").on(
      table.schoolId,
      table.branchId,
      table.name,
    ),
    index("staff_designations_school_idx").on(table.schoolId),
  ],
);

export const staffAttendance = mysqlTable(
  "staff_attendance",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    staffId: bigint("staffId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => staffMembers.id),
    attendanceDate: date("attendanceDate", { mode: "string" }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    note: varchar("note", { length: 500 }),
    recordedBy: varchar("recordedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staff_attendance_school_staff_date_uq").on(
      table.schoolId,
      table.staffId,
      table.attendanceDate,
    ),
    index("staff_attendance_school_date_status_idx").on(
      table.schoolId,
      table.attendanceDate,
      table.status,
    ),
  ],
);

export const staffLeaveTypes = mysqlTable(
  "staff_leave_types",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(
      () => schoolBranches.id,
    ),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staff_leave_types_school_branch_name_uq").on(
      table.schoolId,
      table.branchId,
      table.name,
    ),
    index("staff_leave_types_school_idx").on(table.schoolId),
  ],
);

export const staffLeaveBalances = mysqlTable(
  "staff_leave_balances",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    staffId: bigint("staffId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => staffMembers.id),
    leaveTypeId: bigint("leaveTypeId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => staffLeaveTypes.id),
    leaveYear: int("leaveYear", { unsigned: true }).notNull(),
    entitlementDays: decimal("entitlementDays", { precision: 6, scale: 2 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staff_leave_balances_school_staff_type_uq").on(
      table.schoolId,
      table.staffId,
      table.leaveTypeId,
      table.leaveYear,
    ),
    index("staff_leave_balances_school_type_idx").on(table.schoolId, table.leaveTypeId),
  ],
);

export const staffLeaveRequests = mysqlTable(
  "staff_leave_requests",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    staffId: bigint("staffId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => staffMembers.id),
    leaveTypeId: bigint("leaveTypeId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => staffLeaveTypes.id),
    leaveYear: int("leaveYear", { unsigned: true }).notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    requestedDays: int("requestedDays", { unsigned: true }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewNote: varchar("reviewNote", { length: 500 }),
    reviewedBy: varchar("reviewedBy", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewedAt"),
    createdBy: varchar("createdBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("staff_leave_requests_school_status_dates_idx").on(
      table.schoolId,
      table.status,
      table.startDate,
      table.endDate,
    ),
    index("staff_leave_requests_school_staff_idx").on(table.schoolId, table.staffId),
  ],
);

export const staffPayrollRecords = mysqlTable(
  "staff_payroll_records",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    staffId: bigint("staffId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => staffMembers.id),
    payPeriod: varchar("payPeriod", { length: 7 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    paidDate: date("paidDate", { mode: "string" }),
    status: varchar("status", { length: 20 }).notNull().default("recorded"),
    notes: varchar("notes", { length: 1000 }),
    recordedBy: varchar("recordedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staff_payroll_school_staff_period_uq").on(
      table.schoolId,
      table.staffId,
      table.payPeriod,
    ),
    index("staff_payroll_school_period_status_idx").on(
      table.schoolId,
      table.payPeriod,
      table.status,
    ),
  ],
);

export const classSubjects = mysqlTable(
  "class_subjects",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    classLevelId: bigint("classLevelId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classLevels.id),
    subjectId: bigint("subjectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => subjects.id),
    teacherId: bigint("teacherId", { mode: "number", unsigned: true }).references(
      () => teachers.id,
    ),
    isCompulsory: boolean("isCompulsory").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("class_subjects_school_class_subject_uq").on(
      table.schoolId,
      table.classLevelId,
      table.subjectId,
    ),
    index("class_subjects_school_class_idx").on(table.schoolId, table.classLevelId),
  ],
);

export const classSections = mysqlTable(
  "class_sections",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    academicYearId: bigint("academicYearId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => academicYears.id),
    classLevelId: bigint("classLevelId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classLevels.id),
    name: varchar("name", { length: 80 }).notNull(),
    capacity: int("capacity", { unsigned: true }),
    classTeacherId: bigint("classTeacherId", { mode: "number", unsigned: true }).references(
      () => teachers.id,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("class_sections_year_level_name_uq").on(
      table.schoolId,
      table.academicYearId,
      table.classLevelId,
      table.name,
    ),
    index("class_sections_school_year_idx").on(table.schoolId, table.academicYearId),
  ],
);

export const classRoutines = mysqlTable(
  "class_routines",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    classSectionId: bigint("classSectionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classSections.id),
    classSubjectId: bigint("classSubjectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classSubjects.id),
    classRoomId: bigint("classRoomId", { mode: "number", unsigned: true }).references(
      () => classRooms.id,
    ),
    dayOfWeek: int("dayOfWeek", { unsigned: true }).notNull(),
    startsAt: varchar("startsAt", { length: 5 }).notNull(),
    endsAt: varchar("endsAt", { length: 5 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("class_routines_school_section_day_idx").on(
      table.schoolId,
      table.classSectionId,
      table.dayOfWeek,
    ),
    index("class_routines_school_room_day_idx").on(
      table.schoolId,
      table.classRoomId,
      table.dayOfWeek,
    ),
  ],
);

export const studentEnrollments = mysqlTable(
  "student_enrollments",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id),
    academicYearId: bigint("academicYearId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => academicYears.id),
    classSectionId: bigint("classSectionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classSections.id),
    rollNumber: varchar("rollNumber", { length: 40 }),
    status: varchar("status", { length: 20 }).notNull().default("enrolled"),
    enrolledAt: date("enrolledAt", { mode: "string" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_enrollments_school_student_year_section_uq").on(
      table.schoolId,
      table.studentId,
      table.academicYearId,
      table.classSectionId,
    ),
    index("student_enrollments_school_section_status_idx").on(
      table.schoolId,
      table.classSectionId,
      table.status,
    ),
    index("student_enrollments_school_year_status_idx").on(
      table.schoolId,
      table.academicYearId,
      table.status,
    ),
  ],
);

export const studentAcademicEvents = mysqlTable(
  "student_academic_events",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id),
    fromEnrollmentId: bigint("fromEnrollmentId", { mode: "number", unsigned: true }),
    toEnrollmentId: bigint("toEnrollmentId", { mode: "number", unsigned: true }).references(
      () => studentEnrollments.id,
    ),
    fromClassSectionId: bigint("fromClassSectionId", { mode: "number", unsigned: true }).references(
      () => classSections.id,
    ),
    toClassSectionId: bigint("toClassSectionId", { mode: "number", unsigned: true }).references(
      () => classSections.id,
    ),
    eventType: varchar("eventType", { length: 30 }).notNull(),
    eventDate: date("eventDate", { mode: "string" }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    externalInstitution: varchar("externalInstitution", { length: 255 }),
    createdBy: varchar("createdBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "student_academic_events_from_enrollment_fk",
      columns: [table.fromEnrollmentId],
      foreignColumns: [studentEnrollments.id],
    }),
    index("student_academic_events_school_student_date_idx").on(
      table.schoolId,
      table.studentId,
      table.eventDate,
    ),
    index("student_academic_events_from_enrollment_idx").on(table.fromEnrollmentId),
    index("student_academic_events_to_enrollment_idx").on(table.toEnrollmentId),
  ],
);

export const studentAttendance = mysqlTable(
  "student_attendance",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id),
    enrollmentId: bigint("enrollmentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => studentEnrollments.id),
    classSectionId: bigint("classSectionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classSections.id),
    attendanceDate: date("attendanceDate", { mode: "string" }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    note: varchar("note", { length: 500 }),
    recordedBy: varchar("recordedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_attendance_school_student_date_uq").on(
      table.schoolId,
      table.studentId,
      table.attendanceDate,
    ),
    index("student_attendance_school_section_date_idx").on(
      table.schoolId,
      table.classSectionId,
      table.attendanceDate,
    ),
  ],
);

export const feeGroups = mysqlTable(
  "fee_groups",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 1000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("fee_groups_school_name_uq").on(table.schoolId, table.name),
    index("fee_groups_school_idx").on(table.schoolId),
  ],
);

export const feeTypes = mysqlTable(
  "fee_types",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    feeGroupId: bigint("feeGroupId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => feeGroups.id),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 1000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("fee_types_school_name_uq").on(table.schoolId, table.name),
    index("fee_types_school_group_idx").on(table.schoolId, table.feeGroupId),
  ],
);

export const feeDiscounts = mysqlTable(
  "fee_discounts",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    description: varchar("description", { length: 1000 }),
    discountType: varchar("discountType", { length: 20 }).notNull(),
    value: decimal("value", { precision: 10, scale: 2 }).notNull(),
    frequency: varchar("frequency", { length: 20 }).notNull().default("yearly"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("fee_discounts_school_name_uq").on(table.schoolId, table.name),
    uniqueIndex("fee_discounts_school_code_uq").on(table.schoolId, table.code),
    index("fee_discounts_school_idx").on(table.schoolId),
  ],
);

export const studentFeeDiscounts = mysqlTable(
  "student_fee_discounts",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id),
    feeTypeId: bigint("feeTypeId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => feeTypes.id),
    discountId: bigint("discountId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => feeDiscounts.id),
    note: varchar("note", { length: 500 }),
    assignedBy: varchar("assignedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_fee_discounts_school_student_type_uq").on(
      table.schoolId,
      table.studentId,
      table.feeTypeId,
    ),
    index("student_fee_discounts_school_discount_idx").on(table.schoolId, table.discountId),
  ],
);

export const feeStructures = mysqlTable(
  "fee_structures",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schoolBranches.id),
    academicYearId: bigint("academicYearId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => academicYears.id),
    academicTermId: bigint("academicTermId", { mode: "number", unsigned: true }).references(
      () => academicTerms.id,
    ),
    classLevelId: bigint("classLevelId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classLevels.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .references(() => students.id),
    feeGroupId: bigint("feeGroupId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => feeGroups.id),
    feeTypeId: bigint("feeTypeId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => feeTypes.id),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    dueDate: date("dueDate", { mode: "string" }).notNull(),
    fineType: varchar("fineType", { length: 20 }).notNull().default("none"),
    fineValue: decimal("fineValue", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("fee_structures_school_year_class_group_type_term_uq").on(
      table.schoolId,
      table.academicYearId,
      table.classLevelId,
      table.feeGroupId,
      table.feeTypeId,
      table.academicTermId,
      table.studentId,
    ),
    index("fee_structures_school_branch_year_idx").on(
      table.schoolId,
      table.branchId,
      table.academicYearId,
    ),
    index("fee_structures_school_term_idx").on(table.schoolId, table.academicTermId),
  ],
);

export const studentFeeInvoices = mysqlTable(
  "student_fee_invoices",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    invoiceNumber: varchar("invoiceNumber", { length: 40 }).notNull(),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id),
    enrollmentId: bigint("enrollmentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => studentEnrollments.id),
    feeStructureId: bigint("feeStructureId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => feeStructures.id),
    discountId: bigint("discountId", { mode: "number", unsigned: true })
      .references(() => feeDiscounts.id),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }).notNull().default("0"),
    fineType: varchar("fineType", { length: 20 }).notNull().default("none"),
    fineValue: decimal("fineValue", { precision: 10, scale: 2 }).notNull().default("0"),
    dueDate: date("dueDate", { mode: "string" }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("unpaid"),
    generatedBy: varchar("generatedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_fee_invoices_school_enrollment_structure_uq").on(
      table.schoolId,
      table.enrollmentId,
      table.feeStructureId,
    ),
    uniqueIndex("student_fee_invoices_school_number_uq").on(table.schoolId, table.invoiceNumber),
    index("student_fee_invoices_school_status_due_idx").on(
      table.schoolId,
      table.status,
      table.dueDate,
    ),
    index("student_fee_invoices_school_student_idx").on(table.schoolId, table.studentId),
  ],
);

export const feePayments = mysqlTable(
  "fee_payments",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    invoiceId: bigint("invoiceId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => studentFeeInvoices.id),
    receiptNumber: varchar("receiptNumber", { length: 40 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    fineAmount: decimal("fineAmount", { precision: 12, scale: 2 }).notNull().default("0"),
    reversedAmount: decimal("reversedAmount", { precision: 12, scale: 2 }).notNull().default("0"),
    paymentMethod: varchar("paymentMethod", { length: 30 }).notNull(),
    reference: varchar("reference", { length: 120 }),
    notes: varchar("notes", { length: 500 }),
    paidAt: timestamp("paidAt").notNull().defaultNow(),
    recordedBy: varchar("recordedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("fee_payments_school_receipt_uq").on(table.schoolId, table.receiptNumber),
    uniqueIndex("fee_payments_school_idempotency_uq").on(table.schoolId, table.idempotencyKey),
    index("fee_payments_school_paid_at_idx").on(table.schoolId, table.paidAt),
    index("fee_payments_school_invoice_idx").on(table.schoolId, table.invoiceId),
  ],
);

export const feePaymentReversals = mysqlTable(
  "fee_payment_reversals",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    paymentId: bigint("paymentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => feePayments.id),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    fineAmount: decimal("fineAmount", { precision: 12, scale: 2 }).notNull().default("0"),
    reversalType: varchar("reversalType", { length: 20 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    reference: varchar("reference", { length: 120 }),
    idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull(),
    recordedBy: varchar("recordedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("fee_payment_reversals_school_idempotency_uq").on(table.schoolId, table.idempotencyKey),
    index("fee_payment_reversals_school_payment_idx").on(table.schoolId, table.paymentId),
  ],
);

export const uploadedFiles = mysqlTable(
  "uploaded_files",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    uploadedBy: varchar("uploadedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    storageKey: varchar("storageKey", { length: 700 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    contentType: varchar("contentType", { length: 150 }).notNull(),
    byteSize: int("byteSize", { unsigned: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uploaded_files_storage_key_uq").on(table.storageKey),
    index("uploaded_files_school_created_idx").on(table.schoolId, table.createdAt),
  ],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    actorUserId: varchar("actorUserId", { length: 36 })
      .notNull()
      .references(() => user.id),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resourceType", { length: 100 }).notNull(),
    resourcePublicId: varchar("resourcePublicId", { length: 36 }).notNull(),
    changedFields: json("changedFields").$type<string[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_school_created_idx").on(table.schoolId, table.createdAt),
    index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
  ],
);
