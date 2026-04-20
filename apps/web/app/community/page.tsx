'use client';

import { FeedScreen } from '../components/FeedScreen';
import { getFeedModel } from '../lib/demo';

export default function CommunityPage() {
  const model = getFeedModel('community');

  return (
    <FeedScreen
      feed={model.feed}
      title={model.title}
      subtitle="Approved community links and essays stay separate from the curated editorial source feeds."
      viewer={model.viewer}
      items={model.items}
      pinnedItems={[]}
    />
  );
}
