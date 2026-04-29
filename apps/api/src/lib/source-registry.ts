import type { PrismaClient } from '@prisma/client';

import { DEFAULT_SOURCE_REGISTRY } from '@edu-feed/shared';

const DEFAULT_SOURCE_POLL_INTERVAL_SEC = 3600;

export async function ensureDefaultSourceRegistry(prisma: PrismaClient) {
  for (const source of DEFAULT_SOURCE_REGISTRY) {
    const existing = await prisma.source.findUnique({
      where: {
        id: source.id
      },
      include: {
        feeds: true
      }
    });
    const nextStatus = existing?.status === 'paused' ? 'paused' : source.status;

    if (!existing) {
      await prisma.source.create({
        data: {
          id: source.id,
          name: source.name,
          slug: source.slug,
          iconUrl: source.iconUrl,
          siteUrl: source.siteUrl,
          description: source.description,
          subjectsJson: JSON.stringify(source.subjects),
          language: source.language,
          defaultAudience: source.defaultAudience,
          sourceType: source.sourceType,
          status: source.status,
          feeds: {
            create: {
              kind: source.kind,
              feedUrl: source.feedUrl,
              pollIntervalSec: DEFAULT_SOURCE_POLL_INTERVAL_SEC
            }
          }
        }
      });
      continue;
    }

    await prisma.source.update({
      where: {
        id: source.id
      },
      data: {
        name: source.name,
        slug: source.slug,
        iconUrl: source.iconUrl,
        siteUrl: source.siteUrl,
        description: source.description,
        subjectsJson: JSON.stringify(source.subjects),
        language: source.language,
        defaultAudience: source.defaultAudience,
        sourceType: source.sourceType,
        status: nextStatus
      }
    });

    const primaryFeed = existing.feeds[0];
    if (primaryFeed) {
      await prisma.sourceFeed.update({
        where: {
          id: primaryFeed.id
        },
        data: {
          kind: source.kind,
          feedUrl: source.feedUrl,
          pollIntervalSec:
            primaryFeed.pollIntervalSec < DEFAULT_SOURCE_POLL_INTERVAL_SEC
              ? DEFAULT_SOURCE_POLL_INTERVAL_SEC
              : primaryFeed.pollIntervalSec
        }
      });
    } else {
      await prisma.sourceFeed.create({
        data: {
          sourceId: source.id,
          kind: source.kind,
          feedUrl: source.feedUrl,
          pollIntervalSec: DEFAULT_SOURCE_POLL_INTERVAL_SEC
        }
      });
    }
  }
}
