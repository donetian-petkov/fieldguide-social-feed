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

- Replace demo runtime storage with Prisma/MySQL-backed persistence.
- Complete real source ingestion and source administration flows.
- Complete real moderation/admin persistence flows.
- Complete AI provider/model/budget execution beyond placeholders.
- Complete newsletter persistence and delivery.
- Verify the stack end-to-end against MySQL and Redis.
