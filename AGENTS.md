<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quick-search convention

Quick search is required for new modules. Use `AdminDataTable` for searchable client-side registers and `SmartFilterForm` for server-filtered pages; text inputs update results while typing, and filter selections apply immediately. Add permission-checked, school-scoped record results to `src/app/admin/workspace-search-actions.ts` so the workspace search can find important records in the module. Include the fields users identify records by (such as names, codes, and reference numbers), preserve filters in result links, and add or update focused tests when search behavior changes.
