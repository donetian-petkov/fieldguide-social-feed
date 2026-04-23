# Implementation Status

## Working rule

Do not stop at a scaffold, mock, or partially wired milestone.

Keep implementing until one of these is true:

1. The planned feature area is fully implemented end-to-end.
2. There is a real external blocker that cannot be solved locally, such as missing credentials, unavailable infrastructure, or required approval.
3. The user explicitly redirects or stops the work.

## Current expectation

The project is **not complete** while any major product area is still demo-backed or scaffolded.

## Remaining major areas

- No unresolved major product areas remain from the implementation plan.
- The next non-feature priority is broadening browser-level end-to-end coverage beyond the initial smoke flows.

## Latest completed areas

- Provider-backed AI execution now powers Ask-AI, ingestion enrichment, translation/classification, and newsletter summaries with budget-aware fallback plus real usage ledger entries.
- Prisma/MySQL-backed API persistence replaced the runtime demo store when `DEMO_MODE=false`.
- Source subjects, feed error state, dedupe keys, and newsletter delivery history are now persisted in Prisma.
- The API now schedules source polling and newsletter jobs through BullMQ.
- The worker now performs persisted RSS ingestion, metadata enrichment, newsletter selection, and delivery logging.
- Admin sources now support adding curated feeds and queueing manual resync jobs from the web UI.
- Admin moderation now supports submission approval/rejection, comment deletion, item removal/restoration, and comment locking from the web UI.
- Approved submissions now materialize into community feed/profile content instead of stopping at a pending queue record.
- End-to-end runtime verification now runs successfully against live MySQL and Redis with database mode enabled.
- Admin sources now support editing plus pause/resume state that the worker respects during ingestion.
- Admin AI configuration is now editable from the web UI, including provider, model, and budget controls.
- Admin moderation now exposes article pinning actions from the web UI.
- Keyboard shortcuts are now wired in the shell for help, refresh, top, subject navigation, saved/community navigation, and Ask-AI focus/open.
- Users can now create albums from the settings UI and add items into albums from item pages.
- The community page now includes a submission form for moderated links and rich posts.
- The auth UI now exposes forgot-password and reset-password flows against the live API routes.
- Albums now support detail loading, rename/edit, deletion, cover selection, item removal, and manual reordering from the web UI.
- Comments now support author-side editing within a bounded post window, with API enforcement and item-page UI support.
- Newsletter cadence is now persisted per user, synced into BullMQ scheduling, reflected during worker bootstrap, and exposed in the settings UI.
- Settings now expose interface language, theme mode, font family, font size, newsletter cadence, and Ask-AI preference controls, and theme-related settings now apply through the app shell.
- Admin sources now support deletion in both demo and Prisma-backed modes, including cleanup of scheduled polling jobs.
- The main feed layout now uses a pinned-story side rail on large screens plus sticky mobile refresh/top actions.
- The seeded launch source registry now covers the planned history, art, books, movies, country-knowledge, photography, nature, and video source set more broadly, with adapter-backed sources seeded in paused state until their custom ingestors are enabled.
- Admin user management now supports role changes from the web UI, with backend protection against removing the last admin account.
- Item detail requests now record per-user view history, and newsletter ranking now uses viewed, saved, and hidden subjects/tags while excluding already seen items.
- Newsletter item selection is now AI-assisted against unseen candidates, with budget-aware fallback to the deterministic ranking path.
- Ask-AI now respects the per-user Ask-AI setting and narrows responses based on the signed-in reader's content mode.
- Feed cards now open the detail page when the card surface itself is activated, while preserving the existing inline controls.
- Worker newsletter ranking logic now has executable tests covering preference weighting, seen-item exclusion, and kid-mode filtering.
- AI artifact audit metadata is now persisted on content items and translations, exposed through the item DTO, and surfaced on the item page when available.
- Newsletter deliveries now persist AI audit metadata for both AI-assisted item selection and AI-generated digest copy.
- Worker scheduling now excludes the internally managed community source from external polling, and manual ingestion of that source now short-circuits safely instead of erroring.
- Geography Now now uses the official YouTube channel RSS feed instead of a paused custom placeholder, closing the last launch-registry educational ingest gap.
- Shared package tests now validate seeded registry coverage and schema contracts, and web tests now validate theme preset generation plus settings-driven font overrides.
- API tests now cover auth/session cookies, item-view recording, newsletter schedule syncing, protected mode switching, admin access plus source scheduling, and approved community submission propagation into feed/profile routes through an injected Fastify app factory.
- Live database-backed verification now passes with MySQL and Redis running locally, including the newsletter audit schema sync and the worker fix that clears stale community-source error status on manual resync.
- Playwright browser coverage now verifies login/help, password recovery/reset, article-scoped Ask-AI, settings album creation with protected-mode switching, album detail metadata plus cover changes, saved-feed persistence after saving, per-user hide persistence after refresh, share-link copying, live admin dashboard access, admin AI settings edits, admin item removal/restoration visibility, admin user role changes including suspend/restore, admin source CRUD/resync, community submission approval propagation, and admin comment-lock enforcement against the running app.
