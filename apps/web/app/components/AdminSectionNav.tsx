'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Button } from '@mui/material';

import { ADMIN_NAV_ITEMS, isAdminNavActive } from '../lib/admin-nav';

export function AdminSectionNav() {
  const pathname = usePathname();

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
      {ADMIN_NAV_ITEMS.map((item) => (
        <Button
          key={item.href}
          component={Link}
          href={item.href}
          variant={isAdminNavActive(pathname, item.href) ? 'contained' : 'outlined'}
          size="small"
        >
          {item.label}
        </Button>
      ))}
    </Box>
  );
}
