import type { AudienceLabel } from '@edu-feed/shared';

export type RankingTag = {
  type: string;
  value: string;
};

export type RankingSignalItem = {
  id: string;
  subject: string;
  tags: RankingTag[];
};

export type ViewedRankingSignalItem = RankingSignalItem & {
  viewCount: number;
};

export type RankingCandidate = RankingSignalItem & {
  audience: AudienceLabel;
  publishedAt: Date;
};

export function isEligibleForMode(item: RankingCandidate, mode: 'kid' | 'standard' | 'adult') {
  const flags = item.tags.filter((tag) => tag.type === 'flag').map((tag) => tag.value);
  if (mode === 'adult') {
    return true;
  }
  if (mode === 'standard') {
    return item.audience !== 'adult_only';
  }
  if (item.audience !== 'kid_safe') {
    return false;
  }
  return !flags.some((flag) => ['nsfw', 'gore', 'spoiler'].includes(flag));
}

export function preferenceKeysForItem(item: Pick<RankingSignalItem, 'subject' | 'tags'>) {
  return [
    `subject:${item.subject}`,
    ...item.tags.filter((tag) => tag.type !== 'audience').map((tag) => `tag:${tag.type}:${tag.value}`)
  ];
}

export function buildPreferenceWeights(input: {
  saved: RankingSignalItem[];
  viewed: ViewedRankingSignalItem[];
  hidden: RankingSignalItem[];
}) {
  const weights = new Map<string, number>();

  const addWeightedPreferences = (item: Pick<RankingSignalItem, 'subject' | 'tags'>, weight: number) => {
    for (const key of preferenceKeysForItem(item)) {
      weights.set(key, (weights.get(key) || 0) + weight);
    }
  };

  for (const item of input.saved) {
    addWeightedPreferences(item, 4);
  }

  for (const item of input.viewed) {
    addWeightedPreferences(item, Math.max(1, item.viewCount) * 2);
  }

  for (const item of input.hidden) {
    addWeightedPreferences(item, -3);
  }

  return weights;
}

export function scoreItemFromPreferences(
  weights: Map<string, number>,
  item: Pick<RankingSignalItem, 'subject' | 'tags'>
) {
  return preferenceKeysForItem(item).reduce((total, key) => total + (weights.get(key) || 0), 0);
}

export function rankNewsletterCandidates<T extends RankingCandidate>(input: {
  candidates: T[];
  saved: RankingSignalItem[];
  viewed: ViewedRankingSignalItem[];
  hidden: RankingSignalItem[];
  deliveredIds: string[];
  mode: 'kid' | 'standard' | 'adult';
}): T[] {
  const hiddenIds = new Set(input.hidden.map((entry) => entry.id));
  const deliveredIds = new Set(input.deliveredIds);
  const savedIds = new Set(input.saved.map((entry) => entry.id));
  const viewedIds = new Set(input.viewed.map((entry) => entry.id));
  const preferenceWeights = buildPreferenceWeights({
    saved: input.saved,
    viewed: input.viewed,
    hidden: input.hidden
  });

  return input.candidates
    .filter((item) => !hiddenIds.has(item.id) && !deliveredIds.has(item.id) && !savedIds.has(item.id) && !viewedIds.has(item.id))
    .filter((item) => isEligibleForMode(item, input.mode))
    .sort((left, right) => {
      const leftWeight = scoreItemFromPreferences(preferenceWeights, left);
      const rightWeight = scoreItemFromPreferences(preferenceWeights, right);
      if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
      }
      return right.publishedAt.getTime() - left.publishedAt.getTime();
    });
}

export function mergeSelectedCandidates<T extends { id: string }>(input: {
  candidates: T[];
  selectedIds: string[];
  limit: number;
}) {
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const id of input.selectedIds) {
    const candidate = byId.get(id);
    if (!candidate || seen.has(id)) continue;
    merged.push(candidate);
    seen.add(id);
    if (merged.length >= input.limit) {
      return merged;
    }
  }

  for (const candidate of input.candidates) {
    if (seen.has(candidate.id)) continue;
    merged.push(candidate);
    seen.add(candidate.id);
    if (merged.length >= input.limit) {
      break;
    }
  }

  return merged;
}
