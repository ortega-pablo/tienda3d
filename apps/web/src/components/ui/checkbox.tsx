'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    return (
      <label
        htmlFor={inputId}
        className={cn(
          'inline-flex select-none items-center gap-2 text-sm',
          props.disabled && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <span className="relative flex h-4 w-4 items-center justify-center">
          <input
            id={inputId}
            ref={ref}
            type="checkbox"
            className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-input bg-background checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            {...props}
          />
          <Check className="pointer-events-none absolute h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100" />
        </span>
        {label && <span>{label}</span>}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
