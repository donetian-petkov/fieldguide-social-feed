'use client';

import { startTransition, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';

import type { ContentItem, InterfaceLanguage } from '@edu-feed/shared';
import { resolveTranslation } from '@edu-feed/shared';

import { useAskAiMutation, useRuntimeHealthQuery } from '../lib/api';
import { useSessionViewer } from '../lib/session';

export function AskAiCard({ item, language }: { item: ContentItem; language: InterfaceLanguage }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [askAi, askAiState] = useAskAiMutation();
  const healthQuery = useRuntimeHealthQuery();
  const { isAuthenticated, viewer } = useSessionViewer();
  const translation = resolveTranslation(item, language);
  const aiAvailable = Boolean(healthQuery.data?.aiAvailable);

  if (!aiAvailable) {
    return null;
  }

  const handleAsk = async () => {
    if (!question.trim()) return;
    if (isAuthenticated && !viewer.askAiEnabled) {
      setErrorMessage(language === 'bg' ? 'Ask-AI е изключен в настройките ти.' : 'Ask-AI is disabled in your settings.');
      return;
    }
    setErrorMessage(null);
    try {
      const result = await askAi({
        itemId: item.id,
        question,
        language
      }).unwrap();
      startTransition(() => {
        setAnswer(result.answer);
      });
    } catch (error) {
      const fallbackAnswer =
        language === 'bg'
          ? `Започни с източника "${translation?.title}". Потърси автора, вида доказателства и какви музеи, архиви или свързани теми можеш да сравниш после.`
          : `Start with the source context for "${translation?.title}". Look at the author, the type of evidence used, and which museums, archives, or related works could deepen your research next.`;
      setAnswer(fallbackAnswer);
      setErrorMessage(error instanceof Error ? error.message : 'Ask-AI request failed. Using fallback guidance.');
    }
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
            inputProps={{ 'data-ask-ai-input': 'true' }}
            disabled={isAuthenticated && !viewer.askAiEnabled}
          />
          <Button variant="contained" onClick={handleAsk} disabled={askAiState.isLoading || (isAuthenticated && !viewer.askAiEnabled)}>
            {askAiState.isLoading ? 'Thinking...' : 'Ask'}
          </Button>
          {isAuthenticated && !viewer.askAiEnabled ? (
            <Alert severity="info">
              {language === 'bg' ? 'Включи Ask-AI от настройките, за да задаваш въпроси.' : 'Enable Ask-AI in settings to ask questions.'}
            </Alert>
          ) : null}
          {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}
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
