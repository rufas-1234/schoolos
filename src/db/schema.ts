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
  logoUrl: varchar("logoUrl", { length: 2048 }),
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

export const userLoginIdentifiers = mysqlTable(
  "user_login_identifiers",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    userId: varchar("userId", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    identifier: varchar("identifier", { length: 320 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_login_identifiers_school_identifier_uq").on(table.schoolId, table.identifier),
    index("user_login_identifiers_user_idx").on(table.userId, table.schoolId),
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

export type StudentFieldSetting = {
  enabled: boolean;
  required: boolean;
};

export type StudentFieldSettings = Record<string, StudentFieldSetting>;

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

export const studentBehaviorRecords = mysqlTable(
  "student_behavior_records",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    incidentDate: date("incidentDate", { mode: "string" }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    details: varchar("details", { length: 3000 }).notNull(),
    actionTaken: varchar("actionTaken", { length: 40 }).notNull(),
    followUpDate: date("followUpDate", { mode: "string" }),
    recordedBy: varchar("recordedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("student_behavior_records_school_student_date_idx").on(table.schoolId, table.studentId, table.incidentDate),
    index("student_behavior_records_school_category_date_idx").on(table.schoolId, table.category, table.incidentDate),
    index("student_behavior_records_school_severity_date_idx").on(table.schoolId, table.severity, table.incidentDate),
  ],
);

export const dormitories = mysqlTable(
  "dormitories",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(() => schoolBranches.id),
    name: varchar("name", { length: 120 }).notNull(),
    genderPolicy: varchar("genderPolicy", { length: 20 }).notNull().default("mixed"),
    description: varchar("description", { length: 1000 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("dormitories_school_name_uq").on(table.schoolId, table.name),
    index("dormitories_school_branch_status_idx").on(table.schoolId, table.branchId, table.status),
  ],
);

export const dormitoryRooms = mysqlTable(
  "dormitory_rooms",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    dormitoryId: bigint("dormitoryId", { mode: "number", unsigned: true }).notNull().references(() => dormitories.id),
    roomNumber: varchar("roomNumber", { length: 40 }).notNull(),
    capacity: int("capacity", { unsigned: true }).notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("dormitory_rooms_dorm_room_uq").on(table.dormitoryId, table.roomNumber),
    index("dormitory_rooms_school_dorm_status_idx").on(table.schoolId, table.dormitoryId, table.status),
  ],
);

export const studentDormitoryAssignments = mysqlTable(
  "student_dormitory_assignments",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true }).notNull().references(() => students.id),
    roomId: bigint("roomId", { mode: "number", unsigned: true }).notNull().references(() => dormitoryRooms.id),
    assignedAt: date("assignedAt", { mode: "string" }).notNull(),
    leftAt: date("leftAt", { mode: "string" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    assignedBy: varchar("assignedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("student_dormitory_assignments_school_student_status_idx").on(table.schoolId, table.studentId, table.status),
    index("student_dormitory_assignments_school_room_status_idx").on(table.schoolId, table.roomId, table.status),
  ],
);

export const userStudentLinks = mysqlTable(
  "user_student_links",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    userId: varchar("userId", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    accessType: varchar("accessType", { length: 20 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_student_links_user_student_type_uq").on(table.userId, table.studentId, table.accessType),
    index("user_student_links_school_user_type_idx").on(table.schoolId, table.userId, table.accessType),
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

export const staffSettings = mysqlTable(
  "staff_settings",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    requiredFields: json("requiredFields").$type<string[]>().notNull(),
    visibleFields: json("visibleFields").$type<string[]>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("staff_settings_school_uq").on(table.schoolId)],
);

export const staffApplications = mysqlTable(
  "staff_applications",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    applicationData: json("applicationData").$type<Record<string, string>>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewedBy: varchar("reviewedBy", { length: 36 }).references(() => user.id),
    reviewedAt: timestamp("reviewedAt"),
    staffMemberId: bigint("staffMemberId", { mode: "number", unsigned: true })
      .references(() => staffMembers.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("staff_applications_school_status_created_idx").on(
      table.schoolId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("staff_applications_school_staff_uq").on(table.schoolId, table.staffMemberId),
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
    baseSalary: decimal("baseSalary", { precision: 12, scale: 2 }).notNull().default("0.00"),
    allowances: decimal("allowances", { precision: 12, scale: 2 }).notNull().default("0.00"),
    deductions: decimal("deductions", { precision: 12, scale: 2 }).notNull().default("0.00"),
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

export const studentSettings = mysqlTable(
  "student_settings",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    admissionFormat: varchar("admissionFormat", { length: 40 }).notNull().default("S{YY}{SEQ:4}"),
    rollFormat: varchar("rollFormat", { length: 40 }).notNull().default("{SEQ:3}"),
    nextAdmissionSequence: int("nextAdmissionSequence", { unsigned: true }).notNull().default(1),
    nextRollSequence: int("nextRollSequence", { unsigned: true }).notNull().default(1),
    fields: json("fields").$type<StudentFieldSettings>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_settings_school_uq").on(table.schoolId),
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

export const examGradingScales = mysqlTable(
  "exam_grading_scales",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    allowRanking: boolean("allowRanking").notNull().default(false),
    isDefault: boolean("isDefault").notNull().default(false),
    createdBy: varchar("createdBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_grading_scales_school_name_uq").on(table.schoolId, table.name),
    index("exam_grading_scales_school_default_idx").on(table.schoolId, table.isDefault),
  ],
);

export const examTypes = mysqlTable(
  "exam_types",
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
    averagePassing: boolean("averagePassing").notNull().default(false),
    averageMark: decimal("averageMark", { precision: 8, scale: 2 }).notNull().default("0"),
    createdBy: varchar("createdBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_types_school_branch_name_uq").on(table.schoolId, table.branchId, table.name),
    index("exam_types_school_branch_created_idx").on(table.schoolId, table.branchId, table.createdAt),
  ],
);

export const examGradeBands = mysqlTable(
  "exam_grade_bands",
  {
    id: id(),
    gradingScaleId: bigint("gradingScaleId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examGradingScales.id, { onDelete: "cascade" }),
    minPercent: decimal("minPercent", { precision: 5, scale: 2 }).notNull(),
    maxPercent: decimal("maxPercent", { precision: 5, scale: 2 }).notNull(),
    grade: varchar("grade", { length: 8 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    performanceRemark: varchar("performanceRemark", { length: 255 }).notNull(),
    sortOrder: int("sortOrder", { unsigned: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exam_grade_bands_scale_grade_uq").on(table.gradingScaleId, table.grade),
    index("exam_grade_bands_scale_range_idx").on(table.gradingScaleId, table.minPercent, table.maxPercent),
  ],
);

export const examinations = mysqlTable(
  "examinations",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(
      () => schoolBranches.id,
    ),
    academicYearId: bigint("academicYearId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => academicYears.id),
    academicTermId: bigint("academicTermId", { mode: "number", unsigned: true })
      .references(() => academicTerms.id),
    examTypeId: bigint("examTypeId", { mode: "number", unsigned: true })
      .references(() => examTypes.id),
    gradingScaleId: bigint("gradingScaleId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examGradingScales.id),
    examSystem: varchar("examSystem", { length: 10 }).notNull().default("single"),
    name: varchar("name", { length: 120 }).notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    createdBy: varchar("createdBy", { length: 36 }).notNull().references(() => user.id),
    publishedBy: varchar("publishedBy", { length: 36 }).references(() => user.id),
    publishedAt: timestamp("publishedAt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("examinations_school_name_year_uq").on(table.schoolId, table.academicYearId, table.name),
    index("examinations_school_year_status_idx").on(table.schoolId, table.academicYearId, table.status),
    index("examinations_school_branch_year_idx").on(table.schoolId, table.branchId, table.academicYearId),
  ],
);

export const examClasses = mysqlTable(
  "exam_classes",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examinationId: bigint("examinationId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examinations.id, { onDelete: "cascade" }),
    classLevelId: bigint("classLevelId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classLevels.id),
    classTeacherId: bigint("classTeacherId", { mode: "number", unsigned: true })
      .references(() => teachers.id),
    principalRemark: varchar("principalRemark", { length: 1000 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exam_classes_school_exam_class_uq").on(table.schoolId, table.examinationId, table.classLevelId),
    index("exam_classes_school_class_idx").on(table.schoolId, table.classLevelId),
  ],
);

export const examSubjects = mysqlTable(
  "exam_subjects",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examClassId: bigint("examClassId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examClasses.id, { onDelete: "cascade" }),
    classSubjectId: bigint("classSubjectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => classSubjects.id),
    examDate: date("examDate", { mode: "string" }).notNull(),
    maxMarks: decimal("maxMarks", { precision: 8, scale: 2 }).notNull().default("100"),
    weight: decimal("weight", { precision: 6, scale: 2 }).notNull().default("1"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    submittedBy: varchar("submittedBy", { length: 36 }).references(() => user.id),
    submittedAt: timestamp("submittedAt"),
    reviewedBy: varchar("reviewedBy", { length: 36 }).references(() => user.id),
    reviewedAt: timestamp("reviewedAt"),
    reviewNote: varchar("reviewNote", { length: 1000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_subjects_school_class_subject_uq").on(table.schoolId, table.examClassId, table.classSubjectId),
    index("exam_subjects_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const examComponents = mysqlTable(
  "exam_components",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examSubjectId: bigint("examSubjectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examSubjects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    maxMarks: decimal("maxMarks", { precision: 8, scale: 2 }).notNull(),
    sortOrder: int("sortOrder", { unsigned: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exam_components_subject_order_uq").on(table.examSubjectId, table.sortOrder),
    uniqueIndex("exam_components_subject_title_uq").on(table.examSubjectId, table.title),
    index("exam_components_school_subject_idx").on(table.schoolId, table.examSubjectId),
  ],
);

export const examMarks = mysqlTable(
  "exam_marks",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examSubjectId: bigint("examSubjectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examSubjects.id, { onDelete: "cascade" }),
    enrollmentId: bigint("enrollmentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => studentEnrollments.id),
    marks: decimal("marks", { precision: 8, scale: 2 }),
    teacherRemark: varchar("teacherRemark", { length: 1000 }),
    updatedBy: varchar("updatedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_marks_school_subject_enrollment_uq").on(table.schoolId, table.examSubjectId, table.enrollmentId),
    index("exam_marks_school_enrollment_idx").on(table.schoolId, table.enrollmentId),
  ],
);

export const examComponentMarks = mysqlTable(
  "exam_component_marks",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examMarkId: bigint("examMarkId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examMarks.id, { onDelete: "cascade" }),
    examComponentId: bigint("examComponentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examComponents.id, { onDelete: "cascade" }),
    marks: decimal("marks", { precision: 8, scale: 2 }),
    updatedBy: varchar("updatedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_component_marks_mark_component_uq").on(table.schoolId, table.examMarkId, table.examComponentId),
    index("exam_component_marks_school_component_idx").on(table.schoolId, table.examComponentId),
  ],
);

export const examAttendance = mysqlTable(
  "exam_attendance",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examSubjectId: bigint("examSubjectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examSubjects.id, { onDelete: "cascade" }),
    enrollmentId: bigint("enrollmentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => studentEnrollments.id),
    status: varchar("status", { length: 20 }).notNull(),
    note: varchar("note", { length: 500 }),
    updatedBy: varchar("updatedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_attendance_school_subject_enrollment_uq").on(table.schoolId, table.examSubjectId, table.enrollmentId),
    index("exam_attendance_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const examStudentRemarks = mysqlTable(
  "exam_student_remarks",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examClassId: bigint("examClassId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examClasses.id, { onDelete: "cascade" }),
    enrollmentId: bigint("enrollmentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => studentEnrollments.id),
    classTeacherRemark: varchar("classTeacherRemark", { length: 1000 }),
    updatedBy: varchar("updatedBy", { length: 36 }).notNull().references(() => user.id),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_student_remarks_class_enrollment_uq").on(table.schoolId, table.examClassId, table.enrollmentId),
  ],
);

export const examMarkCorrections = mysqlTable(
  "exam_mark_corrections",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examMarkId: bigint("examMarkId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examMarks.id),
    previousMarks: decimal("previousMarks", { precision: 8, scale: 2 }).notNull(),
    requestedMarks: decimal("requestedMarks", { precision: 8, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    requestedBy: varchar("requestedBy", { length: 36 }).notNull().references(() => user.id),
    reviewedBy: varchar("reviewedBy", { length: 36 }).references(() => user.id),
    reviewNote: varchar("reviewNote", { length: 1000 }),
    requestedAt: timestamp("requestedAt").notNull().defaultNow(),
    reviewedAt: timestamp("reviewedAt"),
  },
  (table) => [
    index("exam_mark_corrections_school_status_idx").on(table.schoolId, table.status),
    index("exam_mark_corrections_mark_idx").on(table.examMarkId, table.requestedAt),
  ],
);

export const examMarkAudits = mysqlTable(
  "exam_mark_audits",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    examMarkId: bigint("examMarkId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => examMarks.id),
    examComponentId: bigint("examComponentId", { mode: "number", unsigned: true })
      .references(() => examComponents.id),
    previousMarks: decimal("previousMarks", { precision: 8, scale: 2 }),
    updatedMarks: decimal("updatedMarks", { precision: 8, scale: 2 }),
    action: varchar("action", { length: 30 }).notNull(),
    reason: varchar("reason", { length: 1000 }),
    actorUserId: varchar("actorUserId", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("exam_mark_audits_school_mark_created_idx").on(table.schoolId, table.examMarkId, table.createdAt),
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

export const feeAdvanceTransactions = mysqlTable(
  "fee_advance_transactions",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => students.id),
    invoiceId: bigint("invoiceId", { mode: "number", unsigned: true })
      .references(() => studentFeeInvoices.id),
    paymentId: bigint("paymentId", { mode: "number", unsigned: true })
      .references(() => feePayments.id),
    transactionType: varchar("transactionType", { length: 20 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    receiptNumber: varchar("receiptNumber", { length: 40 }),
    idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull(),
    paymentMethod: varchar("paymentMethod", { length: 30 }),
    reference: varchar("reference", { length: 120 }),
    notes: varchar("notes", { length: 500 }),
    recordedBy: varchar("recordedBy", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("fee_advance_transactions_school_receipt_uq").on(table.schoolId, table.receiptNumber),
    uniqueIndex("fee_advance_transactions_school_idempotency_uq").on(table.schoolId, table.idempotencyKey),
    index("fee_advance_transactions_school_student_idx").on(table.schoolId, table.studentId, table.createdAt),
    index("fee_advance_transactions_school_invoice_idx").on(table.schoolId, table.invoiceId),
    index("fee_advance_transactions_school_payment_idx").on(table.schoolId, table.paymentId),
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

export const inventoryCategories = mysqlTable(
  "inventory_categories",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("inventory_categories_school_name_uq").on(table.schoolId, table.name),
    index("inventory_categories_school_idx").on(table.schoolId),
  ],
);

export const inventorySuppliers = mysqlTable(
  "inventory_suppliers",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    name: varchar("name", { length: 160 }).notNull(),
    contactName: varchar("contactName", { length: 160 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    address: varchar("address", { length: 1000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("inventory_suppliers_school_name_uq").on(table.schoolId, table.name),
    index("inventory_suppliers_school_idx").on(table.schoolId),
  ],
);

export const inventoryLocations = mysqlTable(
  "inventory_locations",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("inventory_locations_school_name_uq").on(table.schoolId, table.name),
    index("inventory_locations_school_idx").on(table.schoolId),
  ],
);

export const inventoryItems = mysqlTable(
  "inventory_items",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    categoryId: bigint("categoryId", { mode: "number", unsigned: true }).notNull().references(() => inventoryCategories.id),
    supplierId: bigint("supplierId", { mode: "number", unsigned: true }).references(() => inventorySuppliers.id),
    locationId: bigint("locationId", { mode: "number", unsigned: true }).references(() => inventoryLocations.id),
    sku: varchar("sku", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: varchar("description", { length: 1000 }),
    unit: varchar("unit", { length: 40 }).notNull(),
    quantityOnHand: decimal("quantityOnHand", { precision: 12, scale: 3 }).notNull().default("0"),
    reorderLevel: decimal("reorderLevel", { precision: 12, scale: 3 }).notNull().default("0"),
    averageUnitCost: decimal("averageUnitCost", { precision: 12, scale: 2 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("inventory_items_school_sku_uq").on(table.schoolId, table.sku),
    index("inventory_items_school_category_idx").on(table.schoolId, table.categoryId),
    index("inventory_items_school_stock_idx").on(table.schoolId, table.quantityOnHand),
  ],
);

export const inventoryMovements = mysqlTable(
  "inventory_movements",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    itemId: bigint("itemId", { mode: "number", unsigned: true }).notNull().references(() => inventoryItems.id),
    supplierId: bigint("supplierId", { mode: "number", unsigned: true }).references(() => inventorySuppliers.id),
    locationId: bigint("locationId", { mode: "number", unsigned: true }).references(() => inventoryLocations.id),
    movementType: varchar("movementType", { length: 20 }).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
    quantityBefore: decimal("quantityBefore", { precision: 12, scale: 3 }).notNull(),
    quantityAfter: decimal("quantityAfter", { precision: 12, scale: 3 }).notNull(),
    unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull().default("0"),
    reference: varchar("reference", { length: 120 }),
    note: varchar("note", { length: 500 }),
    recordedBy: varchar("recordedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("inventory_movements_school_item_date_idx").on(table.schoolId, table.itemId, table.createdAt),
    index("inventory_movements_school_type_date_idx").on(table.schoolId, table.movementType, table.createdAt),
  ],
);

export const inventoryAssets = mysqlTable(
  "inventory_assets",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    itemId: bigint("itemId", { mode: "number", unsigned: true }).references(() => inventoryItems.id),
    locationId: bigint("locationId", { mode: "number", unsigned: true }).references(() => inventoryLocations.id),
    assetTag: varchar("assetTag", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: varchar("description", { length: 1000 }),
    acquiredAt: date("acquiredAt", { mode: "string" }).notNull(),
    acquisitionCost: decimal("acquisitionCost", { precision: 12, scale: 2 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("inventory_assets_school_tag_uq").on(table.schoolId, table.assetTag),
    index("inventory_assets_school_location_idx").on(table.schoolId, table.locationId),
  ],
);

export const assetMaintenance = mysqlTable(
  "asset_maintenance",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    assetId: bigint("assetId", { mode: "number", unsigned: true }).notNull().references(() => inventoryAssets.id),
    maintenanceDate: date("maintenanceDate", { mode: "string" }).notNull(),
    description: varchar("description", { length: 1000 }).notNull(),
    cost: decimal("cost", { precision: 12, scale: 2 }).notNull().default("0"),
    performedBy: varchar("performedBy", { length: 160 }),
    recordedBy: varchar("recordedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [index("asset_maintenance_school_asset_date_idx").on(table.schoolId, table.assetId, table.maintenanceDate)],
);

export const libraryCategories = mysqlTable(
  "library_categories",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(() => schoolBranches.id),
    name: varchar("name", { length: 120 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("library_categories_school_name_uq").on(table.schoolId, table.name),
    index("library_categories_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const librarySubjects = mysqlTable(
  "library_subjects",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(() => schoolBranches.id),
    name: varchar("name", { length: 120 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("library_subjects_school_name_uq").on(table.schoolId, table.name),
    index("library_subjects_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const libraryMembers = mysqlTable(
  "library_members",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(() => schoolBranches.id),
    memberType: varchar("memberType", { length: 20 }).notNull().default("student"),
    studentId: bigint("studentId", { mode: "number", unsigned: true }).references(() => students.id),
    staffMemberId: bigint("staffMemberId", { mode: "number", unsigned: true }).references(() => staffMembers.id),
    memberName: varchar("memberName", { length: 200 }),
    memberPhone: varchar("memberPhone", { length: 40 }),
    memberEmail: varchar("memberEmail", { length: 320 }),
    memberNumber: varchar("memberNumber", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("library_members_school_student_uq").on(table.schoolId, table.studentId),
    uniqueIndex("library_members_school_staff_uq").on(table.schoolId, table.staffMemberId),
    uniqueIndex("library_members_school_number_uq").on(table.schoolId, table.memberNumber),
    index("library_members_school_branch_status_idx").on(table.schoolId, table.branchId, table.status),
  ],
);

export const examReportSignatures = mysqlTable(
  "exam_report_signatures",
  {
    id: id(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    role: varchar("role", { length: 30 }).notNull(),
    storageKey: varchar("storageKey", { length: 500 }).notNull(),
    fileName: varchar("fileName", { length: 160 }).notNull(),
    contentType: varchar("contentType", { length: 100 }).notNull(),
    updatedBy: varchar("updatedBy", { length: 36 }).notNull().references(() => user.id),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exam_report_signatures_school_role_uq").on(table.schoolId, table.role),
  ],
);

export const libraryBooks = mysqlTable(
  "library_books",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(() => schoolBranches.id),
    categoryId: bigint("categoryId", { mode: "number", unsigned: true }).references(() => libraryCategories.id),
    subjectId: bigint("subjectId", { mode: "number", unsigned: true }).references(() => librarySubjects.id),
    bookNumber: varchar("bookNumber", { length: 40 }),
    isbn: varchar("isbn", { length: 20 }),
    title: varchar("title", { length: 200 }).notNull(),
    author: varchar("author", { length: 160 }).notNull(),
    publisher: varchar("publisher", { length: 160 }),
    category: varchar("category", { length: 100 }),
    description: varchar("description", { length: 1000 }),
    shelfLocation: varchar("shelfLocation", { length: 80 }),
    price: decimal("price", { precision: 12, scale: 2 }),
    totalCopies: int("totalCopies", { unsigned: true }).notNull().default(1),
    availableCopies: int("availableCopies", { unsigned: true }).notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("library_books_school_isbn_uq").on(table.schoolId, table.isbn),
    uniqueIndex("library_books_school_number_uq").on(table.schoolId, table.bookNumber),
    index("library_books_school_title_idx").on(table.schoolId, table.title),
    index("library_books_school_status_idx").on(table.schoolId, table.status),
    index("library_books_school_category_idx").on(table.schoolId, table.categoryId),
    index("library_books_school_subject_idx").on(table.schoolId, table.subjectId),
  ],
);

export const libraryLoans = mysqlTable(
  "library_loans",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    bookId: bigint("bookId", { mode: "number", unsigned: true }).notNull().references(() => libraryBooks.id),
    studentId: bigint("studentId", { mode: "number", unsigned: true }).references(() => students.id),
    memberId: bigint("memberId", { mode: "number", unsigned: true }).references(() => libraryMembers.id),
    issuedAt: date("issuedAt", { mode: "string" }).notNull(),
    dueDate: date("dueDate", { mode: "string" }).notNull(),
    returnedAt: date("returnedAt", { mode: "string" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    issuedBy: varchar("issuedBy", { length: 36 }).notNull().references(() => user.id),
    returnedBy: varchar("returnedBy", { length: 36 }).references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("library_loans_school_status_due_idx").on(table.schoolId, table.status, table.dueDate),
    index("library_loans_school_student_status_idx").on(table.schoolId, table.studentId, table.status),
    index("library_loans_school_book_status_idx").on(table.schoolId, table.bookId, table.status),
  ],
);

export const chartOfAccounts = mysqlTable(
  "chart_of_accounts",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    accountType: varchar("accountType", { length: 20 }).notNull(),
    description: varchar("description", { length: 500 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("chart_of_accounts_school_code_uq").on(table.schoolId, table.code),
    index("chart_of_accounts_school_type_idx").on(table.schoolId, table.accountType),
  ],
);

export const schoolBankAccounts = mysqlTable(
  "school_bank_accounts",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    chartAccountId: bigint("chartAccountId", { mode: "number", unsigned: true }).notNull().references(() => chartOfAccounts.id),
    bankName: varchar("bankName", { length: 160 }).notNull(),
    accountName: varchar("accountName", { length: 160 }).notNull(),
    accountNumberLast4: varchar("accountNumberLast4", { length: 4 }),
    openingBalance: decimal("openingBalance", { precision: 12, scale: 2 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("school_bank_accounts_school_name_uq").on(table.schoolId, table.accountName),
    index("school_bank_accounts_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const accountTransactions = mysqlTable(
  "account_transactions",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    transactionType: varchar("transactionType", { length: 20 }).notNull(),
    categoryAccountId: bigint("categoryAccountId", { mode: "number", unsigned: true }).notNull().references(() => chartOfAccounts.id),
    bankAccountId: bigint("bankAccountId", { mode: "number", unsigned: true }).references(() => schoolBankAccounts.id),
    transactionDate: date("transactionDate", { mode: "string" }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    description: varchar("description", { length: 1000 }).notNull(),
    payee: varchar("payee", { length: 200 }),
    reference: varchar("reference", { length: 120 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    submittedBy: varchar("submittedBy", { length: 36 }).notNull().references(() => user.id),
    approvedBy: varchar("approvedBy", { length: 36 }).references(() => user.id),
    approvedAt: timestamp("approvedAt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("account_transactions_school_type_date_idx").on(table.schoolId, table.transactionType, table.transactionDate),
    index("account_transactions_school_status_date_idx").on(table.schoolId, table.status, table.transactionDate),
    index("account_transactions_school_bank_idx").on(table.schoolId, table.bankAccountId),
  ],
);

export const fundTransfers = mysqlTable(
  "fund_transfers",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true }).notNull().references(() => schools.id),
    sourceBankAccountId: bigint("sourceBankAccountId", { mode: "number", unsigned: true }).notNull().references(() => schoolBankAccounts.id),
    destinationBankAccountId: bigint("destinationBankAccountId", { mode: "number", unsigned: true }).notNull(),
    transferDate: date("transferDate", { mode: "string" }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    reference: varchar("reference", { length: 120 }),
    note: varchar("note", { length: 500 }),
    recordedBy: varchar("recordedBy", { length: 36 }).notNull().references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "fund_transfers_destination_bank_fk",
      columns: [table.destinationBankAccountId],
      foreignColumns: [schoolBankAccounts.id],
    }),
    index("fund_transfers_school_date_idx").on(table.schoolId, table.transferDate),
  ],
);
