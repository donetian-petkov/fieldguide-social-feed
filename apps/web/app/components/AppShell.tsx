'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography
} from '@mui/material';

import type { SubjectFeed, UserSettingsDto } from '@edu-feed/shared';

import { useLogoutMutation, useRuntimeHealthQuery } from '../lib/api';
import { ADMIN_NAV_ITEMS, isAdminNavActive } from '../lib/admin-nav';
import { FEED_ORDER, normalizeFeedSegment } from '../lib/demo';
import { useSessionViewer } from '../lib/session';

const DRAWER_WIDTH = 280;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function currentFeedFromPathname(pathname: string): SubjectFeed {
  if (pathname === '/saved') return 'saved';
  if (pathname === '/community') return 'community';
  if (pathname.startsWith('/feed/')) {
    return normalizeFeedSegment(pathname.split('/')[2]);
  }
  return 'history';
}

export function AppShell({
  title,
  subtitle,
  viewer,
  children,
  onRefresh
}: PropsWithChildren<{ title: string; subtitle: string; viewer: UserSettingsDto; onRefresh?: () => void }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { viewer: resolvedViewer, isAuthenticated } = useSessionViewer(viewer);
  const healthQuery = useRuntimeHealthQuery();
  const [logout, logoutState] = useLogoutMutation();
  const aiAvailable = Boolean(healthQuery.data?.aiAvailable);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'Escape') {
        setHelpOpen(false);
        setDrawerOpen(false);
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        if (onRefresh) {
          onRefresh();
          return;
        }
        router.refresh();
        return;
      }
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        router.push('/saved');
        return;
      }
      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        router.push('/community');
        return;
      }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const currentFeed = currentFeedFromPathname(pathname);
        const currentIndex = FEED_ORDER.indexOf(currentFeed);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex =
          event.key === '['
            ? (safeIndex - 1 + FEED_ORDER.length) % FEED_ORDER.length
            : (safeIndex + 1) % FEED_ORDER.length;
        const targetFeed = FEED_ORDER[nextIndex] || 'history';
        if (targetFeed === 'saved') {
          router.push('/saved');
          return;
        }
        if (targetFeed === 'community') {
          router.push('/community');
          return;
        }
        router.push(`/feed/${targetFeed}`);
        return;
      }
      if (event.key === 'a' || event.key === 'A') {
        if (!aiAvailable) {
          return;
        }
        event.preventDefault();
        const visibleInput = document.querySelector('[data-ask-ai-input]') as HTMLElement | null;
        if (visibleInput) {
          visibleInput.focus();
          visibleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const toggle = document.querySelector('[data-ask-ai-toggle]') as HTMLElement | null;
        if (toggle) {
          toggle.click();
          toggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aiAvailable, onRefresh, pathname, router]);

  const navItems = [
    { href: '/feed/history', label: 'Main feed', icon: <AutoAwesomeRoundedIcon /> },
    { href: '/saved', label: 'Saved', icon: <BookmarkRoundedIcon /> },
    { href: '/community', label: 'Community', icon: <ForumRoundedIcon /> },
    ...(isAuthenticated ? [{ href: `/profile/${resolvedViewer.username}`, label: 'Profile', icon: <PersonRoundedIcon /> }] : []),
    { href: '/settings', label: 'Settings', icon: <SettingsRoundedIcon /> },
    ...(!isAuthenticated ? [{ href: '/auth', label: 'Login', icon: <PersonRoundedIcon /> }] : [])
  ];

  const drawer = (
    <Stack sx={{ height: '100%', p: 2 }} spacing={2}>
      <Box>
        <Typography variant="h5">Fieldguide</Typography>
        <Typography variant="body2" color="text.secondary">
          Educational scrolling for history, art, books, movies, photography, nature, and country knowledge.
        </Typography>
      </Box>
      <List sx={{ px: 0 }}>
        {navItems.map((item) => (
          <ListItemButton
            component={Link}
            href={item.href}
            key={item.href}
            onClick={() => setDrawerOpen(false)}
            selected={pathname === item.href}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      {isAuthenticated && resolvedViewer.role === 'admin' ? (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 2 }}>
            Admin Tools
          </Typography>
          <List sx={{ px: 0 }}>
            {ADMIN_NAV_ITEMS.map((item) => (
              <ListItemButton
                component={Link}
                href={item.href}
                key={item.href}
                onClick={() => setDrawerOpen(false)}
                selected={isAdminNavActive(pathname, item.href)}
              >
                <ListItemIcon>
                  <ShieldRoundedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={item.label} secondary={item.description} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      ) : null}
      <Box sx={{ mt: 'auto', borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
        <Typography variant="subtitle2">{isAuthenticated ? resolvedViewer.displayName : 'Guest visitor'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {isAuthenticated ? `${resolvedViewer.username} • ${resolvedViewer.role}` : 'Signed out'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Mode: {resolvedViewer.contentMode}
        </Typography>
        {isAuthenticated ? (
          <Button
            startIcon={<LogoutRoundedIcon />}
            variant="outlined"
            fullWidth
            sx={{ mt: 2 }}
            disabled={logoutState.isLoading}
            onClick={async () => {
              await logout().unwrap().catch(() => undefined);
              router.push('/auth');
              router.refresh();
            }}
          >
            Logout
          </Button>
        ) : (
          <Button component={Link} href="/auth" variant="contained" fullWidth sx={{ mt: 2 }}>
            Login / Register
          </Button>
        )}
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(12px)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <IconButton edge="start" aria-label="Open navigation menu" onClick={() => setDrawerOpen(true)}>
            <MenuRoundedIcon />
          </IconButton>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" noWrap>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {subtitle}
            </Typography>
          </Stack>
          <Button variant="outlined" onClick={() => setHelpOpen(true)}>
            Help
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
      >
        {drawer}
      </Drawer>

      <Box component="main" sx={{ width: '100%', pt: 12, px: { xs: 2, md: 4 }, pb: 6 }}>
        <Box sx={{ width: '100%', maxWidth: 'var(--page-max-width)', mx: 'auto' }}>{children}</Box>
      </Box>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2">`?` open help</Typography>
            <Typography variant="body2">`R` refresh feed</Typography>
            <Typography variant="body2">`T` scroll to top</Typography>
            <Typography variant="body2">`[` and `]` switch subject feeds</Typography>
            <Typography variant="body2">`S` open saved feed</Typography>
            <Typography variant="body2">`C` open community feed</Typography>
            {aiAvailable ? <Typography variant="body2">`A` focus Ask AI on the current item</Typography> : null}
            <Typography variant="body2">`Esc` close overlays</Typography>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
