# SchoolOS

A phased school-management foundation built with Next.js, Better Auth, Drizzle ORM, TiDB Cloud, and private object storage.

## Current status

The staff directory can provision login access using the staff email. New accounts require an administrator-set password of at least 12 characters; matching accounts are reused, and an optional password resets an existing account's password. After enabling login, assign the appropriate role under User Roles. Disabling login access disables the account's membership in this school without deleting the global account.

Payroll reports print only the filtered report; each payroll entry also supports viewing, editing, printing an individual statement, marking it paid, and deleting it.

Admin filter forms should use the shared `SmartFilterForm` component so selection and date filters update results immediately; `SearchableSelect` submits its selected option automatically inside this form. Keep ordinary data-entry forms as standard forms. Paginate every multi-row report with `TablePagination`, preserving active filters in page links.

The Phase 1 foundation includes responsive sign-in and admin shell, Better Auth email/password with public sign-up disabled, MySQL/TiDB schema and versioned migrations, school memberships and role-permission authorization, a secure non-production administrator seed, school profile editing, audited settings changes, database-backed dashboard counts, and private object-storage adapters for Vercel Blob and S3-compatible services.

Phase 2 includes tenant-scoped student and staff directories, admission review, student document uploads, and an academic structure for branches, school years, terms and exam periods, holidays, classes, year-specific streams/sections, capacities, class teachers, theory and practical subjects, compulsory and optional class subjects, teacher assignments, classrooms, and weekly class routines. Academic setup records can be edited in place, with creation and management actions above their corresponding record lists. Class and subject records are branch-scoped; routines validate class, teacher, and room schedule conflicts and can be filtered by branch, class, and section. Student placements, class rosters, promotion, repetition, in-school transfers, transfers out, graduation, and dated enrollment history are recorded as audited academic events. Human Resources includes expanded staff profiles, optional links to existing school accounts, department and designation catalogs, daily attendance, date-range attendance reports, per-staff annual leave entitlements and request approvals, and payroll records with period totals and payment status. Payroll does not calculate tax, deductions, benefits, or take-home pay. The fees module supports fee groups/types, branch/class/year fee structures, one-time and yearly student discounts, invoice generation from enrollments, partial payments, late fines, date/class/section reports, and printable receipts. Fee forms and collection filters have searchable selectors; invoice generation can target a selected student or all eligible students, and the collection list searches student names as you type. Administrator and Accountant roles receive fee-management and payment permissions; external payment-gateway integrations are not included. The library module provides a tenant-scoped book catalog, copy availability, student checkout, returns, due-date renewal, and overdue tracking; the School administrator and Librarian system roles receive library access. Authorized users can create school-specific roles, grant permissions, and assign roles to existing active accounts; linking a staff profile to an account does not create that account or assign its roles. Student attendance, examination results and analytics, accounts, and inventory and assets also have dedicated workflows; guardian relationships and other operational modules are not implemented yet.

Library management also supports branch-aware book details, category and subject catalogs, student membership registration, and searchable/filterable loan history. Printable examination reports include any configured, privately stored headteacher, class-teacher, and subject-teacher signature images uploaded from the report-signatures settings page.

## Requirements

- Node.js 24 and npm.
- A TiDB Cloud database (or compatible MySQL database) with TLS enabled.
- A private Vercel Blob store or an S3-compatible object-storage bucket for student documents.

## Local setup (PowerShell)

1. Install dependencies and create a local environment file:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

2. Set `DATABASE_URL` in `.env` to the TiDB Cloud connection URL. URL-encode special characters in the username and password. TLS is enabled by default; only set `DATABASE_SSL=false` for an explicitly local, non-TLS MySQL instance.

3. Generate an authentication secret and place it in `BETTER_AUTH_SECRET`:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Set `BETTER_AUTH_URL=http://localhost:3000` for local development.

4. Apply the checked-in migrations:

   ```powershell
   npm run db:migrate
   ```

   When the Drizzle schema changes, generate and review a migration before applying it:

   ```powershell
   npm run db:generate
   npm run db:migrate
   ```

   Never use schema push or automatic application-startup migrations against production.

5. Set `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (at least 12 characters), and `INITIAL_SCHOOL_NAME`. Set `ALLOW_INITIAL_ADMIN_SEED=true` only while provisioning a non-production environment, then turn it off or remove it.

   ```powershell
   npm run db:seed
   ```

   The seed refuses to run when `NODE_ENV=production`. It creates an administrator account, the school, initial roles, and the required permission assignments. It does not print the password.

6. To populate an empty development school with clearly labeled sample academic, student, teacher, and staff records:

   ```powershell
   $env:ALLOW_DEMO_DATA_SEED = "true"
   npm run db:seed-demo
   Remove-Item Env:\ALLOW_DEMO_DATA_SEED
   ```

   Demo seeding is blocked in production and on Vercel, runs against a local database by default, adds visibly labeled sample records without changing existing records, and is safe to repeat. Only set `ALLOW_DEMO_SEED_REMOTE=true` when intentionally targeting a separate non-production remote database.

7. To add fee-module test records to the existing `SchoolOS Demo School` enrollments:

   ```powershell
   $env:ALLOW_FEE_DEMO_SEED = "true"
   $env:ALLOW_DEMO_SEED_REMOTE = "true"
   npm run db:seed-fees-demo
   Remove-Item Env:\ALLOW_FEE_DEMO_SEED
   Remove-Item Env:\ALLOW_DEMO_SEED_REMOTE
   ```

   Fee demo seeding is blocked in production and on Vercel, requires explicit opt-in, and only permits remote writes to the verified SchoolOS demo database. It reuses existing eligible students, is safe to repeat, and creates visibly labeled test invoices and payments; the seeded payments are not real money received.

8. To add clearly labeled accounts and inventory examples to `SchoolOS Demo School`:

   ```powershell
   $env:ALLOW_ACCOUNTS_INVENTORY_DEMO_SEED = "true"
   $env:ALLOW_DEMO_SEED_REMOTE = "true"
   npm run db:seed-accounts-inventory-demo
   Remove-Item Env:\ALLOW_ACCOUNTS_INVENTORY_DEMO_SEED
   Remove-Item Env:\ALLOW_DEMO_SEED_REMOTE
   ```

   This seed is blocked in production and on Vercel, requires explicit opt-in, and restricts remote writes to the verified SchoolOS demo database. It is safe to repeat and marks every sample record as test-only; the example income and expenses are not real transactions and the sample stock is not a real count.

9. To add clearly labeled books, categories, subjects, a sample member, and loan-history examples to `SchoolOS Demo School`:

   ```powershell
   $env:ALLOW_LIBRARY_DEMO_SEED = "true"
   $env:ALLOW_DEMO_SEED_REMOTE = "true"
   npm run db:seed-library-demo
   Remove-Item Env:\ALLOW_LIBRARY_DEMO_SEED
   Remove-Item Env:\ALLOW_DEMO_SEED_REMOTE
   ```

   This seed is blocked in production and on Vercel, requires explicit opt-in, and restricts remote writes to the verified SchoolOS demo database. Sample library records are marked `DEMO TEST`, use an existing demo-school student for the sample membership, and do not modify any other student information.

10. Start the app:

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

Student documents and profile photos are stored outside the application filesystem. Configure a private Vercel Blob store (providing `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` with Vercel OIDC) or all five `OBJECT_STORAGE_*` variables for S3-compatible storage. Documents accept PDF, JPEG, PNG, and WebP; profile photos accept JPEG, PNG, and WebP. Files are limited to 4 MB each. Private downloads are served through authenticated application routes.

## Deployment

### Vercel

- Configure production and preview environment variables separately.
- Use an isolated preview/staging database; preview deployments must not write to real school records.
- Set `DATABASE_URL`, `DATABASE_SSL=true`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_NAME`.
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

- Better Auth manages password hashing and secure sessions. Rate limiting is database-backed; public sign-up is disabled.
- School context is resolved from the signed-in user’s active membership, not from browser-supplied tenant identifiers.
- Database reads and mutations are server-side. School-profile updates require the `school.settings.manage` permission; staff and HR workflows require `school.settings.manage` or `staff.manage` and are school-scoped, with changes audit logged.
- The seed is for a deliberately configured non-production environment only. Never reuse its credentials in production.

## Next phase

Continue Phase 2 with richer student profiles, guardian relationships, staff account provisioning, attendance, and examination workflows. Keep changes incremental and tenant-scoped; apply reviewed Drizzle migrations explicitly in each environment.
