import type { ContentItem, SubjectTag } from '@edu-feed/shared';

export type RelatedCandidate = {
  item: ContentItem;
  sourceSubjects: SubjectTag[];
};

export type ScoredRelatedCandidate = RelatedCandidate & {
  score: number;
};

function sharedValues(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => rightSet.has(value)))];
}

function contentTagValues(item: ContentItem) {
  return item.tags
    .filter((tag) => tag.type !== 'audience' && tag.type !== 'subject')
    .map((tag) => tag.value);
}

function recencyScore(target: ContentItem, candidate: ContentItem) {
  const deltaMs = Math.abs(new Date(target.publishedAt).getTime() - new Date(candidate.publishedAt).getTime());
  const deltaDays = deltaMs / (1000 * 60 * 60 * 24);
  if (deltaDays <= 7) return 8;
  if (deltaDays <= 30) return 6;
  if (deltaDays <= 90) return 4;
  if (deltaDays <= 365) return 2;
  return 0;
}

function scoreRelatedCandidate(target: RelatedCandidate, candidate: RelatedCandidate) {
  if (target.item.id === candidate.item.id) return 0;

  const sharedSubjects = sharedValues(target.item.subjects, candidate.item.subjects);
  const sharedTags = sharedValues(contentTagValues(target.item), contentTagValues(candidate.item));
  const sharedSourceSubjects = sharedValues(target.sourceSubjects, candidate.sourceSubjects);

  let score = 0;
  if (candidate.item.subject === target.item.subject) score += 30;
  score += sharedSubjects.length * 18;
  score += sharedTags.length * 12;
  score += sharedSourceSubjects.length * 6;
  if (candidate.item.sourceId === target.item.sourceId) score += 16;
  if (candidate.item.kind === target.item.kind) score += 5;
  if (candidate.item.authorUsername && candidate.item.authorUsername === target.item.authorUsername) score += 6;
  if (candidate.item.subjects.includes('community') && target.item.subjects.includes('community')) score += 8;
  score += recencyScore(target.item, candidate.item);

  return score;
}

export function rankRelatedItems(target: RelatedCandidate, candidates: RelatedCandidate[]) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreRelatedCandidate(target, candidate)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const publishedDelta = new Date(right.item.publishedAt).getTime() - new Date(left.item.publishedAt).getTime();
      if (publishedDelta !== 0) return publishedDelta;
      return left.item.originalTitle.localeCompare(right.item.originalTitle);
    });
}
