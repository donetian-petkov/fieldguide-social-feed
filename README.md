# Fieldguide

Fieldguide is an educational social feed platform for history, art, books, movies, country knowledge, photography, nature, and curated educational video. The repo is structured as a React-first monorepo with a Fastify API, a worker for ingestion and AI/email jobs, and a shared contract package.

## Workspace layout

```text
apps/
  api/       Fastify API, Prisma schema, auth/session/content endpoints
  web/       Next.js app router frontend
  worker/    BullMQ worker for ingestion, AI enrichment, newsletter jobs
packages/
  shared/    Shared zod schemas, DTOs, constants, and demo fixtures
```

## Planned product scope

- Curated editorial feeds, separate community feed, saved items, albums, comments, shares, and item detail pages.
- EN/BG single-mode and dual-mode titles/summaries.
- Kid, Standard, and Adult content modes, with Kid/Adult transitions protected by account-password verification.
- Admin surfaces for source management, moderation, users, AI provider/model/budget settings, and backend error logs.
- Ask-AI on individual items, AI summaries, AI translation/classification, and opt-in AI newsletters.

## Quick start

1. Copy `.env.example` to `.env`.
2. Start infrastructure:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
npm install
```

4. Generate Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Seed demo data:

```bash
npm run seed
```

6. Start the workspace:

```bash
npm run dev
```

## Notes

- `DEMO_MODE=true` lets the API and web app render with shared fixtures even before MySQL or Redis are wired locally.
- Email, AI, and ingestion providers are configuration-driven and degrade to placeholders when no provider credentials are present.
