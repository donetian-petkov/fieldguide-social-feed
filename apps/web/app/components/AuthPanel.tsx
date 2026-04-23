'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardContent, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';

import {
  useForgotPasswordMutation,
  useLoginMutation,
  useRegisterMutation,
  useResetPasswordMutation
} from '../lib/api';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [messageSeverity, setMessageSeverity] = useState<'error' | 'info' | 'success'>('info');
  const [login, loginState] = useLoginMutation();
  const [register, registerState] = useRegisterMutation();
  const [forgotPassword, forgotPasswordState] = useForgotPasswordMutation();
  const [resetPassword, resetPasswordState] = useResetPasswordMutation();

  const handleSubmit = async () => {
    setMessage(null);
    try {
      if (mode === 'login') {
        await login({ username, password }).unwrap();
        router.push('/feed/history');
        router.refresh();
        return;
      }

      if (mode === 'register') {
        await register({ username, password, displayName }).unwrap();
        router.push('/feed/history');
        router.refresh();
        return;
      }

      if (mode === 'forgot') {
        const result = await forgotPassword({ identifier }).unwrap();
        setMessageSeverity('info');
        setMessage(
          result.previewToken
            ? `Reset token generated: ${result.previewToken}`
            : 'If the account exists, a reset email was queued.'
        );
        return;
      }

      await resetPassword({ token: resetToken, password }).unwrap();
      setMode('login');
      setResetToken('');
      setMessageSeverity('success');
      setMessage('Password updated. Sign in with the new password.');
    } catch (error) {
      setMessageSeverity('error');
      const messageText =
        error instanceof Error ? error.message : mode === 'forgot' || mode === 'reset' ? 'Password recovery request failed.' : 'Authentication request failed.';
      setMessage(messageText);
    }
  };

  const busy =
    loginState.isLoading || registerState.isLoading || forgotPasswordState.isLoading || resetPasswordState.isLoading;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h4">Account access</Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to save items, use protected Kid or Adult modes, comment, submit community content, and access admin tools.
          </Typography>
          <Tabs value={mode} onChange={(_event, nextValue: AuthMode) => setMode(nextValue)} variant="scrollable" allowScrollButtonsMobile>
            <Tab label="Login" value="login" />
            <Tab label="Register" value="register" />
            <Tab label="Forgot" value="forgot" />
            <Tab label="Reset" value="reset" />
          </Tabs>

          {mode === 'login' || mode === 'register' ? (
            <>
              <TextField label="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
              {mode === 'register' ? (
                <TextField label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              ) : null}
              <TextField type="password" label="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </>
          ) : null}

          {mode === 'forgot' ? (
            <TextField
              label="Username or email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              helperText="If the account exists, a reset email will be sent."
            />
          ) : null}

          {mode === 'reset' ? (
            <>
              <TextField
                label="Reset token"
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                helperText="Use the reset token from your email."
              />
              <TextField type="password" label="New password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </>
          ) : null}

          <Button variant="contained" onClick={handleSubmit} disabled={busy}>
            {busy
              ? 'Working...'
              : mode === 'login'
                ? 'Login'
                : mode === 'register'
                  ? 'Register'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : 'Reset password'}
          </Button>
          {message ? <Alert severity={messageSeverity}>{message}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
