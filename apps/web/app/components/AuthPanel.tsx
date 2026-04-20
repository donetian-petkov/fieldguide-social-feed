'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardContent, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';

import { useLoginMutation, useRegisterMutation } from '../lib/api';

type AuthMode = 'login' | 'register';

export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('alex');
  const [displayName, setDisplayName] = useState('Alex Marin');
  const [password, setPassword] = useState('fieldguide123');
  const [message, setMessage] = useState<string | null>(null);
  const [login, loginState] = useLoginMutation();
  const [register, registerState] = useRegisterMutation();

  const handleSubmit = async () => {
    setMessage(null);
    try {
      if (mode === 'login') {
        await login({ username, password }).unwrap();
      } else {
        await register({ username, password, displayName }).unwrap();
      }
      router.push('/feed/history');
      router.refresh();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Authentication request failed.';
      setMessage(messageText);
    }
  };

  const busy = loginState.isLoading || registerState.isLoading;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h4">Account access</Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to save items, use protected Kid or Adult modes, comment, submit community content, and access admin tools.
          </Typography>
          <Tabs value={mode} onChange={(_event, nextValue: AuthMode) => setMode(nextValue)}>
            <Tab label="Login" value="login" />
            <Tab label="Register" value="register" />
          </Tabs>
          <TextField label="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
          {mode === 'register' ? (
            <TextField label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          ) : null}
          <TextField type="password" label="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button variant="contained" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Working...' : mode === 'login' ? 'Login' : 'Register'}
          </Button>
          {message ? <Alert severity="error">{message}</Alert> : null}
          <Alert severity="info">
            Demo credentials: `alex / fieldguide123` or `admin / fieldguide123`.
          </Alert>
        </Stack>
      </CardContent>
    </Card>
  );
}
