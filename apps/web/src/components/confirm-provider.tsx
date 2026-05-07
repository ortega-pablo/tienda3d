'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/ui/confirm-dialog';

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * Renders a single ConfirmDialog instance and exposes useConfirm() which
 * returns a Promise<boolean>. Multiple call sites share this dialog; concurrent
 * calls would queue (last-one-wins for now — uncommon in practice).
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    if (!pending) return;
    pending.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending != null}
        title={pending?.opts.title ?? ''}
        description={pending?.opts.description}
        confirmLabel={pending?.opts.confirmLabel}
        cancelLabel={pending?.opts.cancelLabel}
        variant={pending?.opts.variant}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Hook to imperatively ask the user to confirm an action. Replaces
 * `window.confirm()`. Resolves to `true` if confirmed, `false` otherwise.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: '¿Eliminar?', variant: 'destructive' })) { ... }
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a <ConfirmProvider>');
  }
  return ctx;
}
