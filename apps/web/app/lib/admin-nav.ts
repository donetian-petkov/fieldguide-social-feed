export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: '/admin',
    label: 'Overview',
    description: 'Dashboard and quick entry points'
  },
  {
    href: '/admin/sources',
    label: 'Sources',
    description: 'Manage feeds, pause sources, and queue resyncs'
  },
  {
    href: '/admin/moderation',
    label: 'Moderation',
    description: 'Review submissions, lock comments, pin or remove items'
  },
  {
    href: '/admin/users',
    label: 'Users',
    description: 'Change roles and suspend or restore accounts'
  },
  {
    href: '/admin/ai',
    label: 'AI',
    description: 'Provider, models, budgets, and draft generation'
  },
  {
    href: '/admin/logs',
    label: 'Logs',
    description: 'Review backend and integration failures'
  }
];

export function isAdminNavActive(pathname: string, href: string) {
  return href === '/admin' ? pathname === href : pathname.startsWith(href);
}
