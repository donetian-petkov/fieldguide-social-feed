# Fieldguide

Fieldguide is a full-stack educational social feed for history, art, books, movies, country knowledge, photography, nature, and educational video. It ships curated editorial feeds separately from moderated community posts, with EN/BG content modes, saved libraries, albums, flat comments, Ask-AI, newsletters, and an admin console for sources, moderation, users, AI budgets, and logs.

![History feed with pinned educational stories](docs/screenshots/feed-history.png)

## Screenshots

| Feed | Item detail |
| --- | --- |
| ![History feed](docs/screenshots/feed-history.png) | ![Item detail with Ask AI and albums](docs/screenshots/item-detail.png) |

| Community | Admin moderation |
| --- | --- |
| ![Community submission flow](docs/screenshots/community.png) | ![Admin moderation console](docs/screenshots/admin-moderation.png) |

## Stack

- `apps/web`: Next.js App Router, React, MUI, Redux Toolkit + RTK Query, i18next.
- `apps/api`: Fastify, secure cookie sessions, Prisma/MySQL persistence, Pino logs.
- `apps/worker`: BullMQ worker for ingestion, AI enrichment, newsletter selection, and email jobs.
- `packages/shared`: Zod schemas, DTOs, source registry, demo fixtures, and shared AI utilities.

## Implemented Scope

- Curated subject feeds, saved feed, community feed, item detail pages, share links, hidden items, and pinned rails.
- Auth, password recovery, role-based admin access, profiles, settings, protected Kid/Adult mode switching, and per-user preferences.
- Albums with create, rename, delete, cover selection, item removal, and manual ordering.
- Flat comments with author edit windows, admin deletion, and per-item locking.
- RSS, YouTube RSS, and adapter-backed ingestion with dedupe, metadata extraction, AI summary/translation/classification, and worker scheduling.
- Ask-AI per item with content-mode enforcement and provider/model/budget controls.
- Opt-in newsletters with weekly/daily cadence, viewed/saved/hidden preference ranking, AI-assisted item selection, and audit metadata.
- Admin source CRUD/resync/delete, submission review, item pinning/removal/tagging, user role/suspend controls, AI settings, budget status, and error logs.

## Quick Start: Demo Mode

Demo mode is the fastest way to run the full app without MySQL or Redis.

```bash
cp .env.example .env
npm install
npm run build
npm run dev
```

Open:

- Web: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:4000/health](http://localhost:4000/health)

Use `localhost` consistently for the web and API while testing auth. Browser cookies are host-scoped, so mixing `127.0.0.1:3000` with `localhost:4000` can make the app appear signed out even after a successful login.

Seeded demo logins:

```text
alex / fieldguide123
mila / fieldguide123
admin / fieldguide123
```

## Database Mode

Use database mode when validating Prisma/MySQL persistence, Redis queues, ingestion jobs, and worker scheduling.

```bash
cp .env.example .env
# set DEMO_MODE=false in .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Prisma workspace scripts load the repo-root `.env`, so you do not need to duplicate `DATABASE_URL` inside `apps/api/.env`. The Docker MySQL init script creates both `fieldguide` and `fieldguide_shadow`; Prisma uses the shadow database during `migrate dev`.

If you already had a Docker volume from before the shadow database was added, create/grant it once:

```bash
docker exec -i fieldguide-mysql mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS fieldguide_shadow; GRANT ALL PRIVILEGES ON fieldguide_shadow.* TO 'fieldguide'@'%'; FLUSH PRIVILEGES;"
```

Useful service commands:

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

## Verification

```bash
npm test
npm run build
npm run test:e2e
```

When the API and web app are already running, use the web workspace command directly:

```bash
npm run test:e2e -w @edu-feed/web
```

Current automated coverage includes shared schema/source tests, API route tests, worker newsletter-ranking tests, web theme tests, and Playwright flows for auth, password reset, feeds, Ask-AI, settings, albums, saved/hidden state, sharing, admin AI, user management, source CRUD, pinning, moderation, community approval, and comment locking.

## Screenshots

Screenshots are reproducible from the built demo app:

```bash
npm run build
npm run screenshots
```

The capture script starts the built API and web app in demo mode, logs in as seeded users, and writes PNGs to `docs/screenshots`.

## Main Routes

- App: `/`, `/feed/[subject]`, `/item/[slug]`, `/saved`, `/albums/[id]`, `/community`, `/profile/[username]`, `/settings`.
- Admin: `/admin`, `/admin/sources`, `/admin/moderation`, `/admin/users`, `/admin/ai`, `/admin/logs`.
- API: `/v1/auth/*`, `/v1/me`, `/v1/feed`, `/v1/items/:id`, `/v1/albums`, `/v1/submissions`, `/v1/admin/*`.

## Notes

- User-facing failures are toast/alert-level only; stack traces and integration failures are logged server-side and surfaced in admin logs.
- External article/video pages link out to originals and do not republish full scraped bodies; community posts render their own full body.
- Email and AI providers are configuration-driven. Without real credentials, local/demo flows use safe placeholders or budget-aware fallback behavior.
