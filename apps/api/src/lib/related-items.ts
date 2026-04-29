import type { ContentItem, SubjectTag } from '@edu-feed/shared';

export type RelatedCandidate = {
  item: ContentItem;
  sourceSubjects: SubjectTag[];
};

export type ScoredRelatedCandidate = RelatedCandidate & {
  score: number;
};

const GENERIC_META_TAG_VALUES = new Set([
  'rss',
  'atom',
  'feed',
  'custom',
  'imported',
  'ingested',
  'youtube',
  'editorial',
  'community'
]);

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'into',
  'over',
  'when',
  'what',
  'which',
  'their',
  'there',
  'about',
  'after',
  'before',
  'under',
  'story',
  'article',
  'video',
  'news',
  'история',
  'статия',
  'новина',
  'видео',
  'как',
  'за',
  'със',
  'през',
  'към',
  'след',
  'преди',
  'това'
]);

function sharedValues(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => rightSet.has(value)))];
}

function normalizeTextValue(value: string) {
  return value.trim().toLowerCase();
}

function contentTagValues(item: ContentItem) {
  return item.tags
    .filter((tag) => tag.type !== 'audience' && tag.type !== 'subject')
    .map((tag) => normalizeTextValue(tag.value))
    .filter((value) => value.length >= 4 && !GENERIC_META_TAG_VALUES.has(value));
}

function tokenize(text: string) {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(tokens.filter((token) => token.length >= 4 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)))];
}

function keywordValues(item: ContentItem) {
  return tokenize(`${item.originalTitle} ${item.originalSummary}`);
}

function recencyScore(target: ContentItem, candidate: ContentItem) {
  const deltaMs = Math.abs(new Date(target.publishedAt).getTime() - new Date(candidate.publishedAt).getTime());
  const deltaDays = deltaMs / (1000 * 60 * 60 * 24);
  if (deltaDays <= 7) return 6;
  if (deltaDays <= 30) return 4;
  if (deltaDays <= 90) return 2;
  if (deltaDays <= 365) return 1;
  return 0;
}

function scoreRelatedCandidate(target: RelatedCandidate, candidate: RelatedCandidate) {
  if (target.item.id === candidate.item.id) return 0;

  const sharedSubjects = sharedValues(target.item.subjects, candidate.item.subjects);
  const sharedTags = sharedValues(contentTagValues(target.item), contentTagValues(candidate.item));
  const sharedSourceSubjects = sharedValues(target.sourceSubjects, candidate.sourceSubjects);
  const sharedKeywords = sharedValues(keywordValues(target.item), keywordValues(candidate.item));
  const samePrimarySubject = candidate.item.subject === target.item.subject;
  const sameSource = candidate.item.sourceId === target.item.sourceId;
  const sameAuthor = candidate.item.authorUsername && candidate.item.authorUsername === target.item.authorUsername;
  const bothCommunity = candidate.item.subjects.includes('community') && target.item.subjects.includes('community');

  const strongEnough =
    Boolean(sameAuthor) ||
    sharedTags.length >= 2 ||
    sharedKeywords.length >= 3 ||
    (samePrimarySubject && (sharedTags.length >= 1 || sharedKeywords.length >= 2)) ||
    (sameSource && sharedKeywords.length >= 1) ||
    (bothCommunity && (sharedTags.length >= 1 || sharedKeywords.length >= 1));
  if (!strongEnough) {
    return 0;
  }

  let score = 0;
  if (samePrimarySubject) score += 22;
  score += sharedSubjects.length * 12;
  score += sharedTags.length * 16;
  score += Math.min(sharedKeywords.length, 5) * 10;
  score += sharedSourceSubjects.length * 3;
  if (sameSource) score += 10;
  if (candidate.item.kind === target.item.kind) score += 5;
  if (sameAuthor) score += 12;
  if (bothCommunity) score += 6;
  score += recencyScore(target.item, candidate.item);

  return score;
}

export function rankRelatedItems(target: RelatedCandidate, candidates: RelatedCandidate[]) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreRelatedCandidate(target, candidate)
    }))
    .filter((candidate) => candidate.score >= 35)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const publishedDelta = new Date(right.item.publishedAt).getTime() - new Date(left.item.publishedAt).getTime();
      if (publishedDelta !== 0) return publishedDelta;
      return left.item.originalTitle.localeCompare(right.item.originalTitle);
    });
}
