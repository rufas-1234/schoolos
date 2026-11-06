import {
  bigint,
  boolean,
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

export const students = mysqlTable(
  "students",
  {
    id: id(),
    publicId: varchar("publicId", { length: 36 }).notNull().unique(),
    schoolId: bigint("schoolId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => schools.id),
    firstName: varchar("firstName", { length: 120 }).notNull(),
    lastName: varchar("lastName", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("students_school_status_idx").on(table.schoolId, table.status),
    index("students_school_created_idx").on(table.schoolId, table.createdAt),
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
    storageKey: varchar("storageKey", { length: 1024 }).notNull(),
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
