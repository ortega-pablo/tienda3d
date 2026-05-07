'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/handle-error';

export interface EditModeApi {
  /** Whether the form is in editable state. */
  editing: boolean;
  /** Whether a save is currently in flight. */
  saving: boolean;
  /** Switch the form to editable. */
  start: () => void;
  /**
   * Cancel editing. Receives a callback to reset form values to their original
   * snapshot — the caller controls the form state, this hook just signals.
   */
  cancel: (resetForm?: () => void) => void;
  /**
   * Wraps an async action: sets `saving=true`, surfaces success/error, and
   * leaves edit mode on success. Returns the action's resolved value when
   * successful, or `null` on error (caught + toasted).
   */
  save: <T>(handler: () => Promise<T>, opts?: { successMessage?: string }) => Promise<T | null>;
}

/**
 * Standard edit-mode plumbing for forms that toggle between read-only and
 * editable states. The hook does NOT own form values — the caller's `useState`
 * does that. We just track edit/save state and centralize the success/error
 * feedback so every form behaves the same way.
 *
 *   const editMode = useEditMode();
 *   <Input disabled={!editMode.editing} ... />
 *   editMode.save(async () => { await api.patch(...) }, { successMessage: 'Guardado' });
 */
export function useEditMode(initialEditing = false): EditModeApi {
  const [editing, setEditing] = useState(initialEditing);
  const [saving, setSaving] = useState(false);

  const start = useCallback(() => setEditing(true), []);
  const cancel = useCallback((resetForm?: () => void) => {
    resetForm?.();
    setEditing(false);
  }, []);

  const save = useCallback(
    async <T>(
      handler: () => Promise<T>,
      opts?: { successMessage?: string },
    ): Promise<T | null> => {
      setSaving(true);
      try {
        const result = await handler();
        if (opts?.successMessage) toast.success(opts.successMessage);
        setEditing(false);
        return result;
      } catch (err) {
        handleApiError(err);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { editing, saving, start, cancel, save };
}
