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
      language={model.language}
      languageMode={model.viewer.contentLanguageMode}
      imageMode={model.viewer.imageMode}
      items={model.items}
      pinnedItems={[]}
    />
  );
}
