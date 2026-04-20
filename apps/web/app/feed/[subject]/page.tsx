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
      language={model.language}
      languageMode={model.viewer.contentLanguageMode}
      imageMode={model.viewer.imageMode}
      items={model.items}
      pinnedItems={model.pinnedItems}
    />
  );
}
