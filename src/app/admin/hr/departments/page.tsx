import { StaffCatalogPage } from "../catalog-page";

export default function DepartmentsPage() {
  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Departments &amp; designations</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Set up staff departments and job designations together. Quick add is also available while adding staff.</p>
      </header>
      <section aria-labelledby="staff-departments-heading" id="departments" className="space-y-3">
        <h2 id="staff-departments-heading" className="text-lg font-semibold text-slate-900">Departments</h2>
        <StaffCatalogPage kind="department" showHeader={false} />
      </section>
      <section aria-labelledby="staff-designations-heading" id="designations" className="space-y-3">
        <h2 id="staff-designations-heading" className="text-lg font-semibold text-slate-900">Designations</h2>
        <StaffCatalogPage kind="designation" showHeader={false} />
      </section>
    </div>
  );
}
