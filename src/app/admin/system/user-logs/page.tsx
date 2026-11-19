import { desc, eq } from "drizzle-orm";
import { AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { auditLogs, user } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

const humanize = (value: string) => value.replaceAll("_", " ").replaceAll(".", " · ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function UserLogsPage({ searchParams }: { searchParams: Promise<{ search?: string | string[] }> }) {
  const [context, params] = await Promise.all([
    requireSchoolPermission("school.settings.manage"),
    searchParams,
  ]);
  const logs = await db.select({
    id: auditLogs.id,
    actorName: user.name,
    actorEmail: user.email,
    action: auditLogs.action,
    resourceType: auditLogs.resourceType,
    resourcePublicId: auditLogs.resourcePublicId,
    changedFields: auditLogs.changedFields,
    createdAt: auditLogs.createdAt,
  }).from(auditLogs)
    .innerJoin(user, eq(auditLogs.actorUserId, user.id))
    .where(eq(auditLogs.schoolId, context.schoolId))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(1000);
  const initialQuery = typeof params.search === "string" ? params.search.slice(0, 120) : "";
  const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: context.schoolTimezone });

  return <div className="space-y-6">
    <header>
      <p className="text-sm font-medium text-violet-700">System</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">User Logs</h1>
      <p className="mt-2 text-sm text-slate-500">Review recent changes made by users in this school workspace.</p>
    </header>
    <AdminDataTable
      title="User activity logs"
      initialQuery={initialQuery}
      mobileCardView
      columns={[
        { key: "date", label: "Date and time" },
        { key: "user", label: "User" },
        { key: "action", label: "Activity" },
        { key: "record", label: "Record" },
        { key: "recordId", label: "Record ID" },
        { key: "fields", label: "Changed fields" },
      ]}
      rows={logs.map((log) => ({
        id: log.id,
        searchableText: [log.actorName, log.actorEmail, log.action, log.resourceType, log.resourcePublicId, ...log.changedFields].join(" "),
        values: {
          date: dateTime.format(log.createdAt),
          user: `${log.actorName} · ${log.actorEmail}`,
          action: humanize(log.action),
          record: humanize(log.resourceType),
          recordId: log.resourcePublicId,
          fields: log.changedFields.join(", "),
        },
      }))}
      emptyMessage="No user activity has been recorded yet."
    />
  </div>;
}
