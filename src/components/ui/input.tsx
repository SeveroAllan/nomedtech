import * as React from 'react';
import { cn } from './button';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-[var(--radius)] border border-[#e5e5e5] bg-white px-3.5 py-2 text-sm text-ds-ink placeholder:text-ds-ink-4 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:border-[#737373] caret-ds-ink selection:bg-[#e5e5e5] selection:text-ds-ink disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-control',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
