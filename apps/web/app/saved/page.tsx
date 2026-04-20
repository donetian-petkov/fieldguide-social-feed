'use client';

import { FeedScreen } from '../components/FeedScreen';
import { getFeedModel } from '../lib/demo';

export default function SavedPage() {
  const model = getFeedModel('saved');

  return (
    <FeedScreen
      feed={model.feed}
      title={model.title}
      subtitle="Everything you bookmarked plus anything tucked into your custom albums."
      viewer={model.viewer}
      items={model.items}
      pinnedItems={[]}
    />
  );
}
