'use client';

import { useState } from 'react';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';

import type { ContentMode } from '@edu-feed/shared';

import { useSwitchContentModeMutation } from '../lib/api';
import { useSessionViewer } from '../lib/session';

export function ProtectedModeCard({ currentMode }: { currentMode: ContentMode }) {
  const { viewer, isAuthenticated, refetch } = useSessionViewer();
  const [nextMode, setNextMode] = useState<ContentMode>(viewer.contentMode || currentMode);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [switchContentMode, switchState] = useSwitchContentModeMutation();

  const handleSwitch = async () => {
    if (!isAuthenticated) {
      setMessage({ type: 'error', text: 'Login is required before switching protected content modes.' });
      return;
    }
    if ((nextMode !== 'standard' || viewer.contentMode !== 'standard') && (!password.trim() || password.trim().length < 8)) {
      setMessage({ type: 'error', text: 'Re-enter the account password to switch Kid or Adult mode.' });
      return;
    }
    try {
      const result = await switchContentMode({
        nextMode,
        password: password.trim() || undefined
      }).unwrap();
      await refetch();
      setPassword('');
      setMessage({ type: 'success', text: `Protected mode switched to ${result.nextMode}.` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Protected mode verification failed.'
      });
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h5">Protected content modes</Typography>
          <Typography variant="body2" color="text.secondary">
            Kid and Adult modes are behind password verification. Signed-out visitors stay in Standard mode.
          </Typography>
          <TextField
            select
            label="Next mode"
            value={nextMode}
            onChange={(event) => setNextMode(event.target.value as ContentMode)}
          >
            <MenuItem value="kid">Kid</MenuItem>
            <MenuItem value="standard">Standard</MenuItem>
            <MenuItem value="adult">Adult</MenuItem>
          </TextField>
          <TextField
            label="Account password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button variant="contained" onClick={handleSwitch}>
            {switchState.isLoading ? 'Verifying...' : 'Verify and switch'}
          </Button>
          {message ? <Alert severity={message.type}>{message.text}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
