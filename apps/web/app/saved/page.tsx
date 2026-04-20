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
      language={model.language}
      languageMode={model.viewer.contentLanguageMode}
      imageMode={model.viewer.imageMode}
      items={model.items}
      pinnedItems={[]}
    />
  );
}
