import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import {
  DEMO_AI_CONFIG,
  DEMO_AI_USAGE,
  DEMO_ALBUMS,
  DEMO_COMMENTS,
  DEMO_ERROR_LOGS,
  DEMO_ITEMS,
  DEMO_PINNED_ITEMS,
  DEMO_SOURCES,
  DEMO_SUBMISSIONS,
  DEMO_USERS
} from '@edu-feed/shared';

const prisma = new PrismaClient();

async function main() {
  await prisma.albumItem.deleteMany();
  await prisma.album.deleteMany();
  await prisma.savedItem.deleteMany();
  await prisma.hiddenItem.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.contentTag.deleteMany();
  await prisma.contentTranslation.deleteMany();
  await prisma.pinnedSlot.deleteMany();
  await prisma.aiUsageLedger.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.sourceFeed.deleteMany();
  await prisma.source.deleteMany();
  await prisma.modeSwitchAudit.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.systemErrorEvent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.aiConfig.deleteMany();

  const userIds = new Map<string, string>();

  for (const user of DEMO_USERS) {
    const created = await prisma.user.create({
      data: {
        username: user.username,
        email: `${user.username}@example.com`,
        passwordHash: await argon2.hash('fieldguide123'),
        role: user.role
      }
    });
    userIds.set(user.username, created.id);
    await prisma.userSettings.create({
      data: {
        userId: created.id,
        displayName: user.displayName,
        language: user.language,
        contentLanguageMode: user.contentLanguageMode,
        vibePreset: user.vibePreset,
        fontFamily: user.fontFamily,
        fontScale: user.fontScale,
        imageMode: user.imageMode,
        themeMode: user.themeMode,
        contentMode: user.contentMode,
        newsletterEnabled: user.newsletterEnabled,
        askAiEnabled: user.askAiEnabled,
        protectedModeEnabled: user.protectedModeEnabled
      }
    });
  }

  const extraUsernames = ['mila'];
  for (const username of extraUsernames) {
    const created = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        passwordHash: await argon2.hash('fieldguide123'),
        role: 'user'
      }
    });
    userIds.set(username, created.id);
    await prisma.userSettings.create({
      data: {
        userId: created.id,
        displayName: 'Mila Petrova',
        language: 'bg',
        contentLanguageMode: 'dual',
        vibePreset: 'field_notes',
        fontFamily: '"Manrope", "Helvetica Neue", sans-serif',
        fontScale: 'md',
        imageMode: 'on',
        themeMode: 'light',
        contentMode: 'standard',
        newsletterEnabled: false,
        askAiEnabled: true,
        protectedModeEnabled: true
      }
    });
  }

  for (const source of DEMO_SOURCES) {
    await prisma.source.create({
      data: {
        id: source.id,
        name: source.name,
        slug: source.slug,
        iconUrl: source.iconUrl,
        siteUrl: source.siteUrl,
        description: source.description,
        language: source.language,
        defaultAudience: source.defaultAudience,
        sourceType: source.sourceType,
        status: source.status,
        feeds: {
          create: {
            kind: source.kind,
            feedUrl: source.feedUrl
          }
        }
      }
    });
  }

  for (const item of DEMO_ITEMS) {
    await prisma.contentItem.create({
      data: {
        id: item.id,
        slug: item.slug,
        kind: item.kind,
        sourceId: item.sourceId,
        authorId: item.authorUsername ? userIds.get(item.authorUsername) : null,
        publishedAt: new Date(item.publishedAt),
        originalTitle: item.originalTitle,
        originalSummary: item.originalSummary,
        bodyMarkdown: item.bodyMarkdown,
        coverImageUrl: item.coverImageUrl,
        externalUrl: item.externalUrl,
        youtubeVideoId: item.youtubeVideoId,
        subject: item.subject,
        audience: item.audience,
        commentsLocked: item.commentsLocked,
        hiddenByDefault: item.hiddenByDefault,
        pinned: item.pinned,
        translations: {
          create: item.translations.map((translation) => ({
            language: translation.language,
            title: translation.title,
            summary: translation.summary,
            slug: translation.slug
          }))
        },
        tags: {
          create: item.tags.map((tag) => ({
            label: tag.label,
            type: tag.type,
            value: tag.value
          }))
        }
      }
    });
  }

  for (const comment of DEMO_COMMENTS) {
    await prisma.comment.create({
      data: {
        id: comment.id,
        itemId: comment.itemId,
        authorId: userIds.get(comment.authorUsername)!,
        body: comment.body,
        createdAt: new Date(comment.createdAt),
        editedAt: comment.editedAt ? new Date(comment.editedAt) : null,
        deletedAt: comment.deletedAt ? new Date(comment.deletedAt) : null,
        moderationNote: comment.moderationNote
      }
    });
  }

  for (const album of DEMO_ALBUMS) {
    await prisma.album.create({
      data: {
        id: album.id,
        ownerId: userIds.get(album.ownerUsername)!,
        title: album.title,
        description: album.description,
        coverItemId: album.coverItemId
      }
    });
    for (const [position, itemId] of album.itemIds.entries()) {
      await prisma.albumItem.create({
        data: {
          albumId: album.id,
          itemId,
          position
        }
      });
    }
  }

  for (const submission of DEMO_SUBMISSIONS) {
    await prisma.submission.create({
      data: {
        id: submission.id,
        type: submission.type,
        title: submission.title,
        sourceUrl: submission.sourceUrl,
        body: submission.body,
        submittedById: userIds.get(submission.submittedBy)!,
        status: submission.status,
        createdAt: new Date(submission.createdAt)
      }
    });
  }

  for (const event of DEMO_ERROR_LOGS) {
    await prisma.systemErrorEvent.create({
      data: {
        id: event.id,
        scope: event.scope,
        message: event.message,
        level: event.level,
        createdAt: new Date(event.createdAt),
        resolvedAt: event.resolvedAt ? new Date(event.resolvedAt) : null
      }
    });
  }

  for (const usage of DEMO_AI_USAGE) {
    await prisma.aiUsageLedger.create({
      data: {
        provider: usage.provider,
        model: usage.model,
        purpose: usage.purpose,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalCostUsd: usage.totalCostUsd,
        createdAt: new Date(usage.createdAt)
      }
    });
  }

  for (const pin of DEMO_PINNED_ITEMS) {
    await prisma.pinnedSlot.create({
      data: {
        feed: pin.feed,
        slot: pin.slot,
        itemId: pin.itemId
      }
    });
  }

  await prisma.aiConfig.create({
    data: {
      id: 1,
      provider: DEMO_AI_CONFIG.provider,
      summaryModel: DEMO_AI_CONFIG.summaryModel,
      translationModel: DEMO_AI_CONFIG.translationModel,
      askModel: DEMO_AI_CONFIG.askModel,
      newsletterModel: DEMO_AI_CONFIG.newsletterModel,
      monthlyBudgetUsd: DEMO_AI_CONFIG.monthlyBudgetUsd,
      perJobBudgetUsd: DEMO_AI_CONFIG.perJobBudgetUsd,
      autoDowngrade: DEMO_AI_CONFIG.autoDowngrade,
      pauseOnBudgetExceeded: DEMO_AI_CONFIG.pauseOnBudgetExceeded
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
