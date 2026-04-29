export const QUEUES = {
  ingestion: 'ingestion',
  aiEnrichment: 'ai-enrichment',
  newsletter: 'newsletter',
  generatedStory: 'generated-story'
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type IngestionJobPayload = {
  sourceId: string;
  feedUrl: string;
};

export type AiEnrichmentJobPayload = {
  itemId: string;
  contentHash?: string;
  tasks: Array<'summary' | 'translation' | 'classification'>;
};

export type NewsletterJobPayload = {
  username: string;
  mode: 'weekly' | 'daily';
};

export type GeneratedStoryJobPayload = {
  draftId: string;
};
