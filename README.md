# SchoolOS

A phased school-management foundation built with Next.js, Supabase Auth, Drizzle ORM, TiDB Cloud, and private object storage.

## Current status

The staff directory can provision login access using the staff email. New accounts require an administrator-set password of at least 12 characters; matching accounts are reused, and an optional password resets an existing account's password. After enabling login, assign the appropriate role under User Roles. Disabling login access disables the account's membership in this school without deleting the global account.

Payroll reports print only the filtered report; each payroll entry also supports viewing, editing, printing an individual statement, marking it paid, and deleting it.

Admin filter forms should use the shared `SmartFilterForm` component so selection and date filters update results immediately; `SearchableSelect` submits its selected option automatically inside this form. Keep ordinary data-entry forms as standard forms. Paginate every multi-row report with `TablePagination`, preserving active filters in page links.

The Phase 1 foundation includes responsive Supabase email/password sign-in and admin shell, MySQL/TiDB schema and versioned migrations, school memberships and role-permission authorization, a secure non-production administrator seed, school profile editing, audited settings changes, database-backed dashboard counts, and private object-storage adapters for Vercel Blob and S3-compatible services.

Phase 2 includes tenant-scoped student and staff directories, admission review, student document uploads, and an academic structure for branches, school years, terms and exam periods, holidays, classes, year-specific streams/sections, capacities, class teachers, theory and practical subjects, compulsory and optional class subjects, teacher assignments, classrooms, and weekly class routines. Academic setup records can be edited in place, with creation and management actions above their corresponding record lists. Class and subject records are branch-scoped; routines validate class, teacher, and room schedule conflicts and can be filtered by branch, class, and section. Student placements, class rosters, promotion, repetition, in-school transfers, transfers out, graduation, and dated enrollment history are recorded as audited academic events. Human Resources includes expanded staff profiles, optional links to existing school accounts, department and designation catalogs, daily attendance, date-range attendance reports, per-staff annual leave entitlements and request approvals, and payroll records with period totals and payment status. Payroll does not calculate tax, deductions, benefits, or take-home pay. The fees module supports fee groups/types, branch/class/year fee structures, one-time and yearly student discounts, invoice generation from enrollments, partial payments, late fines, date/class/section reports, and printable receipts. Fee forms and collection filters have searchable selectors; invoice generation can target a selected student or all eligible students, and the collection list searches student names as you type. Administrator and Accountant roles receive fee-management and payment permissions; external payment-gateway integrations are not included. The library module provides a tenant-scoped book catalog, copy availability, student checkout, returns, due-date renewal, and overdue tracking; the School administrator and Librarian system roles receive library access. The Users module provides a school-scoped account directory and role/permission management at `/admin/users`; the prior user-roles settings route redirects there. Authorized users can create school-specific roles, grant permissions, and assign roles to existing active accounts; linking a staff profile to an account does not create that account or assign its roles. Teacher, student, and parent portals show assigned teaching data or student/guardian data associated with the signed-in email in the current school; portals limit exam results to published marks. Parent portal access uses the student's guardian email field. Explicit guardian/account linking and student/parent self-service account registration are not implemented. Student attendance, examination results and analytics, accounts, and inventory and assets also have dedicated workflows.

Library management also supports branch-aware book details, category and subject catalogs, student membership registration, and searchable/filterable loan history. Printable examination reports include any configured, privately stored headteacher, class-teacher, and subject-teacher signature images uploaded from the report-signatures settings page.

## Multi-school hosting

SchoolOS supports multiple schools in one Vercel deployment and one MySQL/TiDB database, using the existing school-scoped schema. The `/signup` flow is rate-limited by client IP, validates account ownership when reusing an existing email, and provisions a pending school, its first administrator, main campus, standard roles, permissions, chart of accounts, and an audit record in one transaction. The new workspace stays inaccessible until a configured platform admin approves it. School selection and switching are limited to active memberships in approved, non-archived schools; a browser cookie is only a selection hint and is validated against the signed-in user's memberships on every request. The separate `/platform/schools` operator area is restricted to emails listed in `PLATFORM_ADMIN_EMAILS`.

Platform admins can approve or reject signup applications, edit school contact details, and archive or restore workspaces. They can also return an existing approved school to pending review, which disables access until re-approved. Archiving disables school access without deleting tenant data. Platform admins can also create workspaces directly; those are approved immediately. Existing schools remain active during the migration; use “Require review” for any legacy workspace that needs approval. Platform-admin status alone does not allow editing tenant records. Cross-school data access requires an active membership in that school and the corresponding school-level permissions; normal school queries are scoped to the selected membership. Apply schema changes with `npm run db:migrate` before deploying a release that adds a database migration.

Set `MULTI_SCHOOL_ENABLED=true` in the server environment to enable school signup, selection, and switching. Configure a comma-separated `PLATFORM_ADMIN_EMAILS` allowlist for trusted operators who review and manage schools; this allowlist does not grant access to tenant records. For a reversible single-school mode, set `MULTI_SCHOOL_ENABLED=false` and `DEFAULT_SCHOOL_PUBLIC_ID` to the public ID of the school to keep active. No school or tenant data is deleted; re-enabling the flag restores the memberships and switching capability. New-school provisioning is disabled while the feature flag is false.

The school approval and archive workflow adds migration `0052_fuzzy_mach_iv.sql`; apply migrations to the target database before deploying. Keep Vercel preview deployments on a separate staging database, and monitor the aggregate MySQL connection budget across serverless instances rather than treating the per-instance pool limit as a global limit.

## Requirements

- Node.js 24 and npm.
- A TiDB Cloud database (or compatible MySQL database) with TLS enabled.
- A Supabase project with Email enabled under Authentication providers.
- A private Vercel Blob store or an S3-compatible object-storage bucket for student documents.

## Local setup (PowerShell)

1. Install dependencies and create a local environment file:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

2. Set `DATABASE_URL` in `.env` to the TiDB Cloud connection URL. URL-encode special characters in the username and password. TLS is enabled by default; only set `DATABASE_SSL=false` for an explicitly local, non-TLS MySQL instance.

3. Configure Supabase Auth without moving application data: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project API settings, and set `SUPABASE_SECRET_KEY` as a server-only secret key. Keep public signups disabled in Supabase; SchoolOS provisions Auth identities only after checking for an active account in TiDB. Existing password hashes are checked in TiDB at first password sign-in, migrated to Supabase Auth, then cleared from TiDB. The secret key provisions Auth identities and must never use a `NEXT_PUBLIC_` name.

   Configure Supabase Email OTP by editing the Magic Link email template to include `{{ .Token }}`. Configure the Site URL and allowed redirect URLs for local development and deployed SchoolOS origins, including `/auth/callback`. For Google sign-in, create a Web OAuth client in Google Cloud, add the Supabase Auth callback URL shown on the Supabase Google provider page as an authorized redirect URI, then enter the Google Client ID and Client Secret in Supabase Auth > Providers > Google. SchoolOS asks the server to verify the account email exists in TiDB before starting either email-code or Google sign-in; the callback also checks that the Google identity maps to an active SchoolOS account.

   Set up custom SMTP under Supabase Auth settings before sending codes to general users. Supabase's default sender is limited to organization team addresses and low send rates. Put the three Supabase API values in `.env.local` for local development and in the deployment environment. Supabase stores authentication identities and sessions; school records, roles, memberships, and permissions stay in TiDB.

4. Set `BETTER_AUTH_URL=http://localhost:3000` for local development and account setup links. Supabase owns sign-in sessions; a legacy password hash stays in TiDB until that account's first sign-in migrates it.

5. Apply the checked-in migrations:

   ```powershell
   npm run db:migrate
   ```

   When the Drizzle schema changes, generate and review a migration before applying it:

   ```powershell
   npm run db:generate
   npm run db:migrate
   ```

   Never use schema push or automatic application-startup migrations against production.

6. Set `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (at least 12 characters), and `INITIAL_SCHOOL_NAME`. Set `ALLOW_INITIAL_ADMIN_SEED=true` only while provisioning a non-production environment, then turn it off or remove it.

   ```powershell
   npm run db:seed
   ```

   The seed refuses to run when `NODE_ENV=production`. It creates an administrator account, the school, initial roles, and the required permission assignments. It does not print the password.

7. To populate an empty development school with clearly labeled sample academic, student, teacher, and staff records:

   ```powershell
   $env:ALLOW_DEMO_DATA_SEED = "true"
   npm run db:seed-demo
   Remove-Item Env:\ALLOW_DEMO_DATA_SEED
   ```

   Demo seeding is blocked in production and on Vercel, runs against a local database by default, adds visibly labeled sample records without changing existing records, and is safe to repeat. Only set `ALLOW_DEMO_SEED_REMOTE=true` when intentionally targeting a separate non-production remote database.

8. To add fee-module test records to the existing `SchoolOS Demo School` enrollments:

   ```powershell
   $env:ALLOW_FEE_DEMO_SEED = "true"
   $env:ALLOW_DEMO_SEED_REMOTE = "true"
   npm run db:seed-fees-demo
   Remove-Item Env:\ALLOW_FEE_DEMO_SEED
   Remove-Item Env:\ALLOW_DEMO_SEED_REMOTE
   ```

   Fee demo seeding is blocked in production and on Vercel, requires explicit opt-in, and only permits remote writes to the verified SchoolOS demo database. It reuses existing eligible students, is safe to repeat, and creates visibly labeled test invoices and payments; the seeded payments are not real money received.

9. To add clearly labeled accounts and inventory examples to `SchoolOS Demo School`:

   ```powershell
   $env:ALLOW_ACCOUNTS_INVENTORY_DEMO_SEED = "true"
   $env:ALLOW_DEMO_SEED_REMOTE = "true"
   npm run db:seed-accounts-inventory-demo
   Remove-Item Env:\ALLOW_ACCOUNTS_INVENTORY_DEMO_SEED
   Remove-Item Env:\ALLOW_DEMO_SEED_REMOTE
   ```

   This seed is blocked in production and on Vercel, requires explicit opt-in, and restricts remote writes to the verified SchoolOS demo database. It is safe to repeat and marks every sample record as test-only; the example income and expenses are not real transactions and the sample stock is not a real count.

10. To add clearly labeled books, categories, subjects, a sample member, and loan-history examples to `SchoolOS Demo School`:

   ```powershell
   $env:ALLOW_LIBRARY_DEMO_SEED = "true"
   $env:ALLOW_DEMO_SEED_REMOTE = "true"
   npm run db:seed-library-demo
   Remove-Item Env:\ALLOW_LIBRARY_DEMO_SEED
   Remove-Item Env:\ALLOW_DEMO_SEED_REMOTE
   ```

   This seed is blocked in production and on Vercel, requires explicit opt-in, and restricts remote writes to the verified SchoolOS demo database. Sample library records are marked `DEMO TEST`, use an existing demo-school student for the sample membership, and do not modify any other student information.

11. Start the app:

   ```powershell
   npm run dev
   ```

   Visit `http://localhost:3000`. New account registration is disabled; sign in using the seeded administrator account.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the local development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm test` | Run unit tests |
| `npm run build` | Create the production build |
| `npm run db:generate` | Generate a version-controlled Drizzle migration |
| `npm run db:migrate` | Apply migrations explicitly |
| `npm run db:seed` | Provision initial non-production school administrator |
| `npm run db:seed-demo` | Add clearly labeled sample academic, student, teacher, and staff data |
| `npm run db:seed-fees-demo` | Add clearly labeled test fees to existing demo students |
| `npm run db:seed-accounts-inventory-demo` | Add clearly labeled accounts and inventory workflow examples |

## Configuration

See `.env.example` for the required variable names. Do not commit `.env` or any credentials. Keep TiDB and object-storage credentials in server-only environment variables; only the app name is public.

Student documents and profile photos are stored outside the application filesystem. Configure a private Vercel Blob store (providing `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` with Vercel OIDC), or configure all five `OBJECT_STORAGE_*` variables for S3-compatible storage such as Cloudflare R2. A complete S3-compatible configuration takes precedence over Vercel Blob; a partial configuration fails explicitly. For R2, set `OBJECT_STORAGE_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`, `OBJECT_STORAGE_REGION` to `auto`, and use a private bucket with a bucket-scoped object read/write API token. Documents accept PDF, JPEG, PNG, and WebP; profile photos accept JPEG, PNG, and WebP. Files are limited to 4 MB each. Private downloads are served through authenticated application routes.

To migrate an existing Vercel Blob store to R2, configure the source Vercel Blob credentials and all five R2 `OBJECT_STORAGE_*` variables in `.env.local`. The migration command first performs a read-only count and size check; pass `-- --execute` to copy blobs while preserving their existing keys. The script never deletes source blobs, so verify uploads and downloads before removing the Vercel Blob credentials or store.

## Deployment

### Vercel

- Configure production and preview environment variables separately.
- Use an isolated preview/staging database; preview deployments must not write to real school records.
- Set `DATABASE_URL`, `DATABASE_SSL=true`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`.
- For public school signup and multi-school production, set `MULTI_SCHOOL_ENABLED=true`. Set `PLATFORM_ADMIN_EMAILS` only if trusted staff need platform-wide school management; keep that allowlist small.
- Run `npm run db:migrate` as an explicit deployment operation before routing traffic to a release. Do not run it during normal application startup.
- Set the Vercel function region near the TiDB region and restrict TiDB network access as appropriate.
- Connect a private Vercel Blob store to the project, or configure S3-compatible storage variables when uploads are enabled.

### Node.js or Docker

The application uses a standard Node.js production server and Next.js standalone output:

```powershell
npm run build
npm run start
```

Build a Docker image with `docker build -t schoolos .`. Provide the same production environment variables when starting the container. Apply database migrations separately before rollout.

## Security notes

- Supabase Auth manages email/password verification and secure sessions; direct Supabase sign-up is disabled. School creation is handled through the separate rate-limited `/signup` flow.
- School owner signup is rate-limited and creates unverified-email accounts because no email-delivery provider is configured. Users should register with an email they control; do not rely on email-based account recovery until verification and recovery email delivery are configured.
- School context is resolved from the signed-in user’s active membership, not from browser-supplied tenant identifiers.
- Database reads and mutations are server-side. School-profile updates require the `school.settings.manage` permission; staff and HR workflows require `school.settings.manage` or `staff.manage` and are school-scoped, with changes audit logged.
- The seed is for a deliberately configured non-production environment only. Never reuse its credentials in production.

## Next phase

Continue Phase 2 with richer student profiles, guardian relationships, staff account provisioning, attendance, and examination workflows. Keep changes incremental and tenant-scoped; apply reviewed Drizzle migrations explicitly in each environment.
