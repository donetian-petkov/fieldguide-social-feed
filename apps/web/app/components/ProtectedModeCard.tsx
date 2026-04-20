'use client';

import { useState } from 'react';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';

import type { ContentMode } from '@edu-feed/shared';

export function ProtectedModeCard({ currentMode }: { currentMode: ContentMode }) {
  const [nextMode, setNextMode] = useState<ContentMode>(currentMode);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const handleSwitch = () => {
    if (!password.trim() || password.trim().length < 8) {
      setMessage('Re-enter the account password to switch Kid or Adult mode.');
      return;
    }
    setMessage(`Protected mode verified. The next content mode would switch to ${nextMode}.`);
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
            Verify and switch
          </Button>
          {message ? <Alert severity="info">{message}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
