import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../src/db";
import {
  account,
  permissions,
  rolePermissions,
  roles,
  schoolMemberships,
  schools,
  user,
  userRoles,
} from "../src/db/schema";

const permissionCatalog = [
  ["dashboard.view", "View the school dashboard"],
  ["school.settings.manage", "Manage school profile and settings"],
  ["users.manage", "Manage school user accounts"],
  ["roles.manage", "Manage roles and permission assignments"],
  ["students.view", "View student records"],
  ["students.create", "Create student records"],
  ["students.update", "Update student records"],
  ["students.delete", "Archive student records"],
  ["students.promote", "Promote or transfer students"],
  ["attendance.mark", "Mark attendance"],
  ["attendance.approve", "Approve attendance corrections"],
  ["examinations.create", "Create examinations"],
  ["results.enter", "Enter examination results"],
  ["results.publish", "Approve and publish results"],
  ["fees.manage", "Manage fee structures"],
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
      "users.manage",
      "roles.manage",
      "students.view",
      "students.create",
      "students.update",
      "students.delete",
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
