import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { requireSchoolPermission } from "@/lib/access-control";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";
import { getSchoolCalendarEvents, type SchoolCalendarEvent } from "@/lib/school-calendar";

type SearchParams = { month?: string | string[]; yearId?: string | string[] };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseMonth(value: string): { year: number; month: number; key: string } | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (year < 1970 || month < 1 || month > 12) return null;
  return { year, month, key: value };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const eventStyle: Record<SchoolCalendarEvent["type"], string> = {
  term: "bg-sky-100 text-sky-800",
  "exam-period": "bg-amber-100 text-amber-900",
  holiday: "bg-emerald-100 text-emerald-800",
  examination: "bg-violet-100 text-violet-800",
};

export default async function SchoolCalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireSchoolPermission([
    "dashboard.view", "academics.manage", "school.settings.manage", "examinations.create", "results.enter", "results.publish",
  ]);
  const [params, yearSelection] = await Promise.all([
    searchParams,
    getSchoolAcademicYearSelection(context.schoolId),
  ]);
  const requestedYearId = /^\d+$/.test(first(params.yearId)) ? Number(first(params.yearId)) : null;
  const selectedYear = yearSelection.years.find((year) => year.id === requestedYearId) ?? yearSelection.selectedYear;
  const now = new Date();
  const month = parseMonth(first(params.month)) ?? { year: now.getFullYear(), month: now.getMonth() + 1, key: monthKey(now.getFullYear(), now.getMonth() + 1) };
  const events = await getSchoolCalendarEvents(context.schoolId, selectedYear?.id);
  const monthStart = `${month.key}-01`;
  const monthEnd = `${month.key}-${String(new Date(month.year, month.month, 0).getDate()).padStart(2, "0")}`;
  const monthEvents = events.filter((event) => event.startDate <= monthEnd && event.endDate >= monthStart);
  const firstWeekday = (new Date(month.year, month.month - 1, 1).getDay() + 6) % 7;
  const dayCount = new Date(month.year, month.month, 0).getDate();
  const weekCount = Math.ceil((firstWeekday + dayCount) / 7);
  const monthName = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(month.year, month.month - 1, 1));
  const previous = new Date(month.year, month.month - 2, 1);
  const next = new Date(month.year, month.month, 1);
  const calendarDays = Array.from({ length: weekCount * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > dayCount) return null;
    const date = `${month.key}-${String(day).padStart(2, "0")}`;
    return { day, date, events: monthEvents.filter((event) => event.startDate <= date && event.endDate >= date) };
  });
  const upcoming = monthEvents.filter((event) => event.endDate >= new Date().toISOString().slice(0, 10));

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700">School workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">School calendar</h1>
          <p className="mt-2 text-sm text-slate-600">Terms, exam periods, examinations, and school holidays in one calendar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/academics?section=terms" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Manage terms &amp; exams</Link>
          <Link href="/admin/academics?section=holidays" className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800">Add school holiday</Link>
        </div>
      </header>

      <SmartFilterForm method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="month" value={month.key} />
        <label className="space-y-1 text-sm font-medium text-slate-700">Academic year
          <select name="yearId" defaultValue={selectedYear ? String(selectedYear.id) : ""} className="h-10 min-w-48 rounded-lg border border-slate-200 bg-white px-3">
            {!yearSelection.years.length && <option value="">No academic years</option>}
            {yearSelection.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <p className="text-sm text-slate-500">{selectedYear ? `Showing ${selectedYear.name}` : "Add an academic year and enter dates to populate the calendar."}</p>
      </SmartFilterForm>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
          <Link aria-label="Previous month" href={`/admin/calendar?month=${monthKey(previous.getFullYear(), previous.getMonth() + 1)}${selectedYear ? `&yearId=${selectedYear.id}` : ""}`} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft size={18} /></Link>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-slate-900">{monthName}</h2>
            <p className="text-xs text-slate-500">{monthEvents.length} scheduled item{monthEvents.length === 1 ? "" : "s"}</p>
          </div>
          <Link aria-label="Next month" href={`/admin/calendar?month=${monthKey(next.getFullYear(), next.getMonth() + 1)}${selectedYear ? `&yearId=${selectedYear.id}` : ""}`} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight size={18} /></Link>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[42rem]">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-semibold text-slate-500">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="py-2.5">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((cell, index) => cell ? (
                <div key={cell.date} className={`min-h-24 border-b border-r border-slate-100 p-1.5 sm:min-h-28 sm:p-2 ${cell.date === new Date().toISOString().slice(0, 10) ? "bg-violet-50/70" : ""}`}>
                  <time dateTime={cell.date} className="text-xs font-semibold text-slate-700">{cell.day}</time>
                  <div className="mt-1 space-y-1">
                    {cell.events.slice(0, 3).map((event) => (
                      <Link key={event.id} href={event.href} title={`${event.title} · ${event.startDate} to ${event.endDate}`} className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-4 sm:text-xs ${eventStyle[event.type]}`}>
                        {event.title}
                      </Link>
                    ))}
                    {cell.events.length > 3 && <p className="text-[10px] text-slate-500">+{cell.events.length - 3} more</p>}
                  </div>
                </div>
              ) : <div key={`empty-${index}`} aria-hidden="true" className="min-h-24 border-b border-r border-slate-100 bg-slate-50/60 sm:min-h-28" />)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 sm:px-5">
          <Legend color="bg-sky-500" label="Term" />
          <Legend color="bg-amber-500" label="Exam period" />
          <Legend color="bg-violet-500" label="Examination" />
          <Legend color="bg-emerald-500" label="Holiday" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-900">This month</h2>
        {upcoming.length ? <ul className="mt-3 divide-y divide-slate-100">
          {upcoming.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
            <div><p className="text-sm font-medium text-slate-800">{event.title}</p><p className="mt-1 text-xs text-slate-500">{event.startDate}{event.endDate !== event.startDate ? ` to ${event.endDate}` : ""} · {event.academicYearName}</p></div>
            <Link href={event.href} className="text-sm font-semibold text-violet-700 hover:underline">Manage</Link>
          </li>)}
        </ul> : <p className="mt-2 text-sm text-slate-500">No upcoming dates are scheduled for this month.</p>}
      </section>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}
