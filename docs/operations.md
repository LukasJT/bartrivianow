# Operations

## Run the pilot

Install Node.js 24. Run npm ci, npm run check:catalog, npm test, and npm run build. Use npm run preview for static routes plus the local Worker on port 8787. npm run dev runs Astro alone and is useful while editing pages.

The browser loads a small public catalog snapshot and computes current matches with the same rules as the Worker API. It keeps exact device location in memory. Static pages retain an agenda when JavaScript is unavailable. The map loads on demand. Use the list or a venue’s OpenStreetMap link if the tile provider is unavailable.

Display ads request at most one creative per eligible page. The directory and regional pages choose the widest banner that fits. Venue and event pages use a 300×250 placement below the content. The ad frame blocks popups and top-level navigation. Requests are enabled on bartrivianow.com and www.bartrivianow.com. Verify a live impression after deploying to the custom domain.

## Credentials and deployment

The public GitHub Pages deployment builds from main and refreshes its dated pages daily. Its custom domain is bartrivianow.com. It serves the public catalog, search, maps and calendar downloads. Private corrections and the Worker API require a separate backend.

Use the Free plan in the existing Cloudflare account. Authenticate with Wrangler as the account owner or use a narrowly scoped deployment credential configured outside the repo. Run npx wrangler deploy --dry-run before a real deploy, then npx wrangler deploy. Verify the workers.dev URL and the smoke flow before attaching the apex custom domain. Review existing DNS entries first and preserve mail, TXT verification and unrelated records. Configure the www redirect as a separate step.

For durable corrections, create a Supabase Free project, apply the migration under supabase/migrations, and set SUPABASE_URL, SUPABASE_SERVER_KEY, and a high-entropy ADMIN_TOKEN as Wrangler secrets. An admin opens /admin/ and enters the token for the session. Use a different token between preview and production. Never store credentials in a GitHub issue or in a public repository. The free pilot can browse and search before database setup. The form correctly returns unavailable until private storage and admin configuration are connected.

Apply the initial SQL migration in the Supabase SQL editor or through Supabase CLI. Check the catalog, then generate a reviewed seed/refresh transaction with node tools/export-sql.ts. Pipe it to a trusted PostgreSQL client or save it outside Git if needed. The migration's protected search_radius function performs the PostGIS radius/date query. The pilot Worker currently searches the snapshot. Switching production discovery to the SQL projection is a later scaling step.

## Review and update data

1. Make a copy of src/data/catalog.json outside the public tree and add or correct evidence-backed records.
2. Run node tools/catalog.ts stage PATH then node tools/catalog.ts review. Confirm every changed field against its source.
3. Run node tools/catalog.ts approve. Verify git diff, then run the checks and open a PR.
4. Rebuild and deploy. Confirm the same correction appears in the public search and detail pages. Resolve the moderation report after verifying publication.

A dated holiday cancellation belongs in exceptions with the original date, evidence and cancelled=true. A date-specific move uses movedTo and optionally time. A long-term schedule change belongs in series. A source link or fetch success by itself does not renew evidence. For an unverified old schedule, let validUntil expire or remove the claim from the next approved catalog. The current SQL export preserves old series, so disable retired SQL records before activating database-backed search.

Source health currently reports manual review due dates. The weekly GitHub job runs on standard public runners. Add automated adapters only for a registered source with documented access and reuse conditions. Keep discovery stages bounded, preserve the last valid catalog on a source failure, and never auto-publish unreviewed extraction.

## Free limits and maintenance

The pilot requires no paid services. Cloudflare Worker API and assets have separate quotas. Use the Static Assets path for ordinary page requests and limit API routes. Supabase corrections are capped at 4 per client and 60 total per rolling day. The key-derived rate-limit fingerprint is private. Regularly remove old reports according to the privacy policy and retain only reports needed for review. Avoid personally identifying details in public evidence and submission text.

Watch Worker request limits, database egress/storage and static file count. Review recent sources every week and inspect free quotas before extending coverage. GitHub schedules can be delayed, so manually run the source report when needed. If Supabase is paused, reactivate it through its dashboard before reopening corrections.

For recovery, record the Cloudflare version and the reviewed Git commit for each live release. Roll back the deployment or rebuild from the last known-good commit if a release damages static pages. Export private reports and database state with the owner's PostgreSQL client to encrypted local storage. Test restoration in an isolated database before depending on the backup. Keep private backups out of Actions artifacts and Git.

## Current pilot boundaries

Manual source review and static publication are active in the repository. Hosted reporting, the database migration on a live PostGIS instance, a Cloudflare custom domain, routine automation, and regional operations need account setup and launch verification. The first pilot does not assert full municipal coverage, operator agreements or individual confirmation of recurring dates.
