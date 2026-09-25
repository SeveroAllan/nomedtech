import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius)] text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none active:scale-[0.99] shadow-control',
  {
    variants: {
      variant: {
        default:
          'bg-ds-ink text-ds-white hover:opacity-95',
        destructive:
          'bg-ds-red text-ds-white hover:bg-[var(--ds-hover-red)]',
        outline:
          'border border-ds-hairline bg-ds-white text-ds-ink hover:bg-[var(--ds-hover)]',
        secondary:
          'bg-ds-raised text-ds-ink hover:bg-[var(--ds-hover)]',
        ghost:
          'hover:bg-[var(--ds-hover)] text-ds-ink-2 hover:text-ds-ink shadow-none',
        link:
          'text-ds-ink underline-offset-4 hover:underline p-0 h-auto shadow-none',
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        sm: 'h-9 px-3.5',
        lg: 'h-12 px-6 text-sm',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
