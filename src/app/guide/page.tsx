import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { PublicPlatformShell } from "@/components/public-platform-shell";

export const metadata: Metadata = {
  title: "SchoolOS User Guide",
  description: "A step-by-step guide to setting up and using SchoolOS school management features.",
};

const sections = [
  ["start", "Start here"],
  ["setup", "Set up a school workspace"],
  ["roles", "Users, roles, and access"],
  ["students", "Students and admissions"],
  ["academics", "Academic structure and attendance"],
  ["exams", "Examinations and reports"],
  ["staff", "Staff and human resources"],
  ["fees", "Fees and payments"],
  ["accounts", "Accounts and finance"],
  ["inventory", "Inventory and assets"],
  ["library", "Library"],
  ["dormitories", "Dormitories"],
  ["portals", "Student, parent, teacher, and finance portals"],
  ["platform", "Platform operator tasks"],
  ["account", "Account, search, and everyday tips"],
] as const;

function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-slate-200 pt-8">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-700">{children}</div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return <li className="pl-1"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">{n}</span>{children}</li>;
}

export default function GuidePage() {
  return (
    <PublicPlatformShell
      title="SchoolOS user guide"
      navigation={sections.map(([id, label], index) => ({ href: `#${id}`, label: `${index + 1}. ${label}` }))}
    >
      <main className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl bg-gradient-to-br from-violet-900 to-violet-700 px-6 py-9 text-white shadow-lg sm:px-10 sm:py-12">
          <Link href="/login" className="text-sm font-semibold text-violet-100 hover:text-white">← Back to sign in</Link>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-violet-200">SchoolOS handbook</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Step-by-step user guide</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-violet-100 sm:text-lg">
            Use this guide to set up a school, manage daily work, and understand what each workspace can do. Menu items appear according to your school role and permissions, so your screen may not show every feature described here.
          </p>
          <p className="mt-4 text-sm text-violet-200">Last reviewed: November 2026 · For the features currently available in this SchoolOS installation</p>
        </header>

        <div className="mt-7">
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="mb-8 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              <strong>Before you begin:</strong> Your school administrator creates your account and assigns your access. Keep student and staff information confidential. Check the selected school name in the top bar before recording or changing anything.
            </div>

            <GuideSection id="start" title="1. Start here">
              <p>SchoolOS is organized around a school workspace. Sign in at <Link className="font-semibold text-violet-700 underline" href="/login">the login page</Link> with your email, phone number, admission number, or staff number and password. For new student and staff accounts, an administrator shares a one-time password setup link. If an administrator instead gives you a temporary password, you must change it before opening the school workspace. Your landing page is chosen from your role and linked profile: administrators see the administration workspace; teachers, students, and parents may be directed to their portal.</p>
              <ol className="space-y-3">
                <Step n={1}>Ask your school administrator to create your login and tell you which identifier to use.</Step>
                <Step n={2}>Sign in. If you belong to more than one school, choose the correct school workspace from the account menu.</Step>
                <Step n={3}>Use the left navigation to open a module. On a phone, open the menu with the menu button.</Step>
                <Step n={4}>Use the quick search in the top bar to find supported records and modules. Use each page’s filters to narrow lists and reports.</Step>
              </ol>
              <h3 className="font-semibold text-slate-900">Use the dashboard and navigation</h3>
              <ol className="space-y-3">
                <Step n={1}>Start at <strong>Overview</strong> to review the school summary, recent activity, setup shortcuts, and any finance or academic indicators available to your role.</Step>
                <Step n={2}>Expand a left-navigation category to see its pages. On smaller screens, open the menu button; choose <strong>User guide</strong> at the bottom of the navigation to return here.</Step>
                <Step n={3}>Use the top-bar search for supported people, classes, and records. Search results are limited to the selected school and your permissions; page filters may provide additional options.</Step>
                <Step n={4}>Use the school selector in your account menu to switch only between schools where your account has access. Confirm the school name before making changes.</Step>
                <Step n={5}>Use the print controls for print-ready reports and choose <strong>Save as PDF</strong> in your browser when you need a PDF copy. Where available, CSV exports are intended for authorized internal use.</Step>
              </ol>
              <p>SchoolOS uses role permissions. If a menu or action is missing, ask the school administrator to review your role; do not borrow another person’s login.</p>
            </GuideSection>

            <GuideSection id="setup" title="2. Set up a school workspace">
              <h3 className="font-semibold text-slate-900">Create and activate a school</h3>
              <ol className="space-y-3">
                <Step n={1}>A school owner can select <strong>Create a school workspace</strong> on the sign-in page when public signup is enabled.</Step>
                <Step n={2}>Enter the school and administrator details. Use an email address the administrator controls and keep the new password private.</Step>
                <Step n={3}>Submit the application. The workspace is pending and cannot be used until a platform operator reviews and approves it.</Step>
                <Step n={4}>After approval, sign in and complete the school profile and academic setup below.</Step>
              </ol>
              <p>New school workspaces start with a main campus, a default currency, standard roles, a chart of accounts, and the first school administrator. Platform operators can also create workspaces directly. School signup may be disabled by the installation.</p>
              <h3 className="font-semibold text-slate-900">Recommended first-time setup order</h3>
              <ol className="space-y-3">
                <Step n={1}>Open <strong>School profile</strong> from the account menu. Review the school name and contact details, logo, timezone, and currency.</Step>
                <Step n={2}>In <strong>Academics</strong>, create or confirm branches, academic years, terms, classes, sections, classrooms, and subjects.</Step>
                <Step n={3}>Add staff and teachers, then configure teacher assignments and class routines.</Step>
                <Step n={4}>Configure student fields, categories, and behaviour options; admit or add students and place them in the correct year and section.</Step>
                <Step n={5}>Set up fees, grading scales, examinations, library, dormitories, and finance records as needed.</Step>
                <Step n={6}>Create named user accounts and assign only the roles needed for each person.</Step>
              </ol>
            </GuideSection>

            <GuideSection id="roles" title="3. Users, roles, and access">
              <p>Open <strong>Users</strong> to review school accounts, create school-specific roles, and assign permissions. A role is a bundle of permissions; examples include managing fees, viewing students, entering results, publishing results, managing staff, or managing the library.</p>
              <ol className="space-y-3">
                <Step n={1}>Create or review roles under the Roles area. Give each role a clear name and grant only the permissions required for that job.</Step>
                <Step n={2}>For a new account, choose the relevant staff, student, or parent profile, create the login, and assign one or more school roles.</Step>
                <Step n={3}>Use individual access controls to adjust a person’s role assignment when responsibilities change.</Step>
                <Step n={4}>Review the user list periodically and disable access for people who have left or changed roles.</Step>
              </ol>
              <p>Student accounts link to student records; parent accounts can link to one or more children. Teacher accounts need a linked staff/teacher profile plus teaching assignments. Use <strong>Caretaker roles &amp; accounts</strong> for limited library or dormitory duties; the person needs an active staff profile and email. Do not assign broad administrator roles just to make a menu appear.</p>
            </GuideSection>

            <GuideSection id="students" title="4. Students and admissions">
              <p><strong>Student Info</strong> contains student records, categories, admission desk, student groups, behaviour, status tools, student ID cards, reports, and settings. Use searchable tables and filters to locate records.</p>
              <ol className="space-y-3">
                <Step n={1}>Set student categories and configurable student fields first if your school uses them.</Step>
                <Step n={2}>Choose <strong>Add Student</strong> and enter the student identity, admission number and date, contact and guardian details, and any configured fields. Add a photo or permitted documents if needed.</Step>
                <Step n={3}>Save the record, then place the student in a branch, academic year, class, and section through enrollment.</Step>
                <Step n={4}>Use <strong>Admission Desk</strong> to review pending admissions and approve, reject, or otherwise update their student status as appropriate.</Step>
                <Step n={5}>Open a student profile to review details and history. Update status when a student becomes active, inactive, disabled, or leaves according to the available transitions.</Step>
                <Step n={6}>Use groups for student cohorts, behaviour records for incidents/actions, and student reports or exports for authorized reporting.</Step>
                <Step n={7}>Use Student ID Cards to prepare printable cards. Use Promote to record progression at year end; review the target year and section before confirming.</Step>
              </ol>
              <h3 className="font-semibold text-slate-900">Admissions and enrollment</h3>
              <ol className="space-y-3">
                <Step n={1}>For online applications, open <strong>Admission Desk</strong> and copy the school-specific registration link. Preview the form before sharing it with families.</Step>
                <Step n={2}>Review pending applications in the Admission Desk table. Search or filter by branch and class, open the student record as needed, and confirm the intended class/section.</Step>
                <Step n={3}>Approve or reject the pending admission. Approval does not remove the need to verify the student’s final enrollment and placement for the correct academic year.</Step>
                <Step n={4}>Use <strong>Unassigned Student</strong> to find students who still need a class/section placement. Use <strong>Multi Class Student</strong> only when the student legitimately needs additional class enrollments.</Step>
                <Step n={5}>At year end, use <strong>Student Promote</strong> to move eligible enrollments to the next active year. Check the source year, destination year, class, and section before confirming.</Step>
              </ol>
              <p><strong>Other student tools:</strong> Student Categories group records; Student Groups organize cohorts; Student Behaviour records positive conduct or incidents with follow-up dates; Behaviour Categories &amp; Actions adds school-specific choices. Student Reports filter and print student information, while Student ID Cards prepare printable IDs. Student Settings controls the fields used on student profiles.</p>
              <p><strong>Status and history:</strong> Use the disabled-students view and available status transitions instead of deleting records when a student leaves. Permanent record deletion is permission-restricted and can remove history; check the selected student and school policy before using it.</p>
              <p><strong>Public admissions:</strong> When enabled, the school’s public admission form accepts applications through a school-specific link. Share it only through school-approved channels. Public submission does not replace checking the application and confirming the correct enrollment.</p>
            </GuideSection>

            <GuideSection id="academics" title="5. Academic structure and attendance">
              <p>Complete academic setup in this order so later pages have valid choices:</p>
              <ol className="space-y-3">
                <Step n={1}>In <strong>Branches</strong>, confirm each campus and its contact details. Branches scope classes, subjects, rooms, and many reports.</Step>
                <Step n={2}>Create the <strong>Academic year</strong> with correct start/end dates and activate it when it is in use. Add <strong>Terms &amp; exams</strong> with the right date ranges.</Step>
                <Step n={3}>Create <strong>Classes</strong> (grade levels), then create year-specific <strong>Class sections</strong> and assign the class teacher and capacity.</Step>
                <Step n={4}>Create <strong>Subjects</strong>, assign them to the intended classes, and select the responsible teacher. Configure optional subjects for electives.</Step>
                <Step n={5}>Add <strong>Classrooms</strong> with actual room capacity. In <strong>Class routine</strong>, choose the active year, section, subject, day, start/end time, and room for each period. Review for conflicts before relying on the timetable.</Step>
                <Step n={6}>Use <strong>Student enrollment</strong> to place students in the correct year and section, and record transfers or progression accurately.</Step>
                <Step n={7}>Set school <strong>Holidays</strong> so staff can interpret the calendar and attendance periods correctly.</Step>
              </ol>
              <h3 className="font-semibold text-slate-900">Take and review daily attendance</h3>
              <ol className="space-y-3">
                <Step n={1}>Open Academics → <strong>Attendance</strong>, select the date and class section, and verify the roster.</Step>
                <Step n={2}>Mark each enrolled student’s attendance status. Add a note when required by the selected status or school policy.</Step>
                <Step n={3}>Save the register and confirm the saved date/section. Correct errors through the authorized attendance workflow.</Step>
                <Step n={4}>Open <strong>Student attendance reports</strong> to filter by branch, class/section, and date range; review totals and individual daily records, then print or save a report if needed.</Step>
              </ol>
              <p>Class rosters, subjects, and routines have print views. Teacher access depends on an active teacher profile linked to the staff login, current assignments, and the selected school. Deleting academic setup may be blocked while records depend on it.</p>
            </GuideSection>

            <GuideSection id="exams" title="6. Examinations and reports">
              <p>Set up examinations after academic years, terms, classes, subjects, and enrollments are ready.</p>
              <ol className="space-y-3">
                <Step n={1}>In <strong>Exam Type</strong>, define the types used by your school.</Step>
                <Step n={2}>In <strong>Exam Setup</strong>, create an exam with the correct year, term, branch, and classes. Add the assessed subjects, maximum marks/components, grading scale, and ranking options. Check the setup before opening it.</Step>
                <Step n={3}>In <strong>Exam Schedule</strong>, set each class/subject assessment date and any other schedule details. Review the schedule with teachers before exam day.</Step>
                <Step n={4}>Open <strong>Issue exam cards</strong> from the examination. Print ID-1/CR80 cards for students whose invoices for the exam year and term have no balance due. A school administrator can approve an exception by recording a reason; the approval is audited and the reason is not printed on the card.</Step>
                <Step n={5}>Open <strong>Exam Attendance</strong> first. Select the exam and subject, mark each student’s attendance (including the supported X/absent and Y/malpractice statuses where appropriate), add notes when required, and save.</Step>
                <Step n={6}>Only after attendance is recorded, open <strong>Marks Register</strong>. Select the same exam, class, and subject; enter each mark within the configured maximum or record the supported status; review totals and students before saving.</Step>
                <Step n={7}>Teachers submit completed subject marks. Authorized reviewers check the register and approve it. Correct any errors through the available return/review steps before results are published.</Step>
                <Step n={8}>A user with result-publishing permission verifies the approved subjects and publishes the examination. Published marks become visible in permitted report cards and portals; treat publication as a final step.</Step>
              </ol>
              <h3 className="font-semibold text-slate-900">Reports, signatures, and analytics</h3>
              <ul className="list-disc space-y-2 pl-6">
                <li><strong>Exams Reports / Report Center:</strong> choose an exam, year, class, and report type. Available views include exam routines, class results, report cards, merit lists, and the tabulation sheet, which compares each student’s marks across subjects. Ranking follows the examination’s ranking configuration.</li>
                <li><strong>Report cards:</strong> open an individual student card or bulk progress cards after the needed results are published. Review attendance, marks, grades, rank, and signatures before printing.</li>
                <li><strong>Report Signatures:</strong> search and filter the teacher directory, upload or replace a teacher’s report signature, and manage school-level report signatures when authorized. Replaced uploads remain available as prior versions.</li>
                <li><strong>Exam Analytics:</strong> choose a report view and filters to compare classes and sections, inspect grade distributions, subject performance, student rankings, attendance coverage, and trends. Export the filtered results where CSV export is offered.</li>
                <li><strong>Teacher Portal:</strong> teachers see assigned assessments and class progress based on their staff-account link, subject assignments, class appointment, and permissions.</li>
              </ul>
              <p>The <strong>Send Marks by SMS</strong> area requires a configured school-approved SMS provider; opening it does not send messages when no gateway is configured. For approved results, attendance changes are restricted; follow the authorized reopening workflow if a correction is required.</p>
            </GuideSection>

            <GuideSection id="staff" title="7. Staff and human resources">
              <p>Use <strong>Human resources</strong> for the staff overview, departments, designations, staff directory, applications, attendance, leave, payroll, reports, and HR settings.</p>
              <ol className="space-y-3">
                <Step n={1}>Create departments and designations to keep staff records consistent.</Step>
                <Step n={2}>Add staff profiles with the correct branch, employee code, job title, contact details, employment type, start date, and any required documents.</Step>
                <Step n={3}>For teachers, ensure the staff profile is set to the teacher personnel role, create/link the academic teacher profile, and assign classes/subjects in Academics. Create or link the login, then assign the Teacher role. A matching name alone is not enough to link a teacher to an account.</Step>
                <Step n={4}>Use the public staff registration link, when enabled, to collect applications. Review them under Staff Applications before creating or activating a staff record.</Step>
                <Step n={5}>Record daily staff attendance and use reports to filter by period, branch, and staff member.</Step>
                <Step n={6}>Configure leave types and entitlements, record requests, and approve or reject them in Leave Management.</Step>
                <Step n={7}>Enter payroll records by pay period, track payment status, and print records or reports where available.</Step>
              </ol>
              <p><strong>Staff directory and settings:</strong> use departments and designations to keep records consistent; staff settings control which profile fields are visible or required. Staff profiles can include employment, contact, emergency contact, qualification, and document details. Deactivate rather than delete a staff profile when preserving history is important.</p>
              <p><strong>Staff accounts and access:</strong> create or link a login only for staff who need system access, enable login where appropriate, and assign the least-privilege school role. Review the account status shown in the Staff Directory and disable access when someone leaves or changes duties.</p>
              <p><strong>Account email/password recovery:</strong> platform operators can open Platform → <strong>Account recovery</strong>, independently verify the requester, correct the login email, and either set a temporary password or issue a one-time setup link. Temporary passwords must be changed before workspace access; setup links expire after 24 hours and work once. Both methods clear active sessions and are audited. No recovery email is sent; share credentials or links only through a verified secure channel. Keep the staff/student profile email up to date separately.</p>
              <p>Payroll stores pay-period records and payment status; it does not calculate tax, deductions, benefits, or take-home pay. Review the values entered before marking a payroll record paid. HR reports are for staff attendance; payroll and leave access depends on permissions.</p>
            </GuideSection>

            <GuideSection id="fees" title="8. Fees and payments">
              <p>Open <strong>Fees</strong> to configure fee groups and types, scholarships/discounts, fee structures, invoices, collections, carry-forward fees, receipts, and reports.</p>
              <ol className="space-y-3">
                <Step n={1}>Confirm branches, classes, academic years, terms, and currencies.</Step>
                <Step n={2}>Create fee groups and fee types. Add discounts or scholarships and assign them to eligible students.</Step>
                <Step n={3}>Create fee structures for the relevant branch/class/year/term and set amounts and due dates.</Step>
                <Step n={4}>Generate invoices for the intended students. Check the fee structure, selected year/term, due date, and student group before generating for a whole class or school.</Step>
                <Step n={5}>Open <strong>Fee Collection</strong>, search for the student or invoice, verify the outstanding balance, record the amount, date, method, and reference, then save and issue the receipt.</Step>
                <Step n={6}>Open the receipt to print it or use the receipt link to verify the payment. If a payment was entered incorrectly, use the authorized reversal workflow and record the reason; do not enter a second payment as a workaround.</Step>
                <Step n={7}>Use fee reports to review collections, balances, discounts, reversals, or overdue amounts. Use <strong>Carry-forward fees</strong> only after checking the source balance and destination period/student.</Step>
              </ol>
              <p>Receipts can be printed and invoice lists can be filtered. Payment reversals and carry-forwards affect financial history, so follow your school’s approval and reconciliation procedures. Parents and students see invoices and recorded receipts where the account is linked. Payment gateway integrations are not included; payments are recorded by staff.</p>
            </GuideSection>

            <GuideSection id="accounts" title="9. Accounts and finance">
              <p>The <strong>Accounts</strong> area provides the chart of accounts, bank/cash accounts, income, expenses, fund transfers, Profit &amp; Loss, and reports.</p>
              <ol className="space-y-3">
                <Step n={1}>Review the default chart of accounts and add or update accounts to match the school’s bookkeeping categories.</Step>
                <Step n={2}>Configure bank or cash accounts, currency, opening balance, and the linked chart account.</Step>
                <Step n={3}>Record other income or an expense with the correct date, currency, chart category, amount, description, reference, and bank/cash account. Attach supporting details according to school policy.</Step>
                <Step n={4}>Submit transactions for review where the approval workflow applies. Reviewers should check the evidence and status before approving or rejecting; approved transactions affect the relevant financial summaries.</Step>
                <Step n={5}>Record fund transfers between configured accounts, verify the source and destination, and check that the amount and currency are correct.</Step>
                <Step n={6}>Use <strong>Profit &amp; Loss</strong> and <strong>Accounts Reports</strong> to select a date range and status, review totals and transaction detail, and print or download available reports.</Step>
              </ol>
              <p>Fee receipts contribute to school financial views. Keep bank-account identifiers and supporting references accurate and reconcile entries with external bank statements. SchoolOS does not connect directly to a bank; account categories and approval practices should follow the school’s accounting policy.</p>
            </GuideSection>

            <GuideSection id="inventory" title="10. Inventory and assets">
              <p>Inventory includes setup catalogs, stock register, stock movements/history, asset records, maintenance records, and reports.</p>
              <ol className="space-y-3">
                <Step n={1}>Create inventory categories, suppliers, and storage locations.</Step>
                <Step n={2}>Add stock items with names/codes, unit, category, supplier, and opening quantity as required. Use the stock register to review current quantities.</Step>
                <Step n={3}>Record incoming stock, issues, and adjustments from <strong>Stock movement</strong>. Select the item and location, enter the quantity and reason/reference, and verify before saving.</Step>
                <Step n={4}>Create durable <strong>Assets</strong> separately from consumable stock. Record each asset’s identifier, details, location, and status; update it when its location changes.</Step>
                <Step n={5}>Use <strong>Asset maintenance</strong> to record service or repair work, dates, cost, and notes against the asset.</Step>
                <Step n={6}>Use Inventory Reports to review stock levels, movements, assets, and maintenance; investigate discrepancies and low-stock items before reordering.</Step>
              </ol>
              <p>Use adjustments to correct a known stock discrepancy and keep a clear reference explaining the change.</p>
            </GuideSection>

            <GuideSection id="library" title="11. Library">
              <ol className="space-y-3">
                <Step n={1}>Create book categories and subjects, then add titles with author, ISBN/identifier, and total copy counts.</Step>
                <Step n={2}>Register students or staff as library members. Confirm the member’s school profile and identifier before issuing material.</Step>
                <Step n={3}>In <strong>Issue / Return Book</strong>, find the member and available title, set the due date, and save the loan.</Step>
                <Step n={4}>Use <strong>All Issued Books</strong> to search active or overdue loans and record a return or renewal using the matching loan row.</Step>
                <Step n={5}>Check the overview for available copies and overdue loans. Use catalog/member/loan filters to investigate issues and keep copies accurate.</Step>
              </ol>
              <p>The Library overview shows catalog and circulation summaries. The Library Portal provides authorized staff with a focused view of circulation, catalog, members, and loan register. Book availability updates as copies are issued and returned.</p>
            </GuideSection>

            <GuideSection id="dormitories" title="12. Dormitories">
              <ol className="space-y-3">
                <Step n={1}>Create dormitories for the correct branch and set any occupancy or gender policy.</Step>
                <Step n={2}>Add rooms and bed capacity, then verify that available capacity matches the actual room.</Step>
                <Step n={3}>Assign an active student to a room or use bulk assignment for a planned group. Check the student and destination carefully.</Step>
                <Step n={4}>Review the residents list and occupancy overview. End an assignment when a student moves out.</Step>
                <Step n={5}>Use dormitory reports to review occupancy and resident records.</Step>
              </ol>
              <p>The Dormitory Portal offers authorized staff a focused view of residents and room assignments. Keep room capacity and resident status current to avoid over-allocation.</p>
            </GuideSection>

            <GuideSection id="portals" title="13. Student, parent, teacher, and finance portals">
              <ul className="list-disc space-y-3 pl-6">
                <li><strong>Student portal:</strong> use Overview for current placement and summaries; My Learning for class/profile information; Class Timetable for weekly periods; Exam Results for published reports; Invoices and Fees / Payment Receipts for recorded charges and payments; My Profile for personal details; Library for loans/catalog; and Attendance for recent records.</li>
                <li><strong>Parent portal:</strong> review My Children, open each linked child’s academic progress, check Fee Invoices, and review Attendance. Children are shown only when the parent account is properly linked to their student records.</li>
                <li><strong>Teacher portal:</strong> use My Classes for subject assignments and appointed classes; Class Register &amp; Attendance to take attendance for appointed classes; Examination Work to open assigned subjects, review submissions, and see class progress when authorized; and My Timetable to view scheduled subject periods and appointed-class schedules.</li>
                <li><strong>Finance portal:</strong> authorized finance staff can review monthly summaries, recent receipts and account activity, fee balances, fee collection/reports, and permitted accounts pages.</li>
                <li><strong>Library and dormitory portals:</strong> authorized staff can use focused circulation or resident views and open related catalog, members, room, and report pages from portal navigation.</li>
              </ul>
              <p>Family visibility is limited to linked student records and examination results appear only after publication. Teacher information is limited to the selected school, the teacher’s linked staff/teacher profile, active assignments, and granted permissions. If a child, class, subject, exam, or timetable item is missing, ask the school administrator to verify the profile link, academic-year status, enrollment, assignment, or class routine rather than using another person’s login.</p>
            </GuideSection>

            <GuideSection id="platform" title="14. Platform operator tasks">
              <p>This area is for trusted SchoolOS platform operators, not ordinary school users. Open <strong>Platform schools</strong> to review signup applications, manage workspaces, and open Account Recovery.</p>
              <ol className="space-y-3">
                <Step n={1}>Open <strong>Platform schools</strong> and search/filter workspaces by pending review, approved, rejected, or archived status.</Step>
                <Step n={2}>Review the school identity and contacts. Approve a legitimate pending application to enable its workspace, or reject it when it should not be activated.</Step>
                <Step n={3}>Edit school details as authorized. Archive a workspace to disable access without deleting tenant data; restore it only after confirming the request.</Step>
                <Step n={4}>Return an approved school to pending review only when access must be paused for a documented review. Check the resulting status before leaving the page.</Step>
                <Step n={5}>Open <strong>Account recovery</strong>, find the account, and independently verify the requester before changing the login email, setting a temporary password, or issuing a one-time setup link.</Step>
                <Step n={6}>Share a temporary password or one-time setup link through an approved secure channel, never in a public comment or shared document. Temporary passwords require a change before workspace access; the platform does not send an email automatically.</Step>
              </ol>
              <p>Platform-admin status does not by itself grant access to a school’s student or financial records. Workspace management and member account recovery are separate: recovery applies to the account across linked schools, while each school continues to manage its own roles and operational records.</p>
            </GuideSection>

            <GuideSection id="account" title="15. Account, search, and everyday tips">
              <ul className="list-disc space-y-3 pl-6">
                <li><strong>Account security:</strong> open Account security to change your password. Use a unique password and contact an administrator if you cannot sign in. Platform account recovery requires an operator to verify you; it does not send an automatic recovery email.</li>
                <li><strong>Workspace search:</strong> use the top-bar search for supported records and modules. Search results respect your school access and link to the matching record or filtered page.</li>
                <li><strong>Tables and filters:</strong> search as you type where available, select filters to narrow a list, and use pagination for larger registers. Some pages provide CSV downloads or print views.</li>
                <li><strong>School profile:</strong> update contact details, currency, timezone, and logo if you have permission. Currency and timezone affect how financial values and dates are presented.</li>
                <li><strong>User logs and system settings:</strong> administrators with the relevant access can review available activity logs and system settings, including student/staff profile field settings and roles.</li>
                <li><strong>Sign out:</strong> use the account menu when finished, especially on a shared computer. Do not leave student or finance records open where others can see them.</li>
              </ul>
              <h3 className="font-semibold text-slate-900">If something is missing or does not work</h3>
              <ul className="list-disc space-y-2 pl-6">
                <li>Confirm you selected the correct school workspace and reporting period.</li>
                <li>Check that the academic year, term, branch, class, subject, and enrollment have been created and are active.</li>
                <li>Ask an administrator to check your role, student/parent account link, or teacher assignment.</li>
                <li>For uploads, use an accepted PDF/JPEG/PNG/WebP file within the 4 MB limit.</li>
                <li>For results missing from family portals, confirm that the results have been published.</li>
                <li>For school signup, remember that a platform operator must approve the application before the workspace opens.</li>
              </ul>
              <p>Features that require external providers may be unavailable until configured. In particular, SMS delivery is disabled without a gateway, payment-provider integrations are not included, and payroll does not calculate tax or take-home pay.</p>
            </GuideSection>

            <footer className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500">
              Need to sign in? <Link className="font-semibold text-violet-700 underline" href="/login">Go to SchoolOS</Link>. For school-specific procedures, ask your administrator; available options depend on your assigned permissions.
            </footer>
          </article>
        </div>
      </div>
      </main>
    </PublicPlatformShell>
  );
}
