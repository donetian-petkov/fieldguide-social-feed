'use client';

import { FeedScreen } from '../../components/FeedScreen';
import { getFeedModel, normalizeFeedSegment } from '../../lib/demo';

export default function SubjectFeedPage({ params }: { params: { subject: string } }) {
  const feed = normalizeFeedSegment(params.subject);
  const model = getFeedModel(feed);

  return (
    <FeedScreen
      feed={model.feed}
      title={model.title}
      subtitle={model.subtitle}
      viewer={model.viewer}
      savedIds={model.savedIds}
      items={model.items}
      pinnedItems={model.pinnedItems}
    />
  );
}
