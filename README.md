# SchoolOS

A phased school-management foundation built with Next.js, Better Auth, Drizzle ORM, TiDB Cloud, and S3-compatible object storage.

## Current status

The Phase 1 foundation includes responsive sign-in and admin shell, Better Auth email/password with public sign-up disabled, MySQL/TiDB schema and versioned migrations, school memberships and role-permission authorization, a secure non-production administrator seed, school profile editing, audited settings changes, database-backed dashboard counts, and an S3-compatible presigned-upload abstraction.

Phase 2 has started with a tenant-scoped student directory and basic student record creation. Academic structure, teacher and staff management, attendance, examinations, finance, and other operational modules are not implemented yet.

## Requirements

- Node.js 24 and npm.
- A TiDB Cloud database (or compatible MySQL database) with TLS enabled.
- An S3-compatible object-storage bucket when file uploads are introduced.

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

6. Start the app:

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

## Configuration

See `.env.example` for the required variable names. Do not commit `.env` or any credentials. Keep TiDB and object-storage credentials in server-only environment variables; only the app name is public.

The object-storage adapter uses S3-compatible endpoints and stores files outside the application filesystem. Phase 1 defines the adapter and metadata schema; upload routes and feature-specific file validation will be added with the relevant school modules.

## Deployment

### Vercel

- Configure production and preview environment variables separately.
- Use an isolated preview/staging database; preview deployments must not write to real school records.
- Set `DATABASE_URL`, `DATABASE_SSL=true`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_NAME`.
- Run `npm run db:migrate` as an explicit deployment operation before routing traffic to a release. Do not run it during normal application startup.
- Set the Vercel function region near the TiDB region and restrict TiDB network access as appropriate.
- Add S3-compatible storage variables when uploads are enabled.

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
- Database reads and mutations are server-side. School-profile updates require the `school.settings.manage` permission and are audit logged.
- The seed is for a deliberately configured non-production environment only. Never reuse its credentials in production.

## Next phase

Continue Phase 2 by adding academic structure, then extending student records with admission workflows and related guardian, teacher, and staff management. Keep changes incremental and tenant-scoped; apply reviewed Drizzle migrations explicitly in each environment.
