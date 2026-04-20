'use client';

import { startTransition, useState } from 'react';
import { Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';

import type { ContentItem, InterfaceLanguage } from '@edu-feed/shared';
import { resolveTranslation } from '@edu-feed/shared';

export function AskAiCard({ item, language }: { item: ContentItem; language: InterfaceLanguage }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const translation = resolveTranslation(item, language);

  const handleAsk = () => {
    if (!question.trim()) return;
    setLoading(true);
    startTransition(() => {
      const nextAnswer =
        language === 'bg'
          ? `Започни с източника "${translation?.title}". Потърси автора, вида доказателства и какви музеи, архиви или свързани теми можеш да сравниш после.`
          : `Start with the source context for "${translation?.title}". Look at the author, the type of evidence used, and which museums, archives, or related works could deepen your research next.`;
      setAnswer(nextAnswer);
      setLoading(false);
    });
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6">Ask AI</Typography>
          <Typography variant="body2" color="text.secondary">
            {language === 'bg'
              ? 'Отговорите остават фокусирани върху конкретния материал.'
              : 'Replies stay scoped to the current article or video.'}
          </Typography>
          <TextField
            multiline
            minRows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={language === 'bg' ? 'Например: Какви източници да потърся след това?' : 'For example: Which sources should I read next?'}
          />
          <Button variant="contained" onClick={handleAsk} disabled={loading}>
            {loading ? 'Thinking...' : 'Ask'}
          </Button>
          {answer ? (
            <Typography variant="body2" color="text.secondary">
              {answer}
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
