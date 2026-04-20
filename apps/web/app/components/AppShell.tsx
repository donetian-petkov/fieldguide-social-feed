'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import Link from 'next/link';
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

import type { UserSettingsDto } from '@edu-feed/shared';

const DRAWER_WIDTH = 280;

export function AppShell({
  title,
  subtitle,
  viewer,
  children
}: PropsWithChildren<{ title: string; subtitle: string; viewer: UserSettingsDto }>) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?') setHelpOpen(true);
      if (event.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navItems = [
    { href: '/feed/history', label: 'Main feed', icon: <AutoAwesomeRoundedIcon /> },
    { href: '/saved', label: 'Saved', icon: <BookmarkRoundedIcon /> },
    { href: '/community', label: 'Community', icon: <ForumRoundedIcon /> },
    { href: '/profile/alex', label: 'Profile', icon: <PersonRoundedIcon /> },
    { href: '/settings', label: 'Settings', icon: <SettingsRoundedIcon /> },
    { href: '/admin', label: 'Admin', icon: <ShieldRoundedIcon /> }
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
          <ListItemButton component={Link} href={item.href} key={item.href} onClick={() => setDrawerOpen(false)}>
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: 'auto', borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
        <Typography variant="subtitle2">{viewer.displayName}</Typography>
        <Typography variant="body2" color="text.secondary">
          {viewer.username} • {viewer.role}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Mode: {viewer.contentMode}
        </Typography>
        <Button startIcon={<LogoutRoundedIcon />} variant="outlined" fullWidth sx={{ mt: 2 }}>
          Logout
        </Button>
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(12px)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <IconButton edge="start" onClick={() => setDrawerOpen(true)}>
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
            <Typography variant="body2">`A` focus Ask AI on the current item</Typography>
            <Typography variant="body2">`Esc` close overlays</Typography>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
