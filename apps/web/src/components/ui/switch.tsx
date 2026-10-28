'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
}

/** Interruptor de encendido/apagado (`role="switch"`), por ejemplo "Visible en la tienda". */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, label, className, disabled, id, ...props }, ref) => {
    const reactId = React.useId();
    const switchId = id ?? reactId;
    return (
      <span
        className={cn(
          'inline-flex select-none items-center gap-2 text-sm',
          disabled && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <button
          ref={ref}
          id={switchId}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onCheckedChange(!checked)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed',
            checked ? 'bg-primary' : 'bg-input',
          )}
          {...props}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none block h-5 w-5 rounded-full bg-background shadow transition-transform',
              checked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
        {label && <label htmlFor={switchId}>{label}</label>}
      </span>
    );
  },
);
Switch.displayName = 'Switch';
