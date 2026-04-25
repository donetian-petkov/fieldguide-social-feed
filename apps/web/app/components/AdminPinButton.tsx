'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import { Button, Menu, MenuItem, Snackbar, type ButtonProps } from '@mui/material';

import { usePatchAdminItemMutation, usePinAdminItemMutation } from '../lib/api';

export function AdminPinButton({
  itemId,
  pinned,
  size = 'medium',
  fullWidth = false
}: {
  itemId: string;
  pinned: boolean;
  size?: ButtonProps['size'];
  fullWidth?: boolean;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pinnedState, setPinnedState] = useState(pinned);
  const [pinItem, pinState] = usePinAdminItemMutation();
  const [patchItem, patchState] = usePatchAdminItemMutation();
  const open = Boolean(anchorEl);
  const busy = pinState.isLoading || patchState.isLoading;

  useEffect(() => {
    setPinnedState(pinned);
  }, [pinned]);

  const closeMenu = () => {
    setAnchorEl(null);
  };

  async function handlePin(slot: number) {
    closeMenu();
    try {
      await pinItem({ itemId, slot }).unwrap();
      setPinnedState(true);
      setToast(`Pinned to slot ${slot + 1}.`);
    } catch {
      setToast('Could not pin the item.');
    }
  }

  async function handleUnpin() {
    closeMenu();
    try {
      await patchItem({
        itemId,
        patch: {
          pinned: false
        }
      }).unwrap();
      setPinnedState(false);
      setToast('Item removed from the pinned rail.');
    } catch {
      setToast('Could not unpin the item.');
    }
  }

  return (
    <>
      <Button
        startIcon={<PushPinRoundedIcon />}
        variant={pinnedState ? 'contained' : 'outlined'}
        color={pinnedState ? 'secondary' : 'primary'}
        size={size}
        fullWidth={fullWidth}
        disabled={busy}
        onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
      >
        {busy ? 'Saving...' : pinnedState ? 'Pinned' : 'Pin'}
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={closeMenu}>
        <MenuItem onClick={() => void handlePin(0)}>Pin to slot 1</MenuItem>
        <MenuItem onClick={() => void handlePin(1)}>Pin to slot 2</MenuItem>
        <MenuItem onClick={() => void handlePin(2)}>Pin to slot 3</MenuItem>
        {pinnedState ? <MenuItem onClick={() => void handleUnpin()}>Unpin</MenuItem> : null}
      </Menu>
      <Snackbar open={!!toast} autoHideDuration={2600} onClose={() => setToast(null)} message={toast || ''} />
    </>
  );
}
