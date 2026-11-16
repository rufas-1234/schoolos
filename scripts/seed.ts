import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../src/db";
import {
  account,
  chartOfAccounts,
  permissions,
  rolePermissions,
  roles,
  schoolMemberships,
  schoolBranches,
  schools,
  user,
  userRoles,
} from "../src/db/schema";

const permissionCatalog = [
  ["dashboard.view", "View the school dashboard"],
  ["school.settings.manage", "Manage school profile and settings"],
  ["academics.manage", "Manage academic setup, attendance, and enrollment without deleting records"],
  ["academics.delete", "Delete academic setup and records"],
  ["users.manage", "Manage school user accounts"],
  ["roles.manage", "Manage roles and permission assignments"],
  ["students.view", "View student records"],
  ["students.create", "Create student records"],
  ["students.update", "Update student records"],
  ["students.delete", "Archive student records"],
  ["students.promote", "Promote or transfer students"],
  ["attendance.mark", "Mark attendance"],
  ["attendance.approve", "Approve attendance corrections"],
  ["examinations.create", "Configure examinations and assessments"],
  ["examinations.delete", "Delete examinations"],
  ["results.enter", "Enter marks for assigned assessments"],
  ["results.publish", "Approve and publish results"],
  ["fees.manage", "Manage fee structures"],
  ["inventory.manage", "Manage school inventory and assets"],
  ["accounts.manage", "Manage school accounts, income, expenses, and reports"],
  ["fees.balance.view", "View outstanding student fee balances"],
  ["payments.record", "Record school payments"],
  ["reports.export", "Export school reports"],
  ["staff.manage", "Manage staff records"],
] as const;

const initialRoles = [
  "School administrator",
  "Principal",
  "Deputy principal",
  "Registrar",
  "Accountant",
  "Teacher",
  "Parent / guardian",
  "Student",
  "Librarian",
  "Transport manager",
  "Hostel administrator",
  "Human resources officer",
] as const;

const defaultChartAccounts = [
  ["1000", "Cash on hand", "asset", "Cash held by the school"],
  ["1010", "Bank account clearing", "asset", "Control account for school bank accounts"],
  ["2000", "Accounts payable", "liability", "Amounts owed to suppliers and service providers"],
  ["3000", "Accumulated school funds", "equity", "Opening and retained school funds"],
  ["4000", "School fee income", "income", "Tuition and other student fee receipts"],
  ["4100", "Other income", "income", "Donations, grants, and miscellaneous income"],
  ["5000", "Staff expenses", "expense", "Salaries, allowances, and staff-related costs"],
  ["5100", "School supplies", "expense", "Teaching, office, and classroom supplies"],
  ["5200", "Utilities", "expense", "Electricity, water, internet, and other utilities"],
  ["5300", "Transport costs", "expense", "School transport and travel costs"],
  ["5400", "Repairs and maintenance", "expense", "School facility, equipment, and asset maintenance"],
  ["5500", "Other operating expenses", "expense", "Other approved operating costs"],
] as const;

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Initial administrator seeding is disabled in production.");
  }
  if (process.env.ALLOW_INITIAL_ADMIN_SEED !== "true") {
    throw new Error("Set ALLOW_INITIAL_ADMIN_SEED=true to explicitly enable this non-production seed.");
  }

  const credentials = z
    .object({
      name: z.string().trim().min(2).max(255),
      email: z.string().trim().email().max(320),
      password: z.string().min(12).max(128),
      schoolName: z.string().trim().min(2).max(255),
    })
    .safeParse({
      name: process.env.INITIAL_ADMIN_NAME,
      email: process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase(),
      password: process.env.INITIAL_ADMIN_PASSWORD,
      schoolName: process.env.INITIAL_SCHOOL_NAME,
    });
  if (!credentials.success) {
    throw new Error(
      "Provide a valid admin name/email, a 12–128 character password, and a school name using the INITIAL_ADMIN_* and INITIAL_SCHOOL_NAME settings.",
    );
  }

  const { name, email, password, schoolName } = credentials.data;

  await db.transaction(async (tx) => {
    let [admin] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (!admin) {
      const userId = randomUUID();
      const passwordHash = await hashPassword(password);
      await tx.insert(user).values({
        id: userId,
        name,
        email,
        emailVerified: true,
        isActive: true,
      });
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      });
      admin = { id: userId };
    }

    let [school] = await tx.select({ id: schools.id }).from(schools).where(eq(schools.name, schoolName)).limit(1);
    if (!school) {
      await tx.insert(schools).values({ publicId: randomUUID(), name: schoolName });
      [school] = await tx.select({ id: schools.id }).from(schools).where(eq(schools.name, schoolName)).limit(1);
    }
    if (!school) throw new Error("The school record could not be created.");

    for (const [code, accountName, accountType, description] of defaultChartAccounts) {
      const [existingAccount] = await tx.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.schoolId, school.id), eq(chartOfAccounts.code, code))).limit(1);
      if (!existingAccount) {
        await tx.insert(chartOfAccounts).values({
          publicId: randomUUID(),
          schoolId: school.id,
          code,
          name: accountName,
          accountType,
          description,
        });
      }
    }

    const [mainBranch] = await tx
      .select({ id: schoolBranches.id })
      .from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, school.id), eq(schoolBranches.code, "MAIN")))
      .limit(1);
    if (!mainBranch) {
      await tx.insert(schoolBranches).values({
        publicId: randomUUID(),
        schoolId: school.id,
        name: "Main campus",
        code: "MAIN",
      });
    }

    for (const [key, description] of permissionCatalog) {
      const [existingPermission] = await tx
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.key, key))
        .limit(1);
      if (!existingPermission) {
        await tx.insert(permissions).values({ key, description });
      }
    }

    for (const roleName of initialRoles) {
      const [existingRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.schoolId, school.id), eq(roles.name, roleName)))
        .limit(1);
      if (!existingRole) {
        await tx.insert(roles).values({
          schoolId: school.id,
          name: roleName,
          isSystem: true,
        });
      }
    }

    const [adminRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.schoolId, school.id), eq(roles.name, "School administrator")))
      .limit(1);
    if (!adminRole) throw new Error("The school administrator role could not be created.");

    const [membership] = await tx
      .select({ id: schoolMemberships.id })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.schoolId, school.id), eq(schoolMemberships.userId, admin.id)))
      .limit(1);
    let membershipId = membership?.id;
    if (!membershipId) {
      await tx.insert(schoolMemberships).values({
        schoolId: school.id,
        userId: admin.id,
      });
      const [createdMembership] = await tx
        .select({ id: schoolMemberships.id })
        .from(schoolMemberships)
        .where(and(eq(schoolMemberships.schoolId, school.id), eq(schoolMemberships.userId, admin.id)))
        .limit(1);
      if (!createdMembership) throw new Error("The administrator membership could not be created.");
      membershipId = createdMembership.id;
    }

    const [existingUserRole] = await tx
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(and(eq(userRoles.membershipId, membershipId), eq(userRoles.roleId, adminRole.id)))
      .limit(1);
    if (!existingUserRole) {
      await tx.insert(userRoles).values({ membershipId, roleId: adminRole.id });
    }

    const adminPermissions = [
      "dashboard.view",
      "school.settings.manage",
      "academics.manage",
      "academics.delete",
      "users.manage",
      "roles.manage",
      "students.view",
      "students.create",
      "students.update",
      "students.delete",
      "staff.manage",
      "fees.manage",
      "fees.balance.view",
      "payments.record",
      "accounts.manage",
      "inventory.manage",
      "reports.export",
      "examinations.create",
      "examinations.delete",
      "results.enter",
      "results.publish",
    ];
    const rolePermissionIds = new Set(
      (
        await tx
          .select({ permissionId: rolePermissions.permissionId })
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, adminRole.id))
      ).map(({ permissionId }) => permissionId),
    );
    for (const permissionKey of adminPermissions) {
      const [permission] = await tx
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.key, permissionKey))
        .limit(1);
      if (permission && !rolePermissionIds.has(permission.id)) {
        await tx.insert(rolePermissions).values({ roleId: adminRole.id, permissionId: permission.id });
      }
    }

    const [hrRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.schoolId, school.id), eq(roles.name, "Human resources officer")))
      .limit(1);
    const [staffPermission] = await tx
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, "staff.manage"))
      .limit(1);
    if (!hrRole || !staffPermission) {
      throw new Error("The Human resources officer role or staff permission could not be created.");
    }
    const [hrRolePermission] = await tx
      .select({ roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .where(and(
        eq(rolePermissions.roleId, hrRole.id),
        eq(rolePermissions.permissionId, staffPermission.id),
      ))
      .limit(1);
    if (!hrRolePermission) {
      await tx.insert(rolePermissions).values({
        roleId: hrRole.id,
        permissionId: staffPermission.id,
      });
    }

    const [teacherRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.schoolId, school.id), eq(roles.name, "Teacher")))
      .limit(1);
    if (!teacherRole) throw new Error("The Teacher role could not be created.");
    await tx.update(roles).set({
      description: "Manage academic setup, student records, and examinations; no delete or result-publishing access.",
    }).where(and(
      eq(roles.id, teacherRole.id),
      eq(roles.isSystem, true),
    ));
    for (const permissionKey of [
      "academics.manage",
      "students.view",
      "students.create",
      "students.update",
      "examinations.create",
      "results.enter",
      "fees.balance.view",
    ]) {
      const [permission] = await tx
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.key, permissionKey))
        .limit(1);
      if (!permission) throw new Error(`Permission ${permissionKey} could not be created.`);
      const [rolePermission] = await tx
        .select({ roleId: rolePermissions.roleId })
        .from(rolePermissions)
        .where(and(
          eq(rolePermissions.roleId, teacherRole.id),
          eq(rolePermissions.permissionId, permission.id),
        ))
        .limit(1);
      if (!rolePermission) {
        await tx.insert(rolePermissions).values({
          roleId: teacherRole.id,
          permissionId: permission.id,
        });
      }
    }

    const [accountantRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.schoolId, school.id), eq(roles.name, "Accountant")))
      .limit(1);
    const financePermissions = await tx
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, [
        "fees.manage",
        "payments.record",
        "reports.export",
        "accounts.manage",
        "inventory.manage",
      ]));
    if (!accountantRole || financePermissions.length !== 5) {
      throw new Error("The Accountant role or finance permissions could not be created.");
    }
    const existingAccountantPermissions = new Set(
      (
        await tx
          .select({ permissionId: rolePermissions.permissionId })
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, accountantRole.id))
      ).map(({ permissionId }) => permissionId),
    );
    for (const permission of financePermissions) {
      if (!existingAccountantPermissions.has(permission.id)) {
        await tx.insert(rolePermissions).values({ roleId: accountantRole.id, permissionId: permission.id });
      }
    }
  });

  console.log(`Administrator ${email} is provisioned for ${schoolName}.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Initial administrator seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
