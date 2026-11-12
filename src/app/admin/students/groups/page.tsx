import { and, asc, eq, inArray } from "drizzle-orm";
import {
  AdminActionDialog,
  AdminDataTable,
  AdminRecordDialog,
  type AdminTableFilter,
} from "@/components/admin-data-table";
import { db } from "@/db";
import { studentGroupMemberships, studentGroups, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { DeleteStudentGroupForm, StudentGroupForm, StudentGroupMembers } from "../group-forms";

export default async function StudentGroupsPage() {
  const context = await requireSchoolPermission("students.view");
  const [groups, studentsInSchool, memberships] = await Promise.all([
    db
      .select({
        id: studentGroups.id,
        publicId: studentGroups.publicId,
        name: studentGroups.name,
        description: studentGroups.description,
      })
      .from(studentGroups)
      .where(eq(studentGroups.schoolId, context.schoolId))
      .orderBy(asc(studentGroups.name)),
    db
      .select({
        id: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
        status: students.status,
      })
      .from(students)
      .where(
        and(
          eq(students.schoolId, context.schoolId),
          inArray(students.status, ["admitted", "active", "inactive"]),
        ),
      )
      .orderBy(asc(students.lastName), asc(students.firstName)),
    db
      .select({
        id: studentGroupMemberships.id,
        groupId: studentGroupMemberships.groupId,
        studentId: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
      })
      .from(studentGroupMemberships)
      .innerJoin(
        studentGroups,
        and(
          eq(studentGroupMemberships.groupId, studentGroups.id),
          eq(studentGroups.schoolId, context.schoolId),
        ),
      )
      .innerJoin(students, eq(studentGroupMemberships.studentId, students.id))
      .where(
        and(
          eq(studentGroupMemberships.schoolId, context.schoolId),
          eq(students.schoolId, context.schoolId),
        ),
      )
      .orderBy(asc(students.lastName), asc(students.firstName)),
  ]);
  const canCreate = context.grantedPermissions.includes("students.create");
  const canUpdate = context.grantedPermissions.includes("students.update");
  const canDelete = context.grantedPermissions.includes("students.delete");
  const groupRows = groups.map((group) => {
    const groupMembers = memberships.filter((membership) => membership.groupId === group.id);
    const availableStudents = studentsInSchool
      .filter((student) => !groupMembers.some((member) => member.studentId === student.id))
      .map((student) => ({
        id: student.id,
        label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}`,
      }));

    return {
      id: group.id,
      values: {
        name: group.name,
        description: group.description ?? "",
        memberCount: String(groupMembers.length),
        membershipFilter: groupMembers.length > 0 ? "has-members" : "empty",
        members: groupMembers.map((member) => `${member.firstName} ${member.lastName}`).join(", "),
      },
      actions: (
        <div className="flex items-center gap-2">
          {canUpdate && (
            <AdminRecordDialog title={`Manage ${group.name}`} mode="view">
              <StudentGroupMembers
                groupId={group.id}
                groupName={group.name}
                students={availableStudents}
                members={groupMembers.map((member) => ({
                  membershipId: member.id,
                  name: `${member.firstName} ${member.lastName}`,
                  admissionNumber: member.admissionNumber,
                }))}
              />
            </AdminRecordDialog>
          )}
          {canUpdate && (
            <AdminRecordDialog title={`Edit ${group.name}`}>
              <StudentGroupForm record={group} />
            </AdminRecordDialog>
          )}
          {canDelete && <DeleteStudentGroupForm groupId={group.id} groupName={group.name} />}
        </div>
      ),
    };
  });
  const filters: AdminTableFilter[] = [{
    key: "membershipFilter",
    label: "membership",
    options: [
      { value: "has-members", label: "Has members" },
      { value: "empty", label: "No members" },
    ],
  }];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Student Info</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Student groups
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Organize students into school groups and maintain each group’s roster.
        </p>
      </header>
      <AdminDataTable
        title="Student groups"
        columns={[
          { key: "name", label: "Group" },
          { key: "description", label: "Description" },
          { key: "memberCount", label: "Members" },
          { key: "members", label: "Student names" },
        ]}
        rows={groupRows}
        filters={filters}
        requireSearchCriteria
        toolbarActions={canCreate ? (
          <AdminActionDialog label="Add group" title="Create student group">
            <StudentGroupForm />
          </AdminActionDialog>
        ) : null}
        emptyMessage="No student groups have been created yet."
      />
    </div>
  );
}
