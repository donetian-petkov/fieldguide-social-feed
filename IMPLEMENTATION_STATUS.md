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

- Complete real moderation/admin edit, delete, and approval workflows beyond the current add, pin, lock, suspend, and resync paths.
- Complete AI provider/model/budget execution beyond the current heuristic enrichment and ledger recording.
- Verify the stack end-to-end against MySQL and Redis.

## Latest completed areas

- Prisma/MySQL-backed API persistence replaced the runtime demo store when `DEMO_MODE=false`.
- Source subjects, feed error state, dedupe keys, and newsletter delivery history are now persisted in Prisma.
- The API now schedules source polling and newsletter jobs through BullMQ.
- The worker now performs persisted RSS ingestion, metadata enrichment, newsletter selection, and delivery logging.
- Admin sources now support adding curated feeds and queueing manual resync jobs from the web UI.
